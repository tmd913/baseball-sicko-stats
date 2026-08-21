---
name: sicko-theming
description: The palette as a set of tokens and the six color schemes (Dark and Light off VS Code's defaults, Midnight, Lavender, Maroon, Powder Blue), the picker in the settings menu, how a theme is expressed as token blocks on html[data-theme], the measured contrast and ΔE figures behind every value, the paint-ahead localStorage mirror and the boot script. Use when editing theme.ts or ThemePicker.tsx, when adding a color scheme or a palette token, when a color fails contrast or two marks are too close, or when touching color values in styles.css.
---

# Themes

A theme is a **palette, not a stylesheet**: `styles.css` opens with a `:root`
block of tokens and closes with blocks redeclaring the same names against
`html[data-theme='…']`. Nothing else in ~14,000 lines of stylesheet knows there
is more than one.

Every value in every palette is **measured** — contrast against the ground it
sits on, and ΔE2000 against the marks it must not be confused with. Adding or
moving a color means taking those measurements, not picking one.

## What to read

- **Read `docs/claude/theming.md`** before adding a theme, adding or renaming a
  palette token, or changing any color value in `styles.css`. It covers: what a
  theme costs end to end; the 88 hard-coded tints that had to become
  `color-mix()` before a second theme was possible, and the dozen hexes that
  became named tokens; each of the six palettes and the measurements behind it;
  the three things a theme is allowed to move (`--win`, `--logo-plate`,
  `--row-alt`); why a cap logo needs its own ground; the ombré rules and why the
  header gradient must go through `--cell-bg`; the preference, the paint-ahead
  `localStorage` mirror, the boot script and `html { background: none }`; the
  `theme-color` tag that paints the two strips iOS puts above and below the page,
  and why it takes no `media` attribute; and the picker.

## Related

`sicko-client` for the settings menu the picker sits in and the write queue it
saves through. `sicko-dialogs` for the popover it opens in.
