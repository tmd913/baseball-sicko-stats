---
name: sicko-research
description: The research board — the whole league over a season or a window, its 39-44 columns and their picker, the sort, the include buttons and the watchlist star, the padlock and news marks, the position row and what a fantasy position means, the window tabs, the stat filter builder, the turn filter that narrows the pitching board to the men starting on chosen days, percentile rank badges, paging, the board's own Schedule view, and the bar itself — up to four rows the reader arranges, with the rest behind the gear. Use when editing ResearchTable.tsx, ResearchLayout.tsx, researchColumns.tsx, ColumnPicker.tsx, columnRanks.tsx, TurnPicker.tsx, LockMark.tsx or NewsMark.tsx; when adding a stat column; or when the board's sort, filters, pinned columns or scroll reset behave wrongly; or when changing what is on its bar.
---

# The research board

The app's widest table: the whole league, up to 44 columns, read to decide
whether to pick a stranger up. It needs no roster and is the one tab a new user
can use. Its column vocabulary (`researchColumns.tsx`) is **shared with the
player page's Stats tab**, and its picker (`ColumnPicker.tsx`) and rank badges
(`columnRanks.tsx`) are shared components — a change to any of the three reaches
both surfaces.

This is the largest reference in the repo and the densest. Read it before
touching the board; several of its rules are the record of a reversal.

## What to read

- **Read `docs/claude/client-research.md`** before editing `ResearchTable.tsx`,
  `ResearchLayout.tsx`, `researchColumns.tsx`, `ColumnPicker.tsx`, `columnRanks.tsx` or
  `TurnPicker.tsx`, before adding
  or reordering a column, and before changing anything about the board's
  controls. It covers: **the bar as an arrangement the reader
  owns** — up to four rows, which control is on which and in what order, the
  condensed run's own order, the per-control icon-or-word switch, and what is
  left behind the gear (`ResearchLayout.tsx`, `UserPrefs.researchControls`);
  the sticky name and sorted columns and the derived
  `--research-pin-left`; the sort, its reserved arrow box and its reset rule;
  paging at 50 rows; the three include buttons as a partition of ownership and
  the watchlist unioned on top; the roster baseball, the padlock and the news
  mark, and when each suppresses itself; the position row and ESPN eligibility;
  the window tabs; the column picker's press-and-press reorder; `DEFAULT_OFF`;
  the filter builder; the turn filter (`Starting` — the pitching board's day
  strip, the `Start` column it splices in, and `turn=`); the percentile rank
  badges and their population; and every empty state naming its own cause.

## Related

`sicko-roster` shares the row geometry and the identity block.
`sicko-player-page` draws the same columns transposed onto one player.
`sicko-espn` supplies roster %, eligibility and the ownership map.
