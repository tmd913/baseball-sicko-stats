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
 */
export function BackButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="details-back" onClick={onClose}>
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
