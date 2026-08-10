import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

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
 * Give one element the whole screen, and take it back.
 *
 * These tables are the app's widest things by some way — the research board
 * carries 44 columns — and they read out of a box a few hundred pixels tall
 * under a header, a tab row and a control bar. This is the button that says
 * "just show me the table", and what it buys on a laptop is both the browser's
 * chrome and the app's: a dozen more rows and several more columns at once.
 *
 * **Two mechanisms, one state.** The Fullscreen API is the real thing and takes
 * the browser's own chrome with it, but iPhone Safari does not implement it for
 * elements (only for video) — so a request that throws, or an API that isn't
 * there, falls back to a fixed overlay over the app. That covers everything the
 * app draws, which on a phone is nearly the whole screen anyway. The caller
 * sees one `isFull` either way and never has to know which it got.
 *
 * `fullscreenchange` is what keeps the state honest: Escape and the browser's
 * own exit are not our button, and a flag we set ourselves would go stale the
 * first time either was used.
 */
export function useFullscreen<T extends HTMLElement>(ref: RefObject<T | null>) {
  // The fallback's own flag. Native fullscreen is read from the document rather
  // than remembered, so there is nothing to keep in sync there.
  const [overlay, setOverlay] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const sync = () => {
      const on = !!ref.current && document.fullscreenElement === ref.current;
      setNative(on);
      // The two must never both be on: a browser that ends up in real
      // fullscreen *and* leaves the fallback flag set would drop back into the
      // overlay when the user pressed Escape, which reads as an exit that
      // didn't work. Checked because it is not hypothetical — a headless
      // Chrome does exactly this, entering fullscreen and rejecting the promise
      // that says it did.
      if (on) setOverlay(false);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);

  // Escape leaves native fullscreen on its own; the overlay has to be told.
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverlay(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      setOverlay(false);
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (overlay) {
      setOverlay(false);
      return;
    }
    if (document.fullscreenEnabled && el.requestFullscreen) {
      // A rejected request is not an error worth showing anyone — it is an
      // iPhone, or a permissions policy. Take the overlay instead.
      //
      // The decision is made from `document.fullscreenElement` a frame later
      // rather than from the rejection itself, because the two disagree: a
      // headless Chrome rejects the promise *and* enters fullscreen, and taking
      // the rejection at its word left both mechanisms on at once. Asking what
      // actually happened is the answer that can't be lied to.
      el.requestFullscreen().catch(() => {
        requestAnimationFrame(() => setOverlay(document.fullscreenElement !== el));
      });
    } else {
      setOverlay(true);
    }
  }, [ref, overlay]);

  return { isFull: native || overlay, toggle };
}
