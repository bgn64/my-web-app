import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";

const fields = ["provider", "external_id", "name", "location", "city", "state", "country", "latitude", "longitude", "catalog_metadata"];
const metadataFields = ["type", "phone", "website", "year_built", "address", "postal_code", "architect", "osm_id"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;

export function validateCatalog(value) {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.courses) ||
      !object(value.provenance) || value.provenance.records !== value.courses.length ||
      !["source", "revision", "source_sha256", "attribution", "license", "license_url", "copyright_url"]
        .every((key) => nonempty(value.provenance[key]))) {
    throw new Error("Invalid catalog document or provenance.");
  }
  const identities = new Set();
  return value.courses.map((course, index) => {
    const fail = () => { throw new Error(`Invalid or duplicate catalog course at entry ${index + 1}.`); };
    if (!object(course) || Object.keys(course).some((key) => !fields.includes(key)) ||
        fields.some((key) => !Object.hasOwn(course, key)) ||
        course.provider !== "opengolf" || typeof course.external_id !== "string" || !uuid.test(course.external_id) ||
        !nonempty(course.name) || !nonempty(course.location) ||
        ["city", "state", "country"].some((key) => course[key] !== null && !nonempty(course[key])) ||
        [["latitude", 90], ["longitude", 180]].some(([key, bound]) =>
          course[key] !== null && (typeof course[key] !== "number" || !Number.isFinite(course[key]) || Math.abs(course[key]) > bound)) ||
        !object(course.catalog_metadata) || Object.entries(course.catalog_metadata).some(([key, item]) =>
          !metadataFields.includes(key) || (item !== null && typeof item !== "string"))) fail();
    const external_id = course.external_id.toLowerCase();
    if (identities.has(external_id)) fail();
    identities.add(external_id);
    return { ...course, external_id };
  });
}

export async function importCatalog(pool, document) {
  const courses = validateCatalog(document);
  const counts = { inserted: 0, updated: 0, unchanged: 0 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(928332)");
    for (let offset = 0; offset < courses.length; offset += 250) {
      const batch = courses.slice(offset, offset + 250);
      const existing = await client.query(
        `SELECT provider, external_id::text, name, location, city, state, country, latitude, longitude, catalog_metadata
         FROM courses WHERE provider = 'opengolf' AND external_id = ANY($1::uuid[]) FOR UPDATE`,
        [batch.map((course) => course.external_id)],
      );
      const byIdentity = new Map(existing.rows.map((course) => [course.external_id, course]));
      const changed = batch.filter((course) => {
        const old = byIdentity.get(course.external_id);
        if (isDeepStrictEqual(old, course)) { counts.unchanged++; return false; }
        counts[old ? "updated" : "inserted"]++;
        return true;
      });
      if (!changed.length) continue;
      await client.query(
        `INSERT INTO courses (${fields.join(", ")})
         SELECT ${fields.join(", ")} FROM jsonb_to_recordset($1::jsonb) AS input(
           provider text, external_id uuid, name text, location text, city text, state text, country text,
           latitude double precision, longitude double precision, catalog_metadata jsonb)
         ON CONFLICT (provider, external_id) DO UPDATE SET
           name = EXCLUDED.name, location = EXCLUDED.location, city = EXCLUDED.city,
           state = EXCLUDED.state, country = EXCLUDED.country, latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude, catalog_metadata = EXCLUDED.catalog_metadata`,
        [JSON.stringify(changed)],
      );
    }
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = new pg.Pool();
  pool.on("error", (error) => { console.error("Catalog database connection error:", error); process.exitCode = 1; });
  try {
    for (const key of ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
      if (!process.env[key]) throw new Error(`Missing database environment variable: ${key}`);
    }
    const document = JSON.parse(await readFile(new URL("../data/course-catalog.json", import.meta.url), "utf8"));
    console.log("Course catalog imported:", await importCatalog(pool, document));
  } catch (error) {
    console.error("Course catalog import failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
