/**
 * The color scheme, and everything that has to know one exists.
 *
 * There are six, and they are **palettes rather than stylesheets**: `styles.css`
 * declares every color the app draws as a token on `:root`, and a theme is a
 * block that redeclares those tokens against `html[data-theme='…']`. No
 * component reads a theme, and nothing here knows a single class name.
 *
 * What this module owns is the three things a token block cannot do for itself:
 * which themes there are, how one gets onto the `<html>` element, and how the
 * choice survives a reload.
 */

export type ThemeId = 'midnight' | 'lavender' | 'maroon' | 'powder' | 'dark' | 'light';

/**
 * The one a reader who has never chosen gets.
 *
 * It is **`dark`**, and it is deliberately *not* the palette `:root` declares —
 * which is Midnight, and stays Midnight, that block being the app's original
 * and the base every other theme redeclares tokens against. The two used to be
 * the same thing, and `applyTheme` leaned on it: the default carried no
 * attribute at all, since a bare `:root` already *was* the default. It cannot
 * any more, so the attribute is stamped unconditionally — see there.
 *
 * Moving the default rather than moving the palette is what keeps this a
 * two-line change: `html[data-theme='dark']` redeclares all 30 color tokens
 * `:root` declares and leaves the derived ones (`--row-alt`, the four role
 * grounds, the geometry and the shadows) to resolve against it, which is what
 * every theme block does and what has been measured for this one already.
 */
export const DEFAULT_THEME: ThemeId = 'dark';

export type Theme = {
  id: ThemeId;
  label: string;
  /** One line under the name in the picker — what the theme *is*, not a poem. */
  hint: string;
  /** `light` or `dark`, handed to the browser as `color-scheme` so form
   *  controls, scrollbars and the address bar follow the page rather than
   *  sitting on it in the other polarity. */
  scheme: 'dark' | 'light';
  /** The page color, painted before the stylesheet has loaded — see
   *  `index.html` — so a reload does not flash the other theme. It is the
   *  theme's own `--bg` and is the one value duplicated outside the CSS. */
  bg: string;
  /** Three stops for the swatch beside the name in the picker: the page, an
   *  edge on it, and the accent. Real palette values rather than a flattering
   *  approximation — a picture of the thing is the only honest way to offer a
   *  color scheme, and the reason the picker is swatches rather than words.
   *
   *  The middle stop is `--border` rather than `--panel`, which is what it was
   *  first: a card is a step off the page in every theme (`#0b1220` → `#16213a`,
   *  `#1c1b22` → `#2a2833`, `#1d1319` → `#2b1d26`) and at 8px wide that step is
   *  invisible, so the swatch read as two stops rather than three. On Powder
   *  Blue there is no step at all — the page and the card are both white — so
   *  the middle stop is the only thing carrying the theme's own color, which
   *  is the argument for it made twice over, and `Light` is in the same case. The edge is the widest step a
   *  palette has short of its accent, which for Maroon is the jersey's own
   *  piping: that swatch is literally the three colors of the uniform, and
   *  Powder Blue's is the same three the other way round. */
  swatch: [string, string, string];
};

/**
 * The order is the order the picker draws them in: **the plain pair first, then
 * the four named palettes** — which is a reversal, and the reason is the one
 * that also moved `DEFAULT_THEME`.
 *
 * **`Dark` and `Light` are named for what they are rather than for a color**,
 * and that is the whole distinction between them and the four below. Midnight,
 * Lavender, Maroon and Powder Blue each have a character to name — a navy, a
 * graphite-and-violet, and the two halves of one uniform. These are VS Code's
 * own defaults (`2026 Dark` and `2026 Light`), which are deliberately plain:
 * a near-neutral surface, one accent, no cast. There is no noun for that but
 * the polarity itself, and a reader who wants exactly that is looking for
 * exactly those two words.
 *
 * That plainness is what earns them the top of the list rather than the bottom
 * of it. A reader opening the picker is answering *light or dark* before they
 * are answering *which navy*, and the two entries that say only that should be
 * the two they meet first; the four with a character to them read as the
 * choices you make once you have one. `Dark` is `DEFAULT_THEME` besides, and a
 * picker whose default is sixth in its own list is a picker that opens on
 * somebody else's answer.
 *
 * The array's order is the picker's alone — nothing reads `THEMES[0]`, which is
 * what `themeById` was changed to stop doing — so this stays free to move.
 * What each palette came from is in `styles.css` beside its block.
 */
export const THEMES: Theme[] = [
  /* The plain pair, off VS Code's own `2026 Dark` and `2026 Light`. Each takes
     that theme's surfaces unaltered and its marks' hues at this app's own
     saturation and lightness — the trade `Maroon` makes with its jersey, and
     the reason is measured in `styles.css` beside each block: VS Code tunes for
     syntax on a large surface, so its `disabledForeground` is 2.5:1 on its own
     page against the 3.7–5.3 the four named themes below run. `Dark` leads the
     list because it is `DEFAULT_THEME`. */
  {
    id: 'dark',
    label: 'Dark',
    hint: 'Plain near-black and steel blue.',
    scheme: 'dark',
    bg: '#121314',
    swatch: ['#121314', '#3a3d3f', '#63b4d8'],
  },
  {
    id: 'light',
    label: 'Light',
    hint: 'Plain white and blue.',
    scheme: 'light',
    bg: '#ffffff',
    swatch: ['#ffffff', '#d4d4da', '#004a8b'],
  },
  {
    id: 'midnight',
    label: 'Midnight',
    hint: 'Deep navy and cyan — the original.',
    scheme: 'dark',
    bg: '#0b1220',
    swatch: ['#0b1220', '#26365c', '#38bdf8'],
  },
  {
    id: 'lavender',
    label: 'Lavender',
    hint: 'Dark gray and violet, with a wash of color.',
    scheme: 'dark',
    bg: '#1c1b22',
    swatch: ['#1c1b22', '#46415a', '#b49cfb'],
  },
  {
    id: 'maroon',
    label: 'Maroon',
    hint: 'Maroon and sky, off a 1980 road uniform.',
    scheme: 'dark',
    bg: '#1d1319',
    swatch: ['#1d1319', '#56303f', '#8fc0ea'],
  },
  /* The same uniform the other way up: a white page with the powder carried by
     the borders, the table headers and the zebra stripe, and the maroon written
     on it. It is `scheme: 'light'` — as `Light` above it is — which is what
     hands the browser's own form controls, scrollbars and address bar the right
     polarity, and is the one line in this file that is not a color. */
  {
    id: 'powder',
    label: 'Powder Blue',
    hint: 'The same uniform, light — white, powder and maroon.',
    scheme: 'light',
    bg: '#ffffff',
    swatch: ['#ffffff', '#b4cfe6', '#8c2545'],
  },
];

export const STORAGE_KEY = 'sicko:theme';

export function themeById(id: string | null | undefined): Theme {
  // Falling back to `DEFAULT_THEME` rather than to `THEMES[0]`, which is what
  // this said while the two were the same entry: the array's order is the
  // *picker's* and is free to change, where the fallback is a statement about
  // which palette an unknown id resolves to.
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
}

/** Narrow anything — a URL, a saved preference, a storage entry — to a theme we
 *  actually have. Absence and nonsense both mean the default, which is the
 *  direction every stored preference in this app fails in. */
export function toThemeId(v: unknown): ThemeId {
  return THEMES.some((t) => t.id === v) ? (v as ThemeId) : DEFAULT_THEME;
}

/**
 * Put a theme on the page. Idempotent, and safe to call on every render.
 *
 * The attribute goes on `<html>` rather than on the app's own root because two
 * things outside React read it: the boot script in `index.html`, which runs
 * before this module is fetched, and `body`, whose background *is* the page.
 *
 * **Every theme is stamped, the default included**, which is a reversal: the
 * default used to carry no attribute at all, on the sound reasoning that a bare
 * `:root` already *was* it. `:root` is still Midnight and the default is now
 * Dark, so an unstamped document would be a reader who has never chosen looking
 * at the wrong palette. Nothing keys on the attribute's absence — checked, the
 * stylesheet has no `:not([data-theme])` in it — so stamping unconditionally
 * costs one attribute and removes the coupling that made this go wrong.
 */
export function applyTheme(id: ThemeId): void {
  const theme = themeById(id);
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  root.style.colorScheme = theme.scheme;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', theme.scheme);
}

/**
 * The saved theme, mirrored into `localStorage`.
 *
 * This app keeps its view state in the URL and says so — *there is no
 * localStorage* — and a theme is the one preference that has to break the rule,
 * for a reason that is about the first frame rather than about persistence. The
 * server is still the source of truth (`UserPrefs.theme`, which is what makes
 * the choice follow the reader to another device), and that answer arrives with
 * `/api/prefs`, a round trip after the page has painted. Without a local mirror
 * the app opens in Midnight's navy and turns graphite a moment later, on every
 * load, which is worse than any wait: it is the app appearing to change its
 * mind. Both themes are dark now, so what flashes is a hue rather than a
 * polarity — the mirror is what keeps even that off the first frame.
 *
 * So the mirror is a **paint-ahead cache and nothing else** — written whenever
 * the reader picks, read by the boot script before the stylesheet loads and by
 * `App` before its first render, and overruled without ceremony the moment the
 * server's own answer lands.
 */
export function readStoredTheme(): ThemeId | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && THEMES.some((t) => t.id === v) ? (v as ThemeId) : null;
  } catch {
    // A browser refusing storage gets the default and one frame of the wrong
    // theme on a reload, which is the whole cost of it being a cache.
    return null;
  }
}

export function storeTheme(id: ThemeId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore — see above */
  }
}
