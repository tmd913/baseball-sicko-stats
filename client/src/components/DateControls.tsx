import { DateRangePicker, numericRange, tightRange } from './DateRangePicker';

/**
 * The app's date controls, as two pieces: the button that discloses them and
 * the row it discloses.
 *
 * **Extracted when a second surface needed them**, which is the rule this
 * codebase applies to a control drawn twice: the matchup overlay's team pages
 * are the app's own roster table read for somebody else's team over a span the
 * reader picks, and a second implementation of "Today / Yesterday / a range"
 * beside the first is two controls that will one day disagree about what a
 * preset means. What each caller keeps is the *state* — which days, which
 * preset, and whether the row is open — because that is the only half the two
 * genuinely answer differently.
 *
 * The markup and the classes are unchanged, so every rule in `styles.css` that
 * decides how these read (the pills above 640, the `<select>` below it, the
 * bubble on the toggle's corner, `.app.date-open`'s own row) applies to both
 * callers by construction.
 */

/** One named span the presets row offers. */
export interface DatePreset {
  label: string;
  start: string;
  end: string;
}

export function DateToggle({
  open,
  onToggle,
  start,
  end,
  activePreset,
}: {
  open: boolean;
  onToggle: () => void;
  start: string;
  end: string;
  activePreset: string | null;
}) {
  return (
    <button
      type="button"
      className={`date-toggle${open ? ' active' : ''}`}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? 'Close date controls' : 'Change dates'}
      title={open ? 'Close dates' : 'Change dates'}
    >
      {/* 17px, the size every other icon button in the app draws at — it was
          15, which was fine beside a label and small once a phone made this
          button the glyph alone beside a 20px clipboard. */}
      <svg
        viewBox="0 0 24 24"
        width="17"
        height="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
      {/* The preset's own word while one is active, so it reads "Today" rather
          than today's date — that is what was picked, and it survives the date
          rolling over. A hand-picked range has no name and shows its numbers. */}
      <span className="date-toggle-label">{activePreset ?? numericRange(start, end)}</span>
      {/* What the label says once there is no room for a label. On a phone this
          button and the starters toggle beside it go to their icons — two
          squares where two words wouldn't fit — and this is the one of the pair
          that cannot simply lose its wording: the icon says "dates" and the page
          would then say nowhere at all *which* dates every number on it is drawn
          from. So the range rides on the corner of the glyph as a bubble.

          Numbers rather than the preset's word, always: "Today" is a label's
          worth of text and this is a badge on a 36px square, where 8/12 says the
          same thing in half the width and says it exactly. Rendered at every
          width and hidden by the stylesheet above 640, the way the date presets
          and their dropdown are already done. */}
      <span className="date-toggle-bubble">{tightRange(start, end)}</span>
    </button>
  );
}

/**
 * The presets and the range picker themselves. In the app they open as a
 * full-width row of the view bar, directly under the button that opened them —
 * a disclosure and the thing it discloses have to stay together, and following
 * the button down is the whole of that.
 */
export function DateRow({
  presets,
  activePreset,
  start,
  end,
  max,
  onPick,
  onRange,
}: {
  presets: DatePreset[];
  activePreset: string | null;
  start: string;
  end: string;
  max: string;
  /** A named span was chosen. The caller closes the row behind it, that being
   *  the errand the row was opened for — the range picker deliberately does
   *  not, its own popover needing the row to stay put. */
  onPick: (p: DatePreset) => void;
  onRange: (start: string, end: string) => void;
}) {
  return (
    <div className="date-control">
      <div className="date-row">
        {/* Desktop: a row of preset pills. On phones this row is hidden and
            the equivalent <select> below takes over (see styles.css). */}
        <div className="date-presets">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`date-preset${activePreset === p.label ? ' active' : ''}`}
              onClick={() => onPick(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Phone-only equivalent of the pill row. A custom range (no active
            preset) shows the disabled placeholder option. */}
        <select
          className="date-presets-select"
          value={activePreset ?? ''}
          onChange={(e) => {
            const p = presets.find((x) => x.label === e.target.value);
            if (p) onPick(p);
          }}
          aria-label="Date range preset"
        >
          <option value="" disabled>
            Custom range
          </option>
          {presets.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
        <DateRangePicker start={start} end={end} max={max} onChange={onRange} />
      </div>
    </div>
  );
}
