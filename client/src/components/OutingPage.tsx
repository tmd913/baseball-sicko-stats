import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import type { PlayerGame, PlayerReport } from '../types';
import { gameStatusView, prettyGameDate } from '../lib';
import { answersEscape, useDelayedFlag, useLockBodyScroll, useOverlayFocus } from '../hooks';
import { BackButton } from './BackButton';
import { LoadingBlock } from './Loading';
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
 * This page is opened from **four** places: the feed's stream (on the page),
 * the player page's Overview tab and its Game Log (both inside `.details-view`,
 * 50), and a matchup's team feed (inside `.mup-view`, 48). So this box cannot
 * have a fixed z-index the way `.details-view` and `.mup-view` do: opened from
 * the player page it has to clear 50, and opened from the feed it must not sit
 * needlessly over the whole app.
 *
 * `DialogLayerContext` answers exactly that question and already answers it for
 * every `Modal` — a host declares its own layer once and anything opened inside
 * it takes one step up — so this reads the context the same way a dialog does
 * and provides its own layer to whatever it opens (its inning dialogs). The
 * ordinary case, opened from the page, is left to the stylesheet's own 46 so
 * that nothing is written inline where nothing differs, which is `Modal`'s rule
 * exactly. The rungs that fall out: **feed 46** → inning 47 → faced batter 48;
 * **the player page's own tabs 51** → 52 → 53, whether the press was a Game Log
 * row or an Overview game card; **a team page's feed 49** → 50 → 51. (The
 * Overview card and the Game Log row both used to reach this through
 * `PlayerDayModal` at 51, so it opened at 52 and the ladder ran a rung deeper —
 * see `OutingPageForGame` and `PlayerDayGameCard`.)
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
  pending,
  onClose,
}: {
  report: PlayerReport | null;
  game: PlayerGame | null;
  /**
   * What the head can write, and what the body says, **before the outing has
   * arrived** — for the one caller that opens this page without it, a Game Log
   * row (see `OutingPageForGame`). Every other caller is drawn from a report it
   * already holds and passes none, so the two branches below are the loaded
   * page and nothing else for them.
   */
  pending?: { name: string; date: string; wait: boolean; error: string | null };
  onClose: () => void;
}) {
  useLockBodyScroll();
  const viewRef = useRef<HTMLDivElement | null>(null);
  useOverlayFocus(viewRef);
  /**
   * **Innings while the outing is live, Line once it is done.**
   *
   * The page opens on the reading its reader came for. A finished outing is a
   * result, so it leads on the line; one still being thrown is a *narrative*,
   * and what a manager wants at 9:40 on a Tuesday is the half-inning he is in —
   * which the line, one number per column and rewritten every batter, cannot
   * say. It is the same argument the Rankings tab makes for opening on the week
   * being played rather than on the season.
   *
   * **`gameStatusView`'s own `kind`**, not a second test: that is what the
   * `GameStatusBadge` at the head of this very page reads to print `Live`, so
   * the tab and the badge above it cannot come to disagree about whether the
   * outing is still going on.
   *
   * **A lazy initialiser rather than an effect**, the rule `LeagueMatchup`'s
   * `sideTab` sets: the game is a prop at mount for every caller that has one,
   * so the first paint is already the right tab, where an effect would draw
   * Line, swap a frame later, and reset the scroll doing it.
   *
   * And it applies **once**. A game that goes final under a reader who has the
   * page open must not move the tab out from under them — which is a live
   * hazard rather than a hypothetical, the feed re-polling `/api/report` every
   * twenty seconds while a game is on and handing this page a fresh `game`
   * object each time — and the reader's own press is the last word from the
   * moment they make it. `tab` is `null` until something has decided, so the
   * latch below can seed it for the one caller that opens this page *before* it
   * has a game (a Game Log row, whose read is still out) without ever
   * re-deciding for the rest.
   */
  const [tab, setTab] = useState<OutingTab | null>(() => (game ? defaultOutingTab(game) : null));
  if (tab === null && game) {
    // Not an effect: React re-renders on a set during render before it commits,
    // so nothing is painted on the tab this is correcting. The `pending` branch
    // draws no tab strip at all, so there is nothing on screen to swap either.
    setTab(defaultOutingTab(game));
  }
  const active: OutingTab = tab ?? 'line';
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
  }, [active]);

  const pg = game?.pitching ?? null;
  // Nothing to draw and nothing to say about why: the defensive branch for a
  // caller that hands over a game with no outing in it. Every real caller
  // either has the outing or passes a `pending` that says what is missing.
  if (!pg && !pending) return null;

  /**
   * Only the tabs that have something behind them. Line and Innings always do
   * — this page is only ever opened from an outing — where the lineup is a join
   * that can fail (`opponentHitting` is null when the team-hitting read did) and
   * the arsenal is empty for a pitcher Savant has no pitch rows for. An empty
   * tab that draws nothing is worse than an absent one: the reader presses it
   * and cannot tell whether the app is broken or the outing is.
   */
  const tabs: { key: OutingTab; label: string }[] = !pg
    ? []
    : [
        { key: 'line', label: 'Line' },
        { key: 'innings', label: 'Innings' },
        ...(game!.opponentHitting ? [{ key: 'opponent' as const, label: 'Opponent' }] : []),
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
              <h1 className="details-name">{report?.name ?? pending?.name ?? ''}</h1>
              <p className="outing-sub">
                {pg && game
                  ? `${matchupLine(game)} · ${prettyGameDate(game.date)}`
                  : prettyGameDate(pending!.date)}
              </p>
            </div>
            {/* The bar's own strip — role chip, credit, line, status badge —
                drawn by the same `outingBar` the feed's bar draws, so the head
                and the row that opened it cannot come to say two things. Absent
                until the outing is, there being nothing to draw one from. */}
            {pg && game && <div className="outing-head-line">{outingBar(game, pg)}</div>}
          </div>

          {/* The gate is on the strip rather than inside it, which is the rule
              `.view-switch` already records: `.details-tabs` carries a rule and
              its own height, so an empty one draws a band around nothing and
              puts an empty `role="tablist"` in the accessibility tree. */}
          {tabs.length > 0 && (
            <div className="details-tabs" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active === t.key}
                  className={`details-tab${active === t.key ? ' is-active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="outing-tab">
          {pg && game && report ? (
            <>
              {active === 'line' && <GameLine pg={pg} bare />}
              {active === 'innings' && (
                <InningsList game={game} pitcherId={report.id} pitcherName={report.name} />
              )}
              {active === 'opponent' && (
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
              {active === 'arsenal' && <ArsenalSection pg={pg} bare />}
            </>
          ) : pending?.error ? (
            <div className="details-status details-error">⚠ {pending.error}</div>
          ) : (
            <LoadingBlock>Reading the outing</LoadingBlock>
          )}
        </div>
      </div>
    </DialogLayerContext.Provider>,
    document.body,
  );
}

/**
 * The same page, opened before the outing exists — what a **Game Log row**
 * presses, and the one caller that has to fetch.
 *
 * A row holds a `PitcherGameLog`: a `gamePk`, a date and a line. The page needs
 * the `PlayerGame` behind it, which is what `/api/players/:id/day` answers with
 * — the same read the popup this replaced already made, and the same one the
 * player page's Overview tab makes, so no layer under it is newly paid for (a
 * past date is a frozen day snapshot, one read).
 *
 * ### Where the wait belongs, and it is in two places split at `WAIT_DELAY`
 *
 * **Under 250ms nothing opens at all.** The press is one round trip against a
 * route every layer of which is cached, and a page that flashed into existence
 * and filled in would read as the app stuttering rather than as an answer —
 * which is the whole of what `useDelayedFlag` is for.
 *
 * **Past it the page opens on the head it can already write** — his name and
 * the day, both of which the row that was pressed already knows — with a block
 * wait in the body. That is `PlayerDayModal`'s own shape (a `Modal` whose title
 * is `name — date` over a `LoadingBlock`) rather than a new one, and it is why
 * this is not "a page with nothing in it": it says whose outing and which day,
 * and it carries the way back out.
 *
 * The alternative — hold the press silently until the data lands — leaves a
 * press with no trace for however long a cold read takes, which is the failure
 * `MIN_SPIN` exists to prevent at the other end of the same argument. Drawing
 * the wait *in the Game Log* was the third option and is worse than either: a
 * table that has data would grow a spinner in one row, which is a second
 * loading idiom for a surface that already has none.
 *
 * ### And a game with no outing in it says so rather than opening empty
 *
 * A pitcher's game log has a row only for a game he appeared in, so the day
 * read should always carry a `pitching`. Where it does not — the game missing
 * from the day, or carrying no outing — the page draws the sentence rather than
 * a head over an empty body. **A read that *threw* keeps its page too**, that
 * being a different fact from an absence and one the reader can retry by
 * pressing the row again.
 */
export function OutingPageForGame({
  playerId,
  name,
  date,
  gamePk,
  onClose,
}: {
  playerId: number;
  name: string;
  date: string;
  gamePk: number;
  onClose: () => void;
}) {
  const [report, setReport] = useState<PlayerReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Behind WAIT_DELAY like every other block wait — see `Loading.tsx`.
  const wait = useDelayedFlag(loading);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api
      .playerDay(playerId, 'pitcher', date)
      .then((d) => {
        if (live) setReport(d.player);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [playerId, date]);

  // Keyed on the **game** rather than the date, because a doubleheader is two
  // outings on one afternoon and the row that was pressed named one of them.
  const game = report?.games.find((g) => g.gamePk === gamePk) ?? null;
  const missing = !loading && !error && report !== null && !game?.pitching;
  const message = error ?? (missing ? `No outing for ${name} in that game.` : null);
  // Nothing on screen until there is something to say — see above.
  if (!game?.pitching && !message && !wait) return null;
  return (
    <OutingPage
      report={report}
      game={game}
      pending={{ name, date, wait, error: message }}
      onClose={onClose}
    />
  );
}

/** Which reading of the outing is on screen. */
type OutingTab = 'line' | 'innings' | 'opponent' | 'arsenal';

/** Which one a page opens on — see the note beside the state it seeds. */
function defaultOutingTab(game: PlayerGame): OutingTab {
  return gameStatusView(game).kind === 'live' ? 'innings' : 'line';
}
