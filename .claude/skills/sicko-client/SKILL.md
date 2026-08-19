---
name: sicko-client
description: The client shell every view sits in — App.tsx's URL-as-state, the roster and the watchlist, player keys, the pinned chrome and its measured height, the app's scroll behavior and per-page scroll memory, the loading system (WAIT_DELAY, MIN_SPIN, the spinning baseball), the kind tabs, the header search, the hide-injured filter, and the date controls. Use when editing App.tsx, hooks.ts, lib.ts, api.ts, PlayerAdder, Loading, DateControls or DateRangePicker; when adding a URL parameter or a saved preference; when a view flickers, blanks, restores its scroll wrongly, or the pinned bar wraps.
---

# The client shell

`App.tsx` holds all top-level state and persists it in the **URL query string**.
Three views sit in one shell — Roster, Feed, Research, plus League when a
fantasy league is connected — under a pinned chrome whose height is *measured*
at runtime (`--chrome-h`) rather than declared, because it wraps to two and
three rows and stands down entirely on short windows.

Read the reference before changing any of it. Nearly everything here has a
measurement behind it and several rules are the record of a bug that was shipped
once — the scroll restore, the loading discipline and the search fold in
particular.

## What to read

- **Read `docs/claude/client.md`** before editing `App.tsx`, `hooks.ts`,
  `lib.ts`, `api.ts`, `PlayerAdder.tsx`, `Loading.tsx` or `simulate.ts`, or
  before adding a URL param, a saved preference or a view. It covers: the two
  lists (roster vs watchlist) and which controls ask "is he on my roster *now*";
  player keys (`${kind}-${id}`, a two-way player is two entries); the three
  views and why a sort order is not a page; the pinned chrome and `--chrome-h`;
  per-page scroll memory and why restoring is one write before paint;
  `overscroll-behavior` and `touch-action`; the whole loading system; the kind
  tabs; the header search and `searchFold`; the hide-injured filter; and the
  `.xxx`-versus-percent rule.

- **Read `docs/claude/client-dates.md`** before touching `DateControls.tsx`,
  `DateRangePicker.tsx` or anything that reads `start`/`end`/`activePreset`. It
  covers the calendar button, the preset row, the picker, the component a
  matchup's team pages share with it, and **the range the Roster and the Feed
  each keep of their own** (`DateScope`).

## Related

`sicko-dialogs` for anything that opens a popup, `sicko-roster` /
`sicko-feed` / `sicko-research` / `sicko-league` for the views themselves, and
`sicko-theming` for palette tokens.
