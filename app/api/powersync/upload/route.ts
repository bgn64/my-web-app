import { auth } from "../../../auth";
import { getDb } from "../../../db";
import { applyTodoChange, parseTodoBatch } from "../../../todos/todo-upload";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const appUrl = process.env.BETTER_AUTH_URL;

  if (!appUrl) {
    throw new Error("Missing BETTER_AUTH_URL.");
  }

  if (request.headers.get("origin") !== new URL(appUrl).origin) {
    return json({ error: "Origin is not allowed." }, 403);
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return json({ error: "You must be logged in." }, 401);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    return json({ error: "Request body must be valid JSON." }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("userId" in body) ||
    body.userId !== session.user.id
  ) {
    return json(
      { error: "Upload account does not match the session." },
      403,
    );
  }

  const batch = parseTodoBatch("batch" in body ? body.batch : undefined);

  if (!batch) {
    return json(
      {
        status: "rejected",
        message: "Expected a batch of todo PUT, PATCH, or DELETE operations with UUID IDs and valid title/completed fields.",
      },
      422,
    );
  }

  try {
    const client = await getDb().connect();

    try {
      await client.query("BEGIN");

      for (const entry of batch) {
        await applyTodoChange(client, entry);
      }

      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("PowerSync upload rollback failed:", rollbackError);
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PowerSync upload failed:", error);
    return json({ error: "Unable to apply changes. Please retry." }, 503);
  }

  return json({ status: "ok" });
}
