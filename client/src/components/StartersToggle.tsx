/**
 * **The `Starters` filter's button** — one control drawn in three places.
 *
 * It was inline in `App.tsx` while the roster row was its only home. A
 * matchup's team pages ask the same question of a leaguemate's lineup, and a
 * second button that merely resembled this one would be two controls that will
 * one day differ — the rule that pulled `DateControls` out of `App.tsx` when
 * those pages needed the dates.
 *
 * `.starters-toggle` is folded onto `.research-toggle`'s selector lists in the
 * stylesheet, so it is the app's plain toggle: `.on` and never `.active`, and
 * below 640px the label goes visually hidden and the glyph is the whole button.
 * The label stays in the DOM rather than being removed — a button whose only
 * content is an `aria-hidden` glyph has no accessible name at all.
 *
 * **The wording is the caller's**, because the reading genuinely differs: on
 * your own roster it is tonight's MLB lineup or your own fantasy one, and on a
 * team page it is a leaguemate's. The label cannot say which — it is one word,
 * and "Starters" is the right word for every reading of it.
 */
export function StartersToggle({
  on,
  title,
  onToggle,
}: {
  on: boolean;
  title: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`starters-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
      title={title}
    >
      {/* A lineup card, which is what the filter selects — the men written on
          it. It spans 3–21 across and 2–22 down of its own viewBox, a tall
          narrow outline carrying less weight than a wide one whatever its box
          says, and it carries `flex: none` in the stylesheet: an `<svg>` in a
          flex row is a flex item and its `width` is a basis it will shrink
          below the moment the line is tight, which on a button that is nothing
          but the glyph is the whole button. */}
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 5h3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3" />
        <path d="M7 12.5h10M7 17h6" />
      </svg>
      <span className="starters-toggle-label">Starters</span>
    </button>
  );
}
