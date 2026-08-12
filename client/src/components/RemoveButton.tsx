/**
 * The ✕ that takes a player off the roster — shared by the reorder screen
 * and the details view, so the one destructive control in the app looks and
 * behaves the same wherever it turns up.
 *
 * Removal is two taps: the first arms the button into a red "Remove?", the
 * second commits. There is no undo, and in the editor the button sits on a row
 * you drag, where one stray tap shouldn't delete a player.
 *
 * Controlled rather than self-armed, because the editor keeps a single armed
 * row across the whole list — arming one row disarms the last.
 */
export function RemoveButton({
  name,
  armed,
  onArm,
  onRemove,
}: {
  name: string;
  armed: boolean;
  onArm: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className={`remove-btn${armed ? ' armed' : ''}`}
      // Pressing the button must never start a drag: in the editor the row's
      // own pointerdown would otherwise preventDefault the click away.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => (armed ? onRemove() : onArm())}
      title={`Remove ${name} from your roster`}
      aria-label={
        armed
          ? `Confirm removing ${name} from your roster`
          : `Remove ${name} from your roster`
      }
    >
      {armed ? (
        'Remove?'
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
    </button>
  );
}
