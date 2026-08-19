---
name: sicko-feed
description: The Feed view — the roster's day as one chronological stream, its Live/Recent/Upcoming sections, the five item shapes and their rails, the base-event vocabulary, the plate-appearance card and its clip, the play-kind filter pills and the New watermark, and the Upcoming row's splits dialog. Use when editing LiveFeed.tsx, PlayerDay.tsx, PlateAppearanceCard.tsx, FeedFilters.tsx, BaseDiamond.tsx or ClipVideo.tsx; when a feed item's layout, grouping, clip or live pinning is wrong; or when adding a kind of play to the stream.
---

# The Feed view

The roster's day read **by clock**, where the summary table reads it as a
roster. One stream item is a completed plate appearance for a batter and a whole
outing for a pitcher, interleaved with base events. Five item shapes share one
rail device, and `playerDayEntries` is exported from `LiveFeed.tsx` so the
player page's Overview tab draws the *same* items — a change to an item shape
reaches both.

## What to read

- **Read `docs/claude/client-feed.md`** before editing `LiveFeed.tsx`,
  `PlayerDay.tsx`, `PlateAppearanceCard.tsx`, `FeedFilters.tsx` or
  `ClipVideo.tsx`. It covers: the three sections and what pins to Live; the five
  item shapes and their rails; the ten-kind base-event vocabulary and the four
  tones that paint it; the Upcoming row and why it lists games the player is
  actually in; the play-kind filter pills, the `Video` lens and the `New`
  watermark; the identity-row-is-not-a-box rule; and `detailInline`'s removal.

## Related

`sicko-pitchers` for what an outing item opens onto (`OutingPage`, the innings
and the arsenal). `sicko-dialogs` for the popups every item raises.
`sicko-player-page` draws these same items on its Overview tab.
