---
name: sicko-player-page
description: The player page (PlayerDetails) — the full-screen overlay that opens on anybody, its pinned head and nine-tab strip, and every tab: Overview (his day, next game, projected starts, news, last five games), Schedule (his upcoming games, or a starter's projected starts), Percentile Rankings, Splits, News, Stats, Game Log, Charts. Also the reorder screen, the how-to page, and DetailsShell — the overlay shell this page shares with the team page. Use when editing PlayerDetails.tsx, PlayerOverview.tsx, PlayerSchedule.tsx, GameLog.tsx, PlatoonSplits.tsx, RollingXwoba.tsx, PlayerWindowTable.tsx, PlayerNews.tsx, PlayerOrderEditor.tsx or Tutorial.tsx; when a tab's lazy read hangs, or a chart's labels, axes or geometry are wrong.
---

# The player page

A fixed full-screen overlay that **opens on anybody** — a roster row, a feed
item, a research-board row of a man nobody has rostered — which is the fact most
of its design follows from. It has its own pinned chrome (`--details-chrome-h`,
measured), its own scroll reset per tab, and nine tabs whose reads are all
lazy.

Three references, split by what the tab is *about*.

## What to read

- **Read `docs/claude/client-player-page.md`** before editing
  `PlayerDetails.tsx`, `PlayerOverview.tsx`, `PlayerSchedule.tsx`,
  `PlayerOrderEditor.tsx` or `Tutorial.tsx`, or before changing the tab strip,
  the pinned head or a lazy tab read. It covers the overlay's shape; the head,
  its marks and the handedness token; **the lazy-read rule and the hang it
  fixed** (never mark a request answered before it is answered); the
  **Overview** tab — his day, the next game, Projected Starts and the lineup a
  row opens, the News preview, the season strip and the five-game preview — and
  the **Schedule** tab beside it, which is that question asked forwards: his
  club's next fortnight, or, for a rotation starter, the Projected Starts block
  itself.

- **Read `docs/claude/client-player-tabs.md`** before editing `PlayerNews.tsx`,
  `PlayerWindowTable.tsx`, `GameLog.tsx` or `RollingXwoba.tsx` — the **News**
  tab and the eleven dead-end endpoints behind it, the **Stats** tab (the
  research board transposed, with its own saved column set), the **Game Log**
  and the outing a pitcher's row opens, and **Charts**.

- **Read `docs/claude/client-player-splits.md`** before touching
  `PlatoonSplits.tsx` — the platoon comparison, its diverging bar, the measured
  `full` scale, and the five rounds of geometry that bar has taken. It is also
  drawn by the feed's Upcoming dialog, so a change reaches two surfaces.

## Related

`sicko-team-page` is the other page drawn on `DetailsShell` — read it before
changing anything the two share (the box, the pinned chrome, the tab strip, the
scroll reset, the Escape ladder), since a change there reaches both.
`sicko-research` owns the column vocabulary and picker the Stats tab shares.
`sicko-pitchers` for the outing page a Game Log row opens. `sicko-dialogs` for
the layer ladder every tab's popups sit on.
