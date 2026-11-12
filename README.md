# Tee Time

A mobile-first golf scorecard built with Next.js, Better Auth, and PostgreSQL, using Tee Time's navy-and-mint Night styling.

## Setup

Install dependencies with `npm ci`. Configure PostgreSQL using `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`, and set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` for the application. Use a long, unique secret and set the URL to the application's actual origin. Then run:

```bash
npm run db:migrate
npm run dev
```

Alternatively, set `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` in a local `.env` file and run `docker compose up --build`. Compose runs migrations before starting the application. Existing todo data is not deleted by the golf migrations.

The migration seeds two **fictional** courses: Pine Hollow (9 holes) and Meadow Ridge (18 holes). Each hole has a par, handicap ranking, and yardages for three tees. Course editing is not included.

## Playing

Create an account or sign in, then use **Play** to select a course and start a round. A player can have one active round. Select any hole and score with plus/minus or the four quick scores: one under par, par, one over par, and two over par. The first plus starts at par; plus/minus can set scores from 1 to 99. **Clear score** leaves a hole blank. Changes are saved online; retry if a save fails. All tee yardages are shown without requiring a tee selection.

Scores and totals update immediately, and scoring and hole navigation remain available while saves run quietly in the background. Saves run one at a time, keeping only the latest pending score per hole. A failure pauses saving and shows Retry; edits remain visible and can still be changed. Retry saves the latest unsaved scores across all holes. Finishing waits for all scores to save; confirmed discarding waits for any in-flight save, then abandons queued edits and deletes the round. Leaving with unsaved changes prompts a warning. The queue is held in memory, not persisted for offline use.

Use the compact navigator beneath the scoring controls to move to the previous or next hole. Tap **Hole … of …** to open a hole picker showing each hole's par and score; select any hole to jump there. The picker opens as a bottom sheet on phones and a centered dialog on larger screens. Close it or press Escape to return without changing holes. Holes do not advance automatically, and you can move on without entering a score.

Finish a round even if some holes are blank, or discard an active round. Completed rounds are read-only and appear under **Rounds**. Partial-round totals and relative-to-par values include only scored holes. Round scorecards retain snapshots of course details from when the round started. Offline play, multiplayer, course management, and editing completed rounds are not included.

## Checks

Run `npm run lint`, `npm test`, and `npm run build`. The database test is skipped by default; to run it, migrate a dedicated test database, point the `PG*` variables at it, and set `FAIRWAY_TEST_DB=1` before running `npm test`. The test uses a transaction and rolls back its fixture data.
