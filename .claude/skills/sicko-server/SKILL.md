---
name: sicko-server
description: The server — data sources and joins (MLB Stats API primary, Savant enrichment, the research board, percentiles, team hitting, league xwOBA) and every cache layer; the 3am ET baseball day and every API route; and the roster, watchlist, users, saved preferences, DynamoDB/file backends, Cognito sign-in and session handling. Use when editing anything in server/src, adding or changing a route, adding a stat or a cache blob, bumping a cache version, or touching store.ts, storage.ts, auth.ts, cognito.ts, auth.tsx or invite.ts.
---

# The server

Express 5 + TypeScript, ESM, run via `tsx`; the same app wrapped in
`serverless-http` for Lambda. Three references, split by what you are changing.

Before adding a stat or a source, note the repo's standing rule: **check that a
column comes back populated before asking for it.** Several upstreams accept a
selection and return an empty column, which compiles, fetches, joins and yields
a table of dashes.

## What to read

- **Read `docs/claude/data-sources.md`** before touching `savant.ts`,
  `mlbStats.ts`, `research.ts`, `statcastWindow.ts`, `percentiles.ts`,
  `teamHitting.ts`, `leagueWoba.ts`, `xwoba.ts`, `expectedStats.ts` or
  `armAngle.ts`, or before adding a stat, a leaderboard or a cache blob. It
  covers which source is primary and why the README is wrong; the join keys; the
  research board and its windows; how a window is summed a day at a time and why
  everything stored per day is a **count, never a rate**; handedness on the
  season roster; team hitting's nine cuts; the measured league xwOBA; **and the
  whole cache layout, including the version rule.** It also covers
  `revisions.ts` — official scoring moving days after the game, which games MLB
  says it moved, and why exactly two blobs are re-read for it.

- **Read `docs/claude/server.md`** before adding or changing a route, or
  touching `etDate.ts`, `schedule.ts`, `rotations.ts`, `gameLog.ts`, `stints.ts`,
  `nextGame.ts`, `news.ts`, `recentNews.ts`, `rotowire.ts`, `projectedStarts.ts`,
  `revisions.ts` or `warmer.ts`. It covers the 3am ET baseball day and why one module
  deliberately no longer reads it, every endpoint and what it answers, the
  rotation engine, and video resolution.

- **Read `docs/claude/auth-and-storage.md`** before touching `store.ts`,
  `storage.ts`, `auth.ts`, `cognito.ts`, `auth.tsx` or `invite.ts`, or before
  adding a saved preference. It covers the two per-user lists and why
  `/api/watchlist` keeps its name, the roster as a range of rosters, every
  `UserPrefs` entry and its update semantics, the DynamoDB and file backends and
  `mutate`'s conflict replay, and Cognito sign-in.

## Related

`sicko-espn` for `espn.ts`. `sicko-pitchers` for the pitcher pipeline.
`deploy` for infra and the CDK app.
