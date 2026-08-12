import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { RefObject } from 'react';
import type { PlayerStatus } from './types';

/**
 * Whether clips play with the sound off — the settings menu's "Mute clip
 * audio", saved per user.
 *
 * A context rather than a prop because the only component that needs it is a
 * leaf: every clip in the app plays through `ClipVideo`, and reaching it from
 * App means threading a boolean through PlayerCard, the game blocks, the plate
 * appearance cards, the feed and the reel — six components that have no other
 * interest in it. One provider at the top, one `useMuted()` in `ClipVideo`, and
 * every clip in the app is covered including any added later.
 *
 * Defaults to false, so a clip rendered outside the provider (a test, a future
 * standalone view) behaves as it always has.
 */
export const MutedContext = createContext(false);

export function useMuted(): boolean {
  return useContext(MutedContext);
}

/** A player's place on the user's fantasy roster: today's slot, and whether
 *  that slot is a lineup spot rather than the bench or the IL. */
export interface FantasySlot {
  slot: string;
  starting: boolean;
  /** ESPN's injury designation for him, raw — see `espnInjuryBadge`. It rides
   *  on this map rather than taking one of its own because it comes off the
   *  same roster read and reaches the same leaves. */
  injuryStatus: string | null;
}

/**
 * Where each watched player sits on the user's fantasy roster, by the app's
 * `${kind}-${id}` player key — or null when the views are reading the saved
 * watchlist, which is the state that renders no slot at all.
 *
 * A context for the reason `MutedContext` is one: the players who need it are
 * leaves, and they are scattered. The same chip belongs on the summary table's
 * name cell, on both kinds of player card and on every feed row, and threading
 * a map through the four views and their intermediate components — none of
 * which have any other interest in a fantasy league — is a lot of plumbing for
 * one badge.
 */
export const FantasyRosterContext = createContext<Map<string, FantasySlot> | null>(null);

export function useFantasySlot(key: string): FantasySlot | null {
  return useContext(FantasyRosterContext)?.get(key) ?? null;
}

/**
 * What the league has to say about each player **today** — his roster status
 * and where his club's game has him — by MLB player id, or null before the one
 * request that fills it has landed.
 *
 * A context for the reason the two above are: the research board's rows and the
 * details view's header are leaves, and what they want is one league-wide map
 * that neither of them should be fetching for itself. Keyed by id rather than
 * by the app's `${kind}-${id}` player key because it is the league's answer
 * about a *person*: a two-way player is batting third and starting on the mound
 * as one man, and the caller says which half it is drawing.
 */
export const PlayerStatusContext = createContext<Map<number, PlayerStatus> | null>(null);

export function usePlayerStatus(id: number): PlayerStatus | null {
  return useContext(PlayerStatusContext)?.get(id) ?? null;
}

/**
 * Returns a ref to attach to a collapsible element. When `expanded` flips from
 * false to true, the element scrolls to the top of the viewport (its own
 * scroll-margin-top clears the sticky nav). Only fires on the closed→open
 * transition — never on mount, on collapse, or on an unrelated re-render — so
 * expanding a card, a game, or an at-bat brings it into view without yanking
 * the page around otherwise.
 *
 * Every collapsible in the app scrolls this way — no per-caller alignment. An
 * earlier `block: 'nearest'` option existed for the feed's innings and made
 * them the one thing that moved differently from everything around it.
 */
export function useScrollIntoViewOnExpand<T extends HTMLElement>(expanded: boolean) {
  const ref = useRef<T>(null);
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    if (expanded && !wasExpanded.current) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    wasExpanded.current = expanded;
  }, [expanded]);
  return ref;
}

/**
 * Measures the pinned chrome and publishes its height as `--chrome-h` on the
 * document root, which `--scroll-offset` adds to its own breathing room.
 *
 * Everything in the app that scrolls something to the top of the viewport —
 * every collapsible via `useScrollIntoViewOnExpand`, a clip when it plays, a
 * player card jumped to from the summary table — lands it at `scroll-margin-top`
 * from the top of the *window*. That was the top of the page too until the
 * header, the search bar and the view bar were pinned there: now the top of the
 * window is behind the bar, so every one of those scrolls parks what it was
 * aiming at underneath it. The offset has to clear the bar as well.
 *
 * It is measured rather than declared because there is no one number to
 * declare: the bar wraps to two and three rows as the window narrows (115px on
 * a desktop, 303px at 320px wide), and it stands down altogether on the summary
 * and research views and under `max-height: 560px`, where the offset must go
 * back to the bare gap. So the height is whatever the element currently is, and
 * zero whenever it isn't actually pinned — read off the computed `position`,
 * which is the same answer the CSS gives rather than a second copy of the rules
 * that decide it.
 *
 * A `ResizeObserver` catches the wraps; the per-render pass catches everything a
 * resize can't see (a view swap that makes the bar static, an error banner
 * appearing above the fold). Both are layout effects, so the property is set
 * before the browser paints — and before any scroll a click has just triggered
 * reads it.
 *
 * Returns the same height as a ref, for the one scroll the app does by hand
 * (`scrollToPlayer`) rather than through `scroll-margin-top`.
 */
export function useStickyChromeOffset<T extends HTMLElement>(): [RefObject<T | null>, RefObject<number>] {
  const ref = useRef<T>(null);
  const height = useRef(0);
  const sync = useCallback(() => {
    const el = ref.current;
    const pinned = el && getComputedStyle(el).position === 'sticky';
    const h = pinned ? Math.round(el.getBoundingClientRect().height) : 0;
    if (h === height.current) return;
    height.current = h;
    document.documentElement.style.setProperty('--chrome-h', `${h}px`);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    // The window listener is not the observer's understudy — it catches the one
    // case the observer cannot see at all: a *shorter* window unpins the bar
    // (`max-height: 560px`) without changing its height by a pixel, so nothing
    // resizes and React never re-renders. A phone turned sideways would
    // otherwise keep clearing 159px of bar that is no longer there.
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [sync]);
  // No dependency list on purpose: the bar's height changes with things no
  // observer reports, and re-measuring is a rect read against one comparison.
  useLayoutEffect(sync);
  return [ref, height];
}

/**
 * Freezes the page behind a full-screen overlay for as long as the caller is
 * mounted, then puts it back exactly where it was.
 *
 * The overlay (`.details-view`) is `position: fixed` with its own scroller, so
 * the document underneath stayed live: once the overlay hit its top or bottom
 * the scroll chained through to the window, and keyboard scrolling (space,
 * arrows, Page Down) never targeted the overlay at all because focus was still
 * on the card behind it. Either way the page drifted invisibly and closing the
 * overlay dumped the user somewhere they'd never scrolled to.
 *
 * `overflow: hidden` on the body alone doesn't hold on iOS Safari, so the body
 * is pinned with `position: fixed` and offset by the current scroll — the one
 * technique that stops touch scrolling everywhere. That offset is why the
 * scroll has to be restored by hand on unlock: pinning the body resets the
 * window to 0.
 */
export function useLockBodyScroll() {
  useEffect(() => {
    const { body } = document;
    const y = window.scrollY;
    const prev = body.style.cssText;
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      body.style.cssText = prev;
      window.scrollTo(0, y);
    };
  }, []);
}

/**
 * Close a popover on a press outside it or on Escape.
 *
 * The header has two of these now — the settings gear and the fantasy button
 * beside it — and they have to dismiss identically or the pair reads as two
 * different kinds of control. `pointerdown` rather than `click`, so a press
 * that starts outside dismisses on the way down instead of waiting for a mouse
 * button that may come up somewhere else entirely.
 */
export function useDismissable(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, ref, close]);
}

/**
 * Give one element the whole browser page, and take it back.
 *
 * These tables are the app's widest things by some way — the research board
 * carries 44 columns — and they read out of a box a few hundred pixels tall
 * under a header, a tab row and a control bar. This is the button that says
 * "just show me the table": the app's own chrome goes and the table takes
 * everything the page has.
 *
 * **Deliberately not the Fullscreen API.** That takes the browser's chrome as
 * well, which is a bigger thing than was asked for and a worse one to be in by
 * accident — it swallows the tab strip and the address bar, needs a user
 * gesture, is refused outright by iPhone Safari for elements, and leaves the
 * page in a mode the browser rather than the app has to be asked to leave. A
 * fixed overlay covers everything this app draws, behaves the same everywhere,
 * and is undone by the same button that made it.
 *
 * Escape leaves, because a mode that fills the window should answer the key
 * that means "out of this".
 */
export function useFullPage() {
  const [isFull, setFull] = useState(false);
  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFull]);
  const toggle = useCallback(() => setFull((v) => !v), []);
  return { isFull, toggle };
}
