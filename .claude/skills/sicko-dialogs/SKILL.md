---
name: sicko-dialogs
description: The app-wide popup rules — why details are popups rather than accordions, components/Modal.tsx and the DialogLayerContext layer ladder, what a popup must cover (inert background, focus in and out, and the one element an opaque box does not cover), why one press of Escape undoes exactly one thing, and why a dismissing press is spent rather than passed through. Use when editing Modal.tsx, InfoKey.tsx or useDismissable, when adding any dialog, popover or full-screen overlay, or when Escape closes too much, a press reaches behind a popup, or a background stays interactive.
---

# Popups, overlays and the Escape ladder

Every popup in the app rides on `components/Modal.tsx`, and the rules here are
app-wide rather than any one surface's. Most of them are the record of a bug
that shipped: Escape unwinding a whole ladder on one press, a tap reaching
behind a closing backdrop, an overlay opened from inside a dialog arriving
`inert` and unusable.

**Read the reference before adding any dialog**, and especially before giving
one a `z-index` by hand — the layer comes from context, not from a number.

## What to read

- **Read `docs/claude/client-dialogs.md`** before editing `Modal.tsx`,
  `InfoKey.tsx` or `hooks.ts`'s `useDismissable` / `useInertBackground` /
  `useOverlayFocus` / `answersEscape`, and before adding a popup of any kind. It
  covers: why an accordion became a popup and the two cases that stayed
  accordions; `DialogLayerContext` and how a host declares its own layer;
  `OVERLAYS` and `overlayAbove`; **why the stacking test alone was not enough**
  and the marked-event set that makes one press undo one thing; the inert
  background walk and why marks are recomputed rather than remembered; focus in
  and out; the backdrop's arm-on-`pointerdown`, dismiss-on-`click` rule and the
  swallowed click beside it; and `[inert] video`.

## Related

Every view skill — each surface's popups sit on this ladder.
