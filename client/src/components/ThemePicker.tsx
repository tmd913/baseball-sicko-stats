import { THEMES, type ThemeId } from '../theme';

/**
 * The row of color-scheme swatches, shared by the two places that offer one:
 * the settings popover and the invite page's onboarding flow.
 *
 * **It is shared rather than resembled**, which is this app's standing rule for
 * a control drawn twice (`DateControls`, `StartersToggle`, `PlayerIdentity`,
 * `ColumnPicker`): a second copy of six buttons and their swatch pills is a
 * second thing that will one day disagree with the first about what a theme
 * looks like — and a swatch's whole claim is that it *is* a picture of the
 * palette it selects, which a stale copy would quietly stop being.
 *
 * What is **not** shared is the heading above it, because the two surfaces
 * genuinely label things differently: the popover's is a `.settings-popover-label`
 * over a menu section, and the invite page's is the `.espn-label` its team
 * picker already uses. Each caller supplies its own, the way `PlayerIdentity`
 * takes its name line as `children`.
 *
 * **The role turns on where it is drawn**, and that is the one thing this
 * component cannot decide for itself. Inside the settings popover — which is a
 * `role="menu"` — a swatch is a `menuitemradio`; on a page, where there is no
 * menu, an orphaned `menuitemradio` is a lie about its container, so it is a
 * plain `radio` inside a `radiogroup`. Both say the same thing to a screen
 * reader: one question, one answer.
 */
export function ThemeSwatches({
  theme,
  onPick,
  /** True inside the settings popover, which is a `role="menu"` — see above. */
  inMenu = false,
}: {
  theme: ThemeId;
  onPick: (id: ThemeId) => void;
  inMenu?: boolean;
}) {
  return (
    <div
      className="theme-swatches"
      /* The group is the radio group; `inMenu` leaves it to the menu, whose own
         `role="menu"` is what the `menuitemradio`s belong to. */
      role={inMenu ? undefined : 'radiogroup'}
      aria-label={inMenu ? undefined : 'Color scheme'}
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`theme-swatch${theme === t.id ? ' active' : ''}`}
          role={inMenu ? 'menuitemradio' : 'radio'}
          aria-checked={theme === t.id}
          onClick={() => onPick(t.id)}
          title={t.hint}
        >
          {/* Three stops of the palette this button selects — inline styles off
              `theme.ts`, deliberately, since they are *another* theme's values
              and a token here would resolve to the palette in force and draw
              every swatch the same. */}
          <span className="theme-chips" aria-hidden="true">
            {t.swatch.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </span>
          <span className="theme-swatch-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
