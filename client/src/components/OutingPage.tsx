import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerGame, PlayerReport } from '../types';
import { prettyGameDate } from '../lib';
import { answersEscape, useLockBodyScroll, useOverlayFocus } from '../hooks';
import { BackButton } from './BackButton';
import { DialogLayerContext, DIALOG_LAYER } from './Modal';
import { InningsList } from './Innings';
import { ArsenalSection, GameLine, OpponentSection, outingBar } from './PitcherCard';
import { matchupLine } from './PlayerCard';

/**
 * A pitcher's outing as a **full-screen page**, opened from the bar that names
 * it — his line, the innings he threw, the lineup he faced and his arsenal for
 * the game, one per tab.
 *
 * ### Why a page, where there were two dialogs
 *
 * The outing bar used to raise a `Modal` holding `InningsList` and a
 * **`Full breakdown`** button, and that button raised a *second* `Modal`
 * (`OutingBreakdown`) holding the other three sections. So the full read was two
 * dialogs deep and split across two boxes, with the four things a reader wants
 * about one outing divided three-and-one by an accident of the order they were
 * built in — the innings having been the feed item's own content since it was
 * written, and the other three having arrived later as the parts the Games
 * view's card took off screen with it.
 *
 * Four readings of one thing is a **tab strip**, which is the shape this app
 * already gives that: `PlayerDetails` is eight readings of one player and
 * `.mup-view` three of one matchup. Both of those are pages rather than
 * dialogs, and for the reason that applies here too — a dialog is a panel over
 * a page you are still reading, where this *replaces* the reading: an outing's
 * line, its innings, the opposing lineup and the arsenal are several screens of
 * table between them, and they were being read through a `--card-column` box
 * inside another one.
 *
 * **Line leads and is the default**, because it is what a reader opens an
 * outing for: the decision, the innings, the pitch count, the counting stats
 * and the rates in one strip. The innings are the follow-up question, which is
 * the same order the sections had on the card this is descended from.
 *
 * ### What it borrows
 *
 * The **shape** is `.details-view`'s, folded in the stylesheet rather than
 * copied — a fixed box with its own scroller, `overscroll-behavior: none`, the
 * reserved scrollbar gutter and the `--table-bleed` the opponent table takes
 * back — and the **conventions** are that page's too: `useLockBodyScroll`,
 * `useOverlayFocus` (focus in on open, back out on close, the background
 * `inert`), a `BackButton`, and Escape through `answersEscape` so a ladder
 * unwinds one rung per press.
 *
 * The **sections** are `PitcherCard`'s own components, which is the point
 * `OutingBreakdown` already made and which this inherits: a page that drew its
 * own version of the game line would be a second answer free to drift from the
 * card's. Each is drawn `bare` — the tab strip has already said `Line`, and a
 * heading under it saying `Line` again is the same word twice (see
 * `CardSection`).
 *
 * ### The layer is the host's plus one, which is the whole of the stacking
 *
 * An outing bar is drawn in **four** places: the feed's stream (on the page),
 * the player page's Overview tab (inside `.details-view`, 50), the Game Log's
 * per-game popup (a `Modal` at 51 inside that page) and a matchup's team feed
 * (inside `.mup-view`, 48). So this box cannot have a fixed z-index the way
 * `.details-view` and `.mup-view` do: opened from the Game Log's popup it has
 * to clear 51, and opened from the feed it must not sit needlessly over the
 * whole app.
 *
 * `DialogLayerContext` answers exactly that question and already answers it for
 * every `Modal` — a host declares its own layer once and anything opened inside
 * it takes one step up — so this reads the context the same way a dialog does
 * and provides its own layer to whatever it opens (its inning dialogs). The
 * ordinary case, opened from the page, is left to the stylesheet's own 46 so
 * that nothing is written inline where nothing differs, which is `Modal`'s rule
 * exactly. The rungs that fall out: **feed 46** → inning 47 → faced batter 48;
 * **Overview tab 51** → 52 → 53; **Game Log popup 52** → 53 → 54; **a team
 * page's feed 49** → 50 → 51.
 *
 * **Portalled to the body**, and that is forced rather than tidy. A
 * `position: fixed` box is positioned against its nearest ancestor that
 * establishes a containing block for fixed descendants, and
 * `.app-dialog-body` — the scroller of every `Modal` in the app — declares
 * `container-type: inline-size`, which implies layout containment and so *is*
 * one. Rendered in place inside the Game Log's popup this page would have been
 * laid out inside that popup's body rather than over the window. Portalling
 * also keeps the `inert` walk cheap: at the body its only siblings are `#root`
 * and whatever dialogs are open, where in the feed it would have marked every
 * item in the stream.
 */
export function OutingPage({
  report,
  game,
  onClose,
}: {
  report: PlayerReport;
  game: PlayerGame;
  onClose: () => void;
}) {
  useLockBodyScroll();
  const viewRef = useRef<HTMLDivElement | null>(null);
  useOverlayFocus(viewRef);
  const [tab, setTab] = useState<OutingTab>('line');
  // One step above whatever this was opened out of — see the note above. Null
  // where there is nothing above the page, so the stylesheet's own 46 stands and
  // nothing is written inline, which is `Modal`'s own rule.
  const host = useContext(DialogLayerContext);
  const layer = host === null ? null : host + 1;

  /**
   * Escape closes this page — **once**, and only when nothing is stacked above
   * it. `answersEscape` marks the press so a ladder unwinds one rung per key;
   * an inning dialog opened from the Innings tab is portalled and so is not a
   * descendant, which is precisely the case `overlayAbove` reads the *layer*
   * for rather than containment.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answersEscape(e, viewRef.current)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Crossing between the tabs puts the page back at the top: a tab is a
  // different reading of the outing, not a place in one — the rule the player
  // page's own tabs and the matchup page's three follow.
  useEffect(() => {
    viewRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const pg = game.pitching;
  if (!pg) return null;

  /**
   * Only the tabs that have something behind them. Line and Innings always do
   * — this page is only ever opened from an outing — where the lineup is a join
   * that can fail (`opponentHitting` is null when the team-hitting read did) and
   * the arsenal is empty for a pitcher Savant has no pitch rows for. An empty
   * tab that draws nothing is worse than an absent one: the reader presses it
   * and cannot tell whether the app is broken or the outing is.
   */
  const tabs: { key: OutingTab; label: string }[] = [
    { key: 'line', label: 'Line' },
    { key: 'innings', label: 'Innings' },
    ...(game.opponentHitting ? [{ key: 'opponent' as const, label: 'Opponent' }] : []),
    ...(pg.pitchMix.length > 0 ? [{ key: 'arsenal' as const, label: 'Arsenal' }] : []),
  ];

  return createPortal(
    <DialogLayerContext.Provider value={layer ?? DIALOG_LAYER}>
      <div
        ref={viewRef}
        tabIndex={-1}
        className="details-view outing-view"
        style={layer === null ? undefined : { zIndex: layer }}
      >
        {/* The head and the tabs are one pinned box, `.details-chrome`'s own
            argument one page along: they are one statement of *whose outing and
            which reading of it*, and that is the last thing that should scroll
            away from under a reader partway down an arsenal table. */}
        <div className="details-chrome">
          <div className="details-head outing-head">
            <BackButton onClose={onClose} />
            <div className="outing-id">
              {/* No headshot and no link out. This page is about the *outing*
                  rather than about the man — the bar it was opened from already
                  carries his face and his name as links — and a link to his
                  player page from here would have to clear a box whose own
                  layer is decided by where it was opened from, which is exactly
                  the stack `.details-view`'s fixed 50 cannot answer. */}
              <h1 className="details-name">{report.name}</h1>
              <p className="outing-sub">
                {matchupLine(game)} · {prettyGameDate(game.date)}
              </p>
            </div>
            {/* The bar's own strip — role chip, credit, line, status badge —
                drawn by the same `outingBar` the feed's bar draws, so the head
                and the row that opened it cannot come to say two things. */}
            <div className="outing-head-line">{outingBar(game, pg)}</div>
          </div>

          <div className="details-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`details-tab${tab === t.key ? ' is-active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="outing-tab">
          {tab === 'line' && <GameLine pg={pg} bare />}
          {tab === 'innings' && (
            <InningsList game={game} pitcherId={report.id} pitcherName={report.name} />
          )}
          {tab === 'opponent' && (
            <OpponentSection
              hitting={game.opponentHitting}
              opponent={game.opponent}
              // A team's split is by the hand they faced, and before he has thrown a
              // pitch the game has no `stand` — so his report's hand stands in. The
              // fallback is the caller's because only a caller knows whether it has a
              // game to read a `stand` off; see `OpponentBody`.
              hand={game.stand ?? report.throws ?? null}
              bare
            />
          )}
          {tab === 'arsenal' && <ArsenalSection pg={pg} bare />}
        </div>
      </div>
    </DialogLayerContext.Provider>,
    document.body,
  );
}

/** Which reading of the outing is on screen. */
type OutingTab = 'line' | 'innings' | 'opponent' | 'arsenal';
