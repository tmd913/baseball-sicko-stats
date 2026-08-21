import type { Ref } from 'react';

/**
 * **The way out of a full-screen page**, and the one control every overlay in
 * the app leaves by.
 *
 * There were five of these and they were not the same button. Four — the player
 * page, the how-to page, the ESPN league page and the highlight reel — carried
 * an inline SVG chevron copied between them, and the fifth, the matchup page,
 * carried the text `‹ Back` under the same class. Measured, that is a
 * **65.03 × 31** button beside an **80.08 × 34** one: a different width, and a
 * different *height*, the 18px icon's line box being taller than a text glyph's.
 * `.details-back`'s padding (`7px 14px 7px 10px`, less on the leading side) is
 * written for an icon, so the text one was also sitting in a box tuned for
 * something it hadn't got.
 *
 * Extracted rather than fixed in place, which is this codebase's standing rule
 * — the one that pulled `Modal` out of the Columns dialog and `InfoKey` out of
 * the Splits card: four copies of an eight-line path are four chances for the
 * next change to reach three of them.
 *
 * The chevron is the SVG rather than `‹` because it is `currentColor` at a
 * declared size, so it takes the button's own hover and cannot be a different
 * shape on a machine whose font renders that glyph differently.
 *
 * **`className` is the one thing a caller may vary, and it varies the shape
 * rather than the button.** The how-to page carries a second way out at the
 * foot of the screen — nine chapters being a long way from the head — and the
 * app already has a shape for that: `.float-btn.back-nav`, the fixed pill in
 * the bottom-left corner. Passing it here rather than copying the eight-line
 * path into `Tutorial.tsx` is the whole reason this file exists; a fifth copy
 * of the chevron would be the fifth chance for the next change to reach four.
 */
export function BackButton({
  onClose,
  className = 'details-back',
  ref,
}: {
  onClose: () => void;
  className?: string;
  /* React 19 passes `ref` as an ordinary prop, so no `forwardRef` wrapper. The
     how-to page holds one to measure the pill it renders — see
     `Tutorial.tsx::useFloatHeight`. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button type="button" className={className} onClick={onClose} ref={ref}>
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back
    </button>
  );
}
