---
name: sicko-roster
description: The Roster view — the summary table and its identity block, the headshot marks, the live-role color legend, the opponent cell, the Starters filter, the Schedule view (days ahead in place of stats), the Projected reading, and the full-page mode all three wide tables share. Use when editing SummaryTable.tsx, PlayerIdentity.tsx, PhotoStatus.tsx, schedule.tsx, ScheduleControl.tsx, StartersToggle.tsx or ExpandButton.tsx; when a table row height, column width, sticky column, bleed or seam is wrong; or when adding a column to the roster table.
---

# The Roster view

The summary table is one of the app's three wide tables and the one read *as a
roster*. Its geometry is measured to the pixel throughout — the 58px row off a
42px headshot, the pinned headshot column, `--table-bleed`, the seam cover down
each cell's left edge — and the reference records what each number is derived
from. Do not change a spacing value here without re-measuring the set.

## What to read

- **Read `docs/claude/client-summary.md`** before editing `SummaryTable.tsx` or
  any of the blocks it draws, before adding or reordering a column, and before
  changing any padding, gutter or row height on a wide table. It covers: the
  summary table's columns and the opponent cell in its three states; the shared
  `PlayerIdentity` block (cap logo, position, handedness) and `PhotoStatus`
  marks; the four live-role tints and the legend under the table; the sub-pixel
  seam cover and why it must go through `--cell-bg`; the `Starters` filter and
  how it projects days rather than rows; the **Schedule view**; the
  **Projected** reading and `/api/projection/roster`; and the full-page mode,
  `--table-bleed` and the sticky-column arithmetic shared with the other two
  wide tables.

## Related

`sicko-research` shares the row geometry, the identity block and the full-page
mode — a change to any of those three is usually a change to both tables.
`sicko-client` for the chrome above it and the date controls.
