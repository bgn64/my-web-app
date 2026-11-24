# Tee Time

A mobile-first golf scorecard built with Next.js, Better Auth, and PostgreSQL, using Tee Time's navy-and-mint Night styling.

## Application structure

Routes and their private UI live together under `app`; shared presentation is in `app/_components`.
`app/_features` owns authentication, course data and normalization, and round operations and scoring.
Shared database connectivity and ID parsing live in `app/_lib`. Server Actions delegate round work
to the rounds feature, while route handlers retain HTTP concerns. The existing `tests` directory
exercises these modules and route-local behavior.

## Setup

Copy [.env.example](./.env.example) to `.env`, fill in `PGPASSWORD` and a long, unique `BETTER_AUTH_SECRET`, and set `BETTER_AUTH_URL` to the application's actual origin. Keep `.env` out of version control. If updating an existing `.env`, use `PGPASSWORD` in place of `POSTGRES_PASSWORD`.

Keep `COMPOSE_FILE` and `COMPOSE_PATH_SEPARATOR` from the example. They let `APP_ENV` select the Compose override without `-f` flags: `development` publishes PostgreSQL on `127.0.0.1:5432`, while `production` (the default if `APP_ENV` is unset) leaves it reachable only on the Docker network.

### Local development

Run PostgreSQL in Docker and Next.js on your machine for Fast Refresh:

```bash
npm ci
docker compose up -d --wait db
docker compose run --rm --build migrate
docker compose run --rm migrate npm run catalog:import
npm run dev
```

Next.js reads `.env` directly and connects to PostgreSQL at `127.0.0.1:5432`. Compose uses the same database name, user, and password, but its services connect to `db:5432`. Run the migration command again after adding migrations. If you run migration or catalog npm scripts directly on the host instead, export the `PG*` variables first; those scripts don't load `.env` automatically.

### Full Docker stack

Set `APP_ENV=production` for deployments and run `docker compose up --build`. Compose runs schema migrations before starting the web app. Populate the catalog explicitly with `docker compose run --rm --build migrate npm run catalog:import`. `APP_ENV` controls development-only features separately from `NODE_ENV`; the web container still runs an optimized build.

Schema migrations create empty golf tables. The separate import command loads a frozen US catalog of **15,667 courses** from [data/course-catalog.json](./data/course-catalog.json), without requiring internet access. It validates the whole file and applies it transactionally, inserting missing courses and updating changed metadata by provider/external ID. Internal course IDs, cached scorecards, and round snapshots are preserved. Identical imports report unchanged entries; entries absent from the file are not deleted. Reimporting restores catalog metadata edited locally and reinserts entries deleted locally, without reconnecting historical rounds to newly inserted IDs. Course editing and automatic synchronization are not included.

**Existing databases:** Changing `PGDATABASE`, `PGUSER`, or `PGPASSWORD` does not rename the database or role or change the password in an initialized volume. If you need to keep your data, back it up and plan the database changes separately before switching settings. For disposable development data, use a fresh volume, then migrate and import. Removing the old volume deletes all local accounts and rounds; restarting or removing only its container does not. Do not run the rewritten golf migration history against a database that already ran the older migrations.

## Course data

### Sample courses for offline testing

After migrations, run `npm run catalog:sample` with the same `PG*` settings as `catalog:import`.
With Docker Compose, run `docker compose run --rm --build migrate npm run catalog:sample`.
In the course picker, search **Sample:** to find **Pine Hollow (9 holes)** and **Meadow Ridge (18 holes)**.
Both have complete scorecards with pars, handicap ranks, two tees, yardages, and ratings. Starting a round
on either course does not call OpenGolfAPI; the app still needs its local database.

The sample seed does not require the real catalog and can coexist with it. Rerunning the command keeps
existing sample scorecards and restores missing ones. It does not create accounts, rounds, or personal stats.

The database separates discovery (`courses`), reusable scorecard details (`course_scorecards`, `course_holes`, `course_tees`, `course_yardages`, `course_tee_ratings`), and played rounds (`golf_rounds`, `round_scores`). Catalog metadata owns course name/location; hydration never overwrites it. Physical tees share yardages across separate gender-specific rating records.

The course picker searches names and locations on the server, returning 50 entries per page. It displays only catalog metadata, never hole counts or cache status; catalog queries do not read reusable scorecards. Unreliable bulk hole counts are not imported. Browsing does not fetch details. **Start round** calls the centralized server-only `requireCourseScorecard` service, which fetches `https://api.opengolfapi.org/api/v1/courses/{id}` only when there is no successful cached scorecard.

Hydration requires a declared 9- or 18-hole layout with exactly one record for each expected hole number, valid pars, unique handicap ranks in the 1–18 range, and at least one tee with yardages for every hole. Valid integer hole numbers beyond the declared count are ignored with a recorded/logged warning, regardless of array order. Missing/duplicate expected holes and malformed hole numbers still fail; we do not blindly take the first array entries. Incomplete tees remain unavailable. Ratings, slopes, and descriptive/GPS information are optional; future features must check their own required capabilities. Conflicting course par is rejected; tee yardage totals are calculated from the holes, with upstream aggregate discrepancies logged. The original, unmodified detail response is retained in the reusable cache.

Successful details are stored atomically and cached indefinitely. Failures are **not cached**: retrying can immediately fetch again. Provider, validation, or persistence failures prevent round creation and show an explicit error. There is no scheduled refresh or cache expiry, and existing rounds never depend on the provider being online.

Starting a round copies course name/location and the complete normalized golf scorecard into an immutable, versioned JSONB snapshot on `golf_rounds`: all holes, physical tees (including unavailable tees and their available yardages), gender-specific ratings, colors, slopes, pars, and totals. Provider raw responses, diagnostics, timestamps, and additional catalog metadata are not copied. `round_scores` stores only each hole's mutable strokes. Round display reads the snapshot plus those scores, never live course details. Updating catalog metadata or reusable details cannot change an existing active/completed round. Deleting a course cascades its reusable details and sets historical round references to null; snapshots and scores survive. An explicit reusable-scorecard refresh feature is deferred.

### Catalog provenance and licensing

Contains data from **[OpenGolfAPI](https://opengolfapi.org)** and **[OpenStreetMap contributors](https://www.openstreetmap.org/copyright)**, licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Preserve attribution and review share-alike obligations before distributing a derived catalog database. Personal score data is separate from the catalog.

The JSON catalog records the original pinned CSV revision, source URL, SHA256, row count, and attribution/license in its provenance. The checksum identifies the original CSV, not the reshaped JSON. Deployment reads the checked-in JSON without downloading the CSV. Update the JSON and re-run the import command to apply reviewed catalog metadata changes; no data migration is required.

## Playing

Create an account or sign in, then use **Play** to select a course and start a round. A player can have one active round. Select any hole and score with plus/minus or the four quick scores: one under par, par, one over par, and two over par. The first plus starts at par; plus/minus can set scores from 1 to 99. **Clear score** leaves a hole blank. Changes are saved online; retry if a save fails. All tee yardages are shown without requiring a tee selection.

Scores and totals update immediately, and scoring and hole navigation remain available while saves run quietly in the background. Saves run one at a time, keeping only the latest pending score per hole. A failure pauses saving and shows Retry; edits remain visible and can still be changed. Retry saves the latest unsaved scores across all holes. Finishing waits for all scores to save; confirmed discarding waits for any in-flight save, then abandons queued edits and deletes the round. Leaving with unsaved changes prompts a warning. The queue is held in memory, not persisted for offline use.

Use the compact navigator beneath the scoring controls to move to the previous or next hole. Tap **Hole … of …** to open a hole picker showing each hole's par and score; select any hole to jump there. The picker opens as a bottom sheet on phones and a centered dialog on larger screens. Close it or press Escape to return without changing holes. Holes do not advance automatically, and you can move on without entering a score.

Finish a round even if some holes are blank, or discard an active round. Completed rounds are read-only and appear under **Rounds**. Partial-round totals and relative-to-par values include only scored holes. Round scorecards retain snapshots of course details from when the round started. Offline play, multiplayer, course management, and editing completed rounds are not included.

## Checks

Run `npm run lint`, `npm test`, and `npm run build`. Database tests are skipped by default; to run them, migrate a fresh dedicated test database, point the `PG*` variables at it, and set `FAIRWAY_TEST_DB=1` before running `npm test`. They create and clean up their own catalog/round fixtures and do not require the full catalog import. Persistence-failure tests temporarily add a database constraint or inject a failing write. Never point them at your development or production database. Automated hydration tests use controlled provider responses, not live API availability. Separately verify `catalog:import` against the test database to exercise the full checked-in catalog.
