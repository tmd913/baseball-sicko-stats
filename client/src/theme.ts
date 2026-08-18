/**
 * The color scheme, and everything that has to know one exists.
 *
 * There are four, and they are **palettes rather than stylesheets**: `styles.css`
 * declares every color the app draws as a token on `:root`, and a theme is a
 * block that redeclares those tokens against `html[data-theme='…']`. No
 * component reads a theme, and nothing here knows a single class name.
 *
 * What this module owns is the three things a token block cannot do for itself:
 * which themes there are, how one gets onto the `<html>` element, and how the
 * choice survives a reload.
 */

export type ThemeId = 'midnight' | 'lavender' | 'maroon' | 'powder';

/** The one a reader who has never chosen gets, and the one `:root` declares. */
export const DEFAULT_THEME: ThemeId = 'midnight';

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
   *  is the argument for it made twice over. The edge is the widest step a
   *  palette has short of its accent, which for Maroon is the jersey's own
   *  piping: that swatch is literally the three colors of the uniform, and
   *  Powder Blue's is the same three the other way round. */
  swatch: [string, string, string];
};

export const THEMES: Theme[] = [
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
  /* The same uniform the other way up, and the one light scheme: a white page
     with the powder carried by the borders, the table headers and the zebra
     stripe, and the maroon written on it. It is `scheme: 'light'`, which is what
     hands the browser's own form controls, scrollbars and address bar the right
     polarity — the one line in this file that is not a color. */
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
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
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
 * The default theme carries no attribute at all — `:root` is already Midnight —
 * so a reader who has never chosen has nothing stamped on their document.
 */
export function applyTheme(id: ThemeId): void {
  const theme = themeById(id);
  const root = document.documentElement;
  if (theme.id === DEFAULT_THEME) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme.id);
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
