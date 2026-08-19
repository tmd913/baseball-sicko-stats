---
name: sicko-pitchers
description: The pitcher side — the server pipeline (PitcherGame, per-game lines, decisions, holds, splits, season estimators FIP/xFIP/xERA), the outing page and its four tabs, the innings list and the inning popup, batters faced and the pitch sequence, the arsenal table, the two Arsenal-tab charts (Pitch Usage butterfly, Movement Profile dot cloud with its arm-angle mark), and the opposing-lineup table's nine cuts. Use when editing PitcherCard.tsx, Arsenal.tsx, ArsenalCharts.tsx, Innings.tsx, OutingPage.tsx, OpponentTable.tsx, PitchSequence.tsx, StrikeZone.tsx, or server-side pitcherArsenal.ts, pitchLeague.ts, armAngle.ts or leagueRates.ts.
---

# Pitchers

The roster holds both kinds, discriminated by `kind`, and the whole pipeline is
written so **batter code paths are untouched**: `PlayerGame` gained one optional
`pitching: PitcherGame | null` and every client component branches on
`report.kind === 'pitcher'`.

Two components — `PitcherCard.tsx` and `PlayerCard.tsx` — **render nowhere** and
are kept for their parts, which the feed and the player page import. Do not
delete them, and do not assume a component in them is live.

## What to read

- **Read `docs/claude/pitchers.md`** before editing any of the files above, and
  before changing anything about a pitcher's line, splits, arsenal or innings.
  It covers: the role (starter/reliever) and where it lives; the server pipeline
  and `FEED_CACHE_VERSION`'s history; decisions and the hold that exists nowhere
  else; the season estimators and their league constants; **`OutingPage`** and
  its `Line · Innings · Opponent · Arsenal` tabs, and which one it opens on;
  **the inning as a popup** and the rung that was given back; the arsenal table
  and its per-pitch-type delta directions; **the two Arsenal charts** — the
  usage butterfly, the movement cloud's one-dot-per-percent rule, the arm-angle
  mark and its press, and the label geometry; and the opposing-lineup table's
  nine cuts, spans and venues.

**No carets on collapsibles here or anywhere** — the bar is the affordance. This
keeps getting re-added; don't.

## Related

`sicko-feed` for the outing item that opens the page. `sicko-server` for
`teamHitting.ts`'s nine cuts and the data behind the estimators.
