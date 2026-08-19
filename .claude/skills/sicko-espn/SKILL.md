---
name: sicko-espn
description: The ESPN fantasy integration — reading a league with the user's cookies, the name-plus-team join, the scoring-period anchor derived from ESPN's calendar, a range as a range of rosters and lineups, the slot chip, the injury designation, connecting and sharing a league (the espn_s2 credential, the invite link, the nine routes), the per-player marks a league buys (roster %, eligibility, the padlock, the trend), and the league's own numbers (scoreboard, acquisitions, STAT_META, rankings, transactions, the projection engine). Use when editing espn.ts or projection.ts, EspnSettings.tsx or LeagueOnboarding.tsx, or when debugging ownership, lineups, periods or a 409 espn-auth.
---

# ESPN fantasy

There is no public API and no key: a private league is visible only to someone
signed in to it, so the app reads it with the user's own `SWID` and `espn_s2`
cookies. Almost every rule here is the record of a probe — endpoints that return
200 and ignore the parameter, fields that are null on every row, payloads 11×
larger than they need to be. **Read before probing anything; the dead ends are
written down so nobody repeats them.**

Four references.

## What to read

- **Read `docs/claude/espn.md`** first for anything touching `espn.ts` — reading
  a league, free agency as the complement of ownership, the name-plus-team join,
  which day's lineup and why the ownership read asks for tomorrow, **a range as
  a range of rosters and of lineups**, the slot chip and the injury badge, and
  **the scoring-period anchor derived from ESPN's calendar rather than our
  clock**.

- **Read `docs/claude/espn-connection.md`** for the `espn_s2` credential and how
  it is handled, the connect form, the nine routes, the invite link and why the
  code is stored rather than carried through the redirect, the onboarding page,
  and what naming a team for the first time does.

- **Read `docs/claude/espn-players.md`** for the per-player marks — roster %,
  position eligibility, the padlock and the five trend columns, all off one
  cookie-free player list.

- **Read `docs/claude/espn-scoreboard.md`** for the league's own numbers — the
  scoreboard and the day `cumulativeScore` leaves off, acquisitions, `STAT_META`
  and which side of the ball each stat is on, the matchup window, the Rankings
  spans, the transactions feed, and **the projection engine** (`projection.ts`).

## Related

`sicko-league` for the page these reads draw. `sicko-server` for `store.ts`,
where the credential lives.
