/**
 * The "give this table the screen" button, shared by the three wide tables.
 *
 * One component so the summary view, the research board and the game log offer
 * the same control in the same shape — each of them puts it in whatever row it
 * already has, rather than each growing a bar of its own for one button.
 *
 * It is an icon at every width: the four corner arrows are the universally
 * understood mark for this, and a word beside them would cost the research
 * board's tool row the wrap it is already close to. The label lives in the
 * `title` and the `aria-label`, both of which say which way the press goes —
 * "Exit" rather than "Enter" once you are in — since the icon alone leaves that
 * to be inferred from the arrows' direction.
 */
export function FullscreenButton({
  isFull,
  onToggle,
  what,
}: {
  isFull: boolean;
  onToggle: () => void;
  /** What the screen is being given to, for the tooltip: "table", "board". */
  what: string;
}) {
  const label = isFull ? 'Exit full screen' : `Full screen ${what}`;
  return (
    <button
      type="button"
      className={`fs-btn${isFull ? ' on' : ''}`}
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-pressed={isFull}
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {isFull ? (
          /* Arrows pointing in — the way out. */
          <>
            <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
          </>
        ) : (
          /* Arrows pointing out into the four corners. */
          <>
            <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
          </>
        )}
      </svg>
    </button>
  );
}
