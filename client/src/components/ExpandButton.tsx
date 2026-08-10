/**
 * The "give this table the page" button, shared by the three wide tables.
 *
 * It lives **in the table's own top-left header cell** — the one over the
 * headshots, which carries no text — rather than in a row above the table. Two
 * things follow from that, and both are the point: it costs the page no
 * vertical space at all, and that cell is the one pinned on *both* axes (the
 * header row sticks to the top, the headshot column to the left), so the way
 * back out is on screen wherever you have scrolled to.
 *
 * An icon at every width: a word here would set the width of a column that
 * exists to be narrow.
 */
export function ExpandButton({
  isFull,
  onToggle,
  what,
}: {
  isFull: boolean;
  onToggle: () => void;
  /** What is being expanded, for the tooltip: "table", "board", "log". */
  what: string;
}) {
  const label = isFull ? 'Exit full page' : `Full page ${what}`;
  return (
    <button
      type="button"
      className={`expand-btn${isFull ? ' on' : ''}`}
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-pressed={isFull}
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Arrows into the corners to expand, back out of them to collapse. */}
        {isFull ? (
          <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
        ) : (
          <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
        )}
      </svg>
    </button>
  );
}
