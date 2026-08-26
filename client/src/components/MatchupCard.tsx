import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { InfoKey } from './InfoKey';
import { LoadingLine } from './Loading';
import { Modal } from './Modal';
import { MatchupSeriesChart } from './MatchupSeriesChart';
import { moveLabel } from './LeagueTransactions';
import {
  asProjected,
  catScore,
  categoryGroups,
  fmtValue,
  prettyDate,
  ProjectedTools,
  record,
  TeamLogo,
} from './LeagueView';
import { easternDate, LEAGUE_POLL_MS } from '../lib';
import type {
  EspnCategory,
  EspnMatchup,
  EspnMatchupSeries,
  EspnMatchupSide,
  EspnProjection,
  EspnScoreboard,
  EspnStandingsTeam,
  EspnTransactionPlayer,
  EspnTransactions,
} from '../types';

/**
 * **The comparison itself — one matchup, category by category — as a component
 * of its own rather than a block inside the matchup page.**
 *
 * It was written inline in `LeagueMatchup.tsx`, where it was the middle of that
 * overlay's three pages and nothing else drew it. It has a second caller now:
 * the **Roster view's own `Matchup` reading**, which puts this card where the
 * date bar and the stat table would be (`App.tsx`'s `rosterMatchup`). Two
 * surfaces drawing one card is this repo's standing rule for the case — the
 * same rule that made `SummaryTable`, `DateBar`, `ScheduleToggle` and
 * `BackButton` one component apiece — and the alternative here was a second
 * comparison that agreed with this one on the day it was written.
 *
 * **What came with it is everything the card is made of** and nothing the page
 * around it is: the bar scale (`categorySpread`, `barShare`), the category
 * winner (`winnerOf`), the acquisitions and the moves under them (`movesFor`,
 * `MovesColumn`), the two heads (`SideHead`), the `Projected` toggle at its
 * foot and the day-by-day chart a category row opens. What stayed behind is the
 * overlay's own furniture — the Back row, the week face, the strip of three
 * pages and the team pages themselves.
 *
 * **The bars key did not come with it**, and that is deliberate: it explains
 * the card but it is drawn *outside* it on both surfaces — in the matchup
 * page's pinned band, and beside the roster's week face — for the reason stated
 * where it is built, that what it explains is ten rows the reader is still
 * going down when a key inside the card has scrolled away. `MatchupBarsKey` is
 * exported for both.
 */

/** The winner of one category, from the two figures. `outcome`'s twin in
 *  `LeagueView.tsx` and deliberately the same arithmetic: ESPN fills its own
 *  `result` only once a matchup is over, so a live week would say nothing.
 *
 *  **Including the two absences, which are different facts.** One side missing
 *  a figure is `null` — that side is ineligible for the category and marking it
 *  as losing would be a claim about a week it cannot play. *Neither* side
 *  having one is a tie: no innings thrown is no denominator, so at the top of
 *  every week ESPN reports no ERA and no WHIP for either team and the two are
 *  level on nothing. `tallyCategories` on the server draws the same line, which
 *  is what keeps this page's group tallies and the server's whole-matchup one
 *  from disagreeing about the same category. */
function winnerOf(
  left: number | undefined,
  right: number | undefined,
  cat: EspnCategory,
): 'left' | 'right' | 'tie' | null {
  const hasLeft = typeof left === 'number';
  const hasRight = typeof right === 'number';
  if (!hasLeft && !hasRight) return 'tie';
  if (!hasLeft || !hasRight) return null;
  if (left === right) return 'tie';
  return (cat.lowerBetter ? left < right : left > right) ? 'left' : 'right';
}

/**
 * A linearly-interpolated quantile of an **already-sorted** array. Interpolated
 * rather than nearest-rank because the arrays here are one per league — twelve
 * values — where nearest-rank makes the 5th percentile the minimum outright and
 * the scale asymmetric at the two ends for no reason a reader could see.
 */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * **What counts as a wide gap in this category, this week** — the denominator
 * every category bar on the card is measured against, one per category, taken
 * from every team in the league rather than from the two on the page.
 *
 * ### The scale it replaces, and why it could not work
 *
 * This was `|a−b| / (|a|+|b|)`, and the argument for it was that it needs no
 * calibration: the comparison is complete — two teams, one week, one category —
 * so the pair can be measured against itself, and the result is in [0, 1] by
 * construction. That is all true and the bar was still unreadable, because what
 * `|a|+|b|` actually measures is **how near the category's zero the two figures
 * sit**, which has nothing to do with how far apart they are.
 *
 * A counting category can reach its zero — a team really can hit no home runs
 * in a week — so `HR 12–2` scores 71%. A rate category never comes near one: a
 * lineup's OPS lives between about .650 and .850, so the widest gap the league
 * produces divides by a total near 1.5 and vanishes. **Measured over the 30 real
 * matchups of periods 14–18 on the live league**, the old scale's bar length by
 * category, median and largest:
 *
 * | | R | HR | RBI | W | ERA | SB | WHIP | K | OPS | SVHD |
 * | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
 * | median | 6.9% | 17.6% | 11.1% | 14.3% | 15.5% | 25.0% | 8.3% | 17.1% | **3.9%** | 33.3% |
 * | largest | 26.9% | 47.4% | 29.4% | 100% | 54.3% | 66.7% | 27.1% | 47.7% | **12.1%** | 100% |
 *
 * **OPS never once exceeded an eighth of its track**, and its median week was a
 * 3.9% mark against a rail — which is what "impossible to fill" means. Only `W`
 * and `SVHD` ever filled, and both only by way of a side on zero, which is the
 * degenerate case rather than the interesting one. So the bar was not measuring
 * the category at all: it was measuring whether the category *has* a reachable
 * zero.
 *
 * ### What it is now
 *
 * `p95 − p05` of every team's own figure in that category this period — the
 * league's own spread — with `max − min` as the fallback where that is zero
 * (nine teams on 0 saves and one on 3 leaves a flat middle and a real gap). A
 * gap as wide as the league's spread fills the bar; half of it fills half.
 *
 * This is the **Splits card's `full`**, which is the app's own precedent for
 * exactly this shape and was cited in the old argument as the thing this did not
 * need — a platoon bar measures against the 90th percentile of the league's real
 * gaps, because one hitter's split means nothing until you know what a big split
 * is. The same turns out to be true of one week's category: `OPS .812–.784`
 * means nothing until you know that the twelve teams that week ran from .705 to
 * .846.
 *
 * **Trimmed at both ends rather than `max − min`**, which was driven against
 * the same 30 matchups: the raw range clamps nothing and fills nothing either,
 * an overall median of 30.0% and **not one full bar in 300** — the complaint
 * again, one step milder. `p90 − p10` runs the other way, a median of 58.3% and
 * **26% of bars clamped**, which throws away the top of the scale. `p95 − p05`
 * sits between them: overall median **37.2%**, per-category medians **28.9%
 * (OPS) to 50.8% (WHIP)**, every category able to reach a full bar, and **15 of
 * 300 (5%)** actually there — a full bar is rare, and it now means one thing
 * rather than "somebody is on nought".
 *
 * **It is the lens's own spread**, computed from whichever figures the card is
 * drawing: measured against measured, projected against projected. A projection
 * is a whole week and a live measurement is a part of one, so a projected gap
 * over a part-week scale would clamp half the card.
 *
 * **And it self-scales through the week**, which is a property rather than a
 * defect: on Tuesday every team's totals are small and so is the spread, so a
 * two-homer lead reads as the real lead it is on Tuesday. The bar says how the
 * category stands *now*, not how it will end — the figures either side of it are
 * the reading, and `Projected` is the page's answer to the other question.
 */
function categorySpread(
  categories: readonly EspnCategory[],
  sides: readonly Record<number, number>[],
): Map<number, number> {
  const full = new Map<number, number>();
  for (const c of categories) {
    const vals: number[] = [];
    for (const s of sides) {
      const v = s[c.statId];
      if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
    }
    vals.sort((a, b) => a - b);
    // Under four teams there is no spread worth the name — a two-value "p95"
    // is one of the two figures on the page, which would make every bar full.
    if (vals.length < 4) continue;
    const trimmed = quantile(vals, 0.95) - quantile(vals, 0.05);
    const range = vals[vals.length - 1] - vals[0];
    const span = trimmed > 0 ? trimmed : range;
    if (span > 0) full.set(c.statId, span);
  }
  return full;
}

/**
 * **How lopsided a category is** — the gap between the two figures against what
 * a wide gap in that category *is*, which is the length of the bar the row draws
 * toward whoever is ahead. See `categorySpread` for where the denominator comes
 * from and for the scale this replaced.
 *
 * What it says is **how close the category is**, which is the question a manager
 * reads a matchup with. It is deliberately not a probability and not a
 * projection — the two figures are printed either side of it, and the bar is the
 * glance.
 *
 * Zero either way (a category nobody has scored in yet, both sides on 0) is a
 * tie and draws nothing, which the guard gives for free. So does a category the
 * spread could not be taken for: **no scale, no bar** — the row keeps both
 * figures and the green winner, and claims nothing about the distance.
 */
function barShare(
  left: number | undefined,
  right: number | undefined,
  full: number | undefined,
): number {
  if (typeof left !== 'number' || typeof right !== 'number') return 0;
  if (typeof full !== 'number' || !(full > 0)) return 0;
  const gap = Math.abs(left - right);
  if (!Number.isFinite(gap)) return 0;
  return Math.min(1, gap / full);
}

/**
 * **What each manager did about it** — the players he took in and let go of
 * inside this matchup period, under the count of how many acquisitions that
 * spent.
 *
 * The count was the whole of the section and is the half a reader can act on
 * least: `5/10` says a manager has moved five times and not *who*, which on a
 * page about two teams' week is the more interesting half by some way — a
 * category swinging back is usually somebody's pickup, and this is where the
 * pickup is named.
 *
 * ### Which moves belong to this week, and the boundary that decides it
 *
 * ESPN's activity feed carries no scoring period on a topic, only an instant,
 * so the span is the period's own days and the test is the day a move happened
 * on. Which *day* that is, is the whole of the difficulty, and it was measured
 * against ESPN's own acquisition counter rather than assumed — the counter is
 * the one number on this section that ESPN publishes, so a list under it that
 * counts differently is a contradiction the reader can see.
 *
 * **A matchup period's moves run from 13:00 ET on the day before its first day
 * to 13:00 ET on its last.** Which is to say ESPN books an acquisition against
 * the *next* scoring period once the day's games have started — invisible on
 * six days of seven, because the next scoring period is still this matchup
 * period, and decisive on the seventh, where a Sunday-afternoon pickup spends
 * next week's allowance.
 *
 * **Measured, not guessed.** Sweeping the boundary hour against the counter
 * over seven matchup periods and 84 team-periods of the live league: the app's
 * own baseball day (3am ET) and the plain calendar day both reproduce **67 of
 * 84**, and a 13:00 ET boundary reproduces **84 of 84**. The 24 topics the two
 * rules disagree about are **every one of them on a Sunday after 13:00**, and
 * the knee is bracketed to **12:55–13:23 ET** by the 51 topics filed on the
 * seven last-days — 12:55, 12:05, 12:03, 11:58 and 11:22 stay put; 13:23 and
 * 13:46 move. 13:00 ET is when a Sunday slate starts, which is the mechanism
 * that reading implies.
 *
 * The honest caveat is that this is one league's seven weeks and ESPN
 * documents none of it, so the constant is a **measurement rather than a spec**
 * — and where it is ever wrong, the count above is ESPN's own and is the
 * authority.
 *
 * ### A trade is an add and is not an acquisition
 *
 * The counter counts free-agent and waiver pickups; a trade spends none of the
 * allowance, which is measured too — team 11's seven adds in period 15 are
 * seven trade arrivals and ESPN's counter for that week is **0**. They are
 * still players the manager took in, so they are in the list, and the row that
 * came by trade says so: without the tag a week with a trade in it is a list
 * of seven names under a count of nought with nothing on screen to reconcile
 * them.
 *
 * ### Attribution is per player, not per topic
 *
 * A topic is one act by one manager and can move players in both directions and
 * between three teams, so a side's list is built from `toTeamId`/`fromTeamId`
 * on each **player** rather than from the topic's `teamIds`. That gives a
 * trade both of its halves for free: the man who came the other way is a drop
 * on one list and an add on the other, with no case of its own.
 *
 * ### It does not say green
 *
 * The Transactions tab draws an add in `--hit`, which is right on a page whose
 * only color it is. Here green means **ahead in this category** — the winning
 * figure, its bar, and the leader's run of the meter — and an add is not a
 * category anybody is winning, so the section stays the one part of this card
 * with no color in it. What separates the two directions is the heading over
 * each run and the weight under it: a man coming in reads at full strength,
 * one going out reads muted.
 */
const PERIOD_ROLLOVER_HOUR = 13;

/** The matchup-period day a move falls on — see the boundary measurement above.
 *  Shifting the instant forward by what is left of the day after the rollover
 *  and taking the ET date is the same test written without a comparison. */
function periodDay(ms: number): string {
  return easternDate(new Date(ms + (24 - PERIOD_ROLLOVER_HOUR) * 3_600_000));
}

function movesFor(
  side: EspnMatchupSide,
  feed: EspnTransactions | null,
  from: string | null,
  to: string | null,
): { player: EspnTransactionPlayer; date: number }[] | null {
  // No feed, or a period whose own dates could not be derived — the header
  // above says the same thing by printing no dates, and a list of moves with
  // no week to belong to is not a list worth drawing.
  if (!feed || !from || !to) return null;
  const inSpan = feed.transactions.filter((t) => {
    const day = periodDay(t.date);
    return day >= from && day <= to;
  });
  // **Does the feed even reach this week?** It is read at the server's own
  // limit — 250 topics against a season of 770 on the live league — so an old
  // period is simply not in it, and drawing an empty list under a count of five
  // would be the page saying nobody moved when what it means is that it cannot
  // see that far. The oldest topic in hand is the horizon: past it, the section
  // says so instead.
  const oldest = feed.transactions[feed.transactions.length - 1];
  if (feed.capped && (!oldest || periodDay(oldest.date) > from)) return null;
  const out: { player: EspnTransactionPlayer; date: number }[] = [];
  for (const t of inSpan) {
    for (const p of t.players) {
      if (p.toTeamId === side.teamId || p.fromTeamId === side.teamId) out.push({ player: p, date: t.date });
    }
  }
  return out;
}

/**
 * One side's moves, **grouped by direction rather than labeled per row**.
 *
 * The alternative was the Transactions tab's own shape — the move's word before
 * each name — and it fails on the one case this page has that the tab does not:
 * a trade between *these two teams* puts the same man in both columns, and
 * `Traded` on both says nothing about which way he went. Naming the direction
 * per row instead (`Traded away`) is the widest label on the card in the
 * narrowest column on the page, on a phone where each side has about 150px.
 * The group heading says it once for every row under it, and a trade needs no
 * case of its own.
 *
 * What the grouping costs is the claim-against-pickup distinction the tab
 * spends a word on; the row's tooltip carries it, with the day and the bid.
 *
 * Newest first, the feed's own order, which is also the tab's.
 */
function MovesColumn({
  moves,
  teamId,
  onOpenPlayer,
}: {
  moves: { player: EspnTransactionPlayer; date: number }[];
  teamId: number;
  onOpenPlayer?: (mlbId: number) => void;
}) {
  const dir = (out: boolean) => moves.filter((m) => (m.player.fromTeamId === teamId) === out);
  const runs: { label: string; out: boolean; rows: typeof moves }[] = [
    { label: 'In', out: false, rows: dir(false) },
    { label: 'Out', out: true, rows: dir(true) },
  ];
  if (moves.length === 0) return <div className="mup-move-none">No moves</div>;
  return (
    <>
      {runs
        .filter((r) => r.rows.length > 0)
        .map((r) => (
          <div className={`mup-move-run${r.out ? ' mup-move-run-out' : ''}`} key={r.label}>
            <div className="mup-move-dir">{r.label}</div>
            <ul className="mup-move-list">
              {r.rows.map(({ player, date }, i) => {
                const detail = [
                  moveLabel(player),
                  // The day it actually happened, which is what ESPN's own
                  // activity page shows — the 13:00 boundary above decides
                  // which *week* it counts toward and has no business
                  // renaming the day.
                  prettyDate(easternDate(new Date(date))),
                  player.bid != null && player.bid > 0 ? `$${player.bid}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li className="mup-move" key={`${date}-${player.espnId}-${i}`} title={detail}>
                    {player.mlbId !== null && onOpenPlayer ? (
                      <button
                        type="button"
                        className="mup-move-name"
                        onClick={() => onOpenPlayer(player.mlbId as number)}
                      >
                        {player.name}
                      </button>
                    ) : (
                      <span className="mup-move-name">{player.name}</span>
                    )}
                    {player.via === 'trade' && <span className="mup-move-tag">Trade</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </>
  );
}

function SideHead({
  side,
  team,
  score,
  leading,
  align,
}: {
  side: EspnMatchupSide;
  team: EspnStandingsTeam | undefined;
  score: string | null;
  leading: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={`mup-side mup-side-${align}${leading ? ' mup-leading' : ''}`}>
      <TeamLogo team={team} />
      <span className="mup-side-id">
        <span className="mup-side-name">{team?.name ?? `Team ${side.teamId}`}</span>
        {team && <span className="mup-side-rec">{record(team)}</span>}
      </span>
      {score !== null && <span className="mup-side-score">{score}</span>}
    </div>
  );
}

/**
 * **Whether the projected lens can act on this board at all** — a categories
 * league whose week is still being played. Written once and exported, because
 * three surfaces test it (this card, the matchup page's head, and the Roster's
 * own `Matchup` reading) and three copies are three chances to disagree about
 * whether a card is drawing figures or estimates.
 */
export function matchupProjectable(board: EspnScoreboard): boolean {
  return board.format === 'h2h-categories' && board.live;
}

/**
 * **The matchup as the card will draw it, and whether that is the projection.**
 *
 * The comparison's whole job is to set two sides against each other across the
 * league's categories and mark the winner, and that arithmetic is identical
 * whether the figures are what has happened or what is going to — so the *data*
 * is swapped and every line below it is the code that was already checked.
 * `asProjected` is the Scoreboard's own function rather than a second one here,
 * and it keeps the team ids and the acquisitions off the live side: a manager's
 * moves are a fact about the period so far and are not projected either way,
 * which is why the Moves section reads the same under both lenses.
 *
 * Exported with `matchupProjectable` and for the same reason: the head above
 * this card prints `Projected` over the figures, and the tag and the figures
 * must come from one answer.
 */
export function matchupLens(
  board: EspnScoreboard,
  matchup: EspnMatchup | null,
  projection: EspnProjection | null,
  projected: boolean,
): { shown: EspnMatchup | null; showingProj: boolean } {
  const pm =
    matchup && matchupProjectable(board) && projected && projection?.ok
      ? projection.matchups.find((x) => x.id === matchup.id) ?? null
      : null;
  if (!matchup) return { shown: null, showingProj: false };
  return { shown: pm ? asProjected(matchup, pm) : matchup, showingProj: pm !== null };
}

/**
 * **The key to the bars, drawn beside the card rather than inside it.**
 *
 * It sat beside the meter it describes, which is where a key usually belongs
 * and is the one place on this page it could not stay: the meter is a row in
 * the middle of a card that scrolls, so the key scrolled away with it — and
 * what it explains is not that bar alone but every bar under it, ten category
 * rows the reader is still going down when the button has gone. So it goes in
 * whatever chrome the host has that does not scroll: the matchup page's pinned
 * band, and the Roster's own week face.
 *
 * Drawn only where there is something to explain — a points league has no bars,
 * and a bye has no comparison. Both are the caller's test rather than this
 * component's, the caller being the one that knows whether a card is on screen
 * at all.
 */
export function MatchupBarsKey({ categories }: { categories: number }) {
  return (
    <InfoKey className="mup-key" label="How to read these bars">
      <p>
        The bar under the two records is the <strong>whole matchup</strong> — the categories
        each side holds, ties between them, and the leader&rsquo;s share in green.
      </p>
      <p>
        Each category&rsquo;s own bar runs from its label toward whoever is ahead, and its
        length is the gap measured against <strong>the whole league&rsquo;s spread</strong> in
        that category this week. A full bar is a gap as wide as the league itself; a sliver is
        a coin flip.
      </p>
      {/* **The gesture, third — where a line of its own over the comparison
          used to say it.** It reads here because this panel is already the
          answer to *what are these bars*, and what you can do to one is the
          last sentence of that rather than a separate caption.

          What it costs is that a reader has to open the key to be told —
          which is a real cost, this feature having shipped invisible once
          already (on the scoreboard, where it had to be reported). What is
          different here is the target: a category row is the full width of
          the card with a hover tint on it, where that one was four characters
          inside a card that was itself a press, so the affordance is doing
          most of the work and the sentence is the backstop.

          Kept on the category count — its own gate before either move — so a
          categories league with nothing to press is not told to press it. */}
      {categories > 0 && (
        <p>
          <strong>Press any category</strong> for a day-by-day chart of the week.
        </p>
      )}
    </InfoKey>
  );
}

/**
 * One matchup as the comparison card: the two heads, the whole-matchup meter,
 * the categories down the middle with each side's figure beside its own name,
 * the `Projected` toggle at the foot of them, and the acquisitions and moves
 * under that.
 *
 * **A bye never reaches this component.** There is one team and nothing to
 * compare it against, so a card of one side would be a page whose whole content
 * is the line the scoreboard card already draws; both callers answer that case
 * themselves — the matchup page with its bye head and the reader's own roster,
 * the Roster view by not offering the reading at all.
 */
export function MatchupCard({
  board,
  matchup,
  teams,
  projection,
  projected,
  projectionLoading,
  onProjected,
  transactions,
  onOpenPlayer,
}: {
  board: EspnScoreboard;
  /** The matchup this card is of, **with two sides** — see the note above. */
  matchup: EspnMatchup;
  /** The league's teams by id, for the names, the records and the crests. The
   *  caller already holds this map (`board.teams`), so building a second one
   *  per render here would be one map per surface for one board. */
  teams: Map<number, EspnStandingsTeam>;
  /**
   * **Where this week is heading**, and the reader's own lens on it. The state
   * and the read both live in App: the toggle is `proj=1` in the URL and one
   * read serves every surface, so a reader who projects the board and then
   * opens a card fetches nothing. Null until it lands, and `ok: false` on a
   * period there is nothing left to project.
   */
  projection: EspnProjection | null;
  projected: boolean;
  /** The projection is in flight — the mark for which goes inside the button
   *  that started it, this card going on drawing the figures it has until the
   *  answer lands. */
  projectionLoading?: boolean;
  onProjected: (on: boolean) => void;
  /** The league's transactions feed, already in hand wherever this is drawn, so
   *  the Moves section costs no read of its own. Null until it lands, and while
   *  it is null the section is the count alone. */
  transactions: EspnTransactions | null;
  /** Opens a transacted player's page by MLB id — the kind is resolved from the
   *  season roster up in App, a transaction saying a player moved and not
   *  whether he pitches. */
  onOpenPlayer?: (mlbId: number) => void;
}) {
  const groups = useMemo(() => categoryGroups(board.categories), [board.categories]);

  /**
   * **The chart behind a category row.** A press on a row of the comparison
   * opens that category's day-by-day series for this matchup's two sides.
   *
   * It lives here rather than on the scoreboard, where it was first built. A
   * scoreboard card is a *summary* — ten of them on one page, each a grid of
   * twenty figures — and hanging a dialog off one of those numbers put a study
   * tool on the page whose job is to be scanned; nothing about a bare figure
   * said it was pressable, and the card around it is itself a press, so the
   * plain reading was "the card is the button". This card is the one you open
   * to *study* one matchup, its rows are already the category comparison, and
   * a row is a target a finger can find.
   *
   * **Lazy on the first press**, which is what earns the series a route of its
   * own: a week of ESPN rosters summed a day at a time has no business on the
   * boot path of a page most readers open to look at a roster. Cached for the
   * life of the card — a second category is free.
   */
  const [openStat, setOpenStat] = useState<number | null>(null);
  const [series, setSeries] = useState<EspnMatchupSeries | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const asked = useRef(false);
  /** Sequence-numbered, because two reads of this can be in flight — the press
   *  and a poll tick — and a stale answer must not land on a fresh one. */
  const seriesRead = useRef(0);

  const openCategory = useCallback(
    (statId: number) => {
      setOpenStat(statId);
      // **Cached for the life of the card on a settled week, re-read on a live
      // one.** A week that is over cannot move, so the first press pays for
      // every category and every reopening after it; the week being played
      // moves under the reader, and a second press an hour later must not be
      // handed the hour-old answer the first one got.
      if (asked.current && !board.live) return;
      // **Marked only once it is answered** — the rule this repo has written
      // down four times now: a mark set before the fetch makes a failed read
      // unrepeatable, and a failed chart has to be retryable by pressing again.
      // A re-read of a chart that already has its days is **quiet**: it keeps
      // the last answer standing and leaves no banner, which is the app's own
      // never-over-data rule.
      const quiet = asked.current;
      if (!quiet) setSeriesError(null);
      const seq = ++seriesRead.current;
      api
        .espnMatchupSeries(board.matchupPeriod)
        .then((r) => {
          if (seq !== seriesRead.current) return;
          asked.current = true;
          setSeries(r);
        })
        .catch((e: Error) => {
          if (seq !== seriesRead.current || quiet) return;
          setSeriesError(e.message);
        });
    },
    [board.matchupPeriod, board.live],
  );

  /**
   * **And it re-reads itself while the week is being played**, on the League
   * page's own minute.
   *
   * The chart is a running total of the same week the card above it is printing
   * and the card is polled; read once when the row was pressed, the chart was
   * the one thing on a live page frozen at the moment of the press, and a
   * reader watching an evening's games saw the cell tick up over a line that
   * never moved. Measured on the live league before this: the `Runs` chart's
   * last point stood at **72** while the cell that opened it read **75**.
   *
   * Only while a chart is actually open — a series nobody is looking at is a
   * week of ESPN rosters fetched for nothing — and only on a live week.
   * **Quiet**, so nothing blanks and the last answer stands until the next one
   * lands.
   */
  useEffect(() => {
    if (openStat === null || !board.live) return;
    const t = setInterval(() => {
      const seq = ++seriesRead.current;
      api
        .espnMatchupSeries(board.matchupPeriod)
        .then((r) => {
          if (seq === seriesRead.current) setSeries(r);
        })
        .catch(() => {});
    }, LEAGUE_POLL_MS);
    return () => clearInterval(t);
  }, [openStat, board.live, board.matchupPeriod]);

  const { shown, showingProj } = matchupLens(board, matchup, projection, projected);
  // Never null: `matchup` is non-null by this component's own contract, and
  // `matchupLens` returns null only for a null matchup.
  const { home, away } = shown as EspnMatchup;

  /**
   * **Every team's figures for this period, under the lens the card is drawing**
   * — which is what the category bars are scaled against. See `categorySpread`.
   *
   * Off `board.matchups` rather than off a fetch of its own: the card is drawn
   * from a board that already holds the whole period, and a bye is a side like
   * any other, so a league is fully represented even in a week that is eight
   * byes and two matchups. Projected the same way the card itself is, through
   * the Scoreboard's own `asProjected`, so the scale and the figures on it can
   * never come from two different lenses.
   */
  const catFull = useMemo(() => {
    const sides: Record<number, number>[] = [];
    for (const m of board.matchups) {
      const pm = showingProj ? projection?.matchups.find((x) => x.id === m.id) ?? null : null;
      const lensed = pm ? asProjected(m, pm) : m;
      if (lensed.away) sides.push(lensed.away.scores);
      if (lensed.home) sides.push(lensed.home.scores);
    }
    return categorySpread(board.categories, sides);
  }, [board.matchups, board.categories, projection, showingProj]);
  const openCat =
    openStat === null ? null : board.categories.find((c) => c.statId === openStat) ?? null;

  /**
   * **Who is ahead**, which is deliberately not the same claim as who won.
   *
   * `matchup.winner` is null for the whole of the week being played — the
   * server sets it only once the period is settled (`espn.ts`, `else if (live)
   * winner = null`), because a winner is a settled fact and ESPN's own field
   * says `UNDECIDED` until it is one. Read straight, that left the *live*
   * matchup — the one anybody is actually looking at — with neither side
   * marked: two gray triples, and a meter with no green in it.
   *
   * So the card reads the tally instead, which is the same comparison the
   * server makes when it does settle one (`hw > aw ? 'home' : …`) and which
   * agrees with ESPN's own `winner` on every one of the league's 108 settled
   * matchups. `away.losses` is `home.wins` by construction, so the two tests
   * cannot both hold, and a dead-level week marks neither.
   */
  const ahead =
    away === null
      ? null
      : away.wins > away.losses
        ? away.teamId
        : home.wins > home.losses
          ? home.teamId
          : null;
  const score = (side: EspnMatchupSide) =>
    board.format === 'h2h-points'
      ? typeof side.points === 'number'
        ? String(Math.round(side.points * 100) / 100)
        : '—'
      : catScore(side);

  const awayName = away ? teams.get(away.teamId)?.name ?? `Team ${away.teamId}` : '';
  const homeName = teams.get(home.teamId)?.name ?? `Team ${home.teamId}`;

  /**
   * The three runs of the matchup meter — away's categories, the ties, home's —
   * and the sentence a reader gets on hover or from a screen reader, a bar
   * being a thing you see rather than a thing you can read.
   *
   * Null on a points league, which has one number a side and says so in its own
   * note below.
   */
  const meter =
    away && board.format !== 'h2h-points'
      ? {
          away: away.wins,
          ties: away.ties,
          home: away.losses,
          label: `Categories: ${awayName} ${away.wins}, ${homeName} ${home.wins}${
            away.ties > 0 ? `, ${away.ties} tied` : ''
          }`,
        }
      : null;

  /**
   * What a category row says on hover: the two figures and who is ahead, which
   * is the bar beside them put into words. It carries the category's **full**
   * name too, that being what the label under it abbreviates and what the cell
   * used to spend its own `title` on.
   */
  const rowTitle = (
    c: EspnCategory,
    l: number | undefined,
    r: number | undefined,
    w: 'left' | 'right' | 'tie' | null,
  ) => {
    const pair = `${fmtValue(l, c)} to ${fmtValue(r, c)}`;
    if (w === null) return `${c.name} — ${pair}`;
    // The one tie with no figures in it — a rate neither side has a
    // denominator for yet — says so, rather than reading `— to —: level`, which
    // is three dashes and no sentence.
    if (w === 'tie' && typeof l !== 'number' && typeof r !== 'number')
      return `${c.name} — neither side has a figure yet, so it is level`;
    if (w === 'tie') return `${c.name} — ${pair}: level`;
    return `${c.name} — ${pair}: ${w === 'left' ? awayName : homeName} ahead`;
  };

  /**
   * **How many acquisitions each manager has spent this week**, at the foot of
   * the comparison.
   *
   * It is the one thing a category matchup turns on that is not a category: a
   * manager two behind in saves with `2/10` left has a move to make and one at
   * `10/10` has not. It reads as a row of the comparison — the same
   * `1fr auto 1fr`, so each figure lands under the name it belongs to — because
   * that is what it is.
   *
   * `5/10` where the league limits them per period and a bare count where it
   * does not, which is the honest reading of a league with no cap: the number
   * is still worth having, the denominator is not ours to invent. A manager
   * ESPN reports no counter for at all is a dash.
   */
  const acqCell = (side: EspnMatchupSide) =>
    side.acquisitions === null
      ? '—'
      : board.acquisitionLimit === null
        ? String(side.acquisitions)
        : `${side.acquisitions}/${board.acquisitionLimit}`;
  const acqTitle = (side: EspnMatchupSide) =>
    side.acquisitions === null
      ? 'ESPN reports no acquisition count for this team'
      : board.acquisitionLimit === null
        ? `${side.acquisitions} acquisitions this matchup period`
        : `${side.acquisitions} of ${board.acquisitionLimit} acquisitions used this matchup period`;

  /**
   * The two lists under the count. Null means the feed cannot answer for this
   * week — see `movesFor`, which is where that is decided and why.
   */
  const awayMoves = away ? movesFor(away, transactions, board.start, board.end) : null;
  const homeMoves = movesFor(home, transactions, board.start, board.end);
  /** Whether the section has anything to say at all beyond a count — which is
   *  what keeps it on screen for a league ESPN reports no counter for, where
   *  the two figures are dashes and the lists are the whole of it. */
  const hasMoves = (awayMoves?.length ?? 0) > 0 || (homeMoves?.length ?? 0) > 0;

  const projectable = matchupProjectable(board);

  return (
    <>
      {/* **A projected card is drawn as a projection**, which is this app's
          standing rule that an estimate never wears the same clothes as a
          measurement. Here that is a **dashed border**, at the size of the
          whole card rather than per cell because every figure on it is
          projected — plus the head's own `Projected` tag and its dates. The
          bars themselves stay solid: they were hatched for a round, and a
          broken mark earns its keep by marking one row among solid ones, which
          on a card where everything is projected it cannot do. See
          `.mup-card.mup-proj` in the stylesheet. */}
      <div className={`mup-card${showingProj ? ' mup-proj' : ''}`}>
        <div className="mup-heads">
          <SideHead
            side={away as EspnMatchupSide}
            team={teams.get((away as EspnMatchupSide).teamId)}
            score={score(away as EspnMatchupSide)}
            leading={ahead === (away as EspnMatchupSide).teamId}
            align="left"
          />
          <span className="mup-vs">vs</span>
          <SideHead
            side={home}
            team={teams.get(home.teamId)}
            score={score(home)}
            leading={ahead === home.teamId}
            align="right"
          />
        </div>

        {/* **The whole matchup in one bar**, directly under the two records it
            is made of: the categories each side holds, the ties between them,
            and the leader's share in green — the same green the winning figure
            in every row below takes, so the card has one color meaning one
            thing.

            The counts are the **server's own tally** (`side.wins/losses/ties`)
            rather than a second count made here: ESPN fills its own only once a
            matchup is over, so `espn.ts` computes it live and final alike, and
            that computation is the one checked against ESPN on all 1,080
            category comparisons of the league's settled weeks. The triples in
            the heads read the same three numbers, so the bar and the score
            cannot come to disagree. */}
        {board.format !== 'h2h-points' && meter !== null && (
          <div className="mup-meter-row">
            <div className="mup-meter" role="img" aria-label={meter.label} title={meter.label}>
              {/* Only a segment with something in it is rendered, so the 2px
                  gaps fall between the runs that exist rather than opening up
                  beside two zero-width boxes. */}
              {meter.away > 0 && (
                <span
                  className={`mup-meter-seg${
                    ahead === (away as EspnMatchupSide).teamId ? ' mup-meter-lead' : ''
                  }`}
                  style={{ flexGrow: meter.away }}
                />
              )}
              {meter.ties > 0 && (
                <span className="mup-meter-seg mup-meter-tied" style={{ flexGrow: meter.ties }} />
              )}
              {meter.home > 0 && (
                <span
                  className={`mup-meter-seg${ahead === home.teamId ? ' mup-meter-lead' : ''}`}
                  style={{ flexGrow: meter.home }}
                />
              )}
            </div>
          </div>
        )}

        {board.format === 'h2h-points' ? (
          <div className="mup-note">
            A points league has one number a side, so there is no category line to break down.
          </div>
        ) : (
          groups.map((g) => {
            /* The winner of each category of this group, worked once: the rows
               draw it and the heading counts it, so a side of the ball's tally
               and the green figures under it are one arithmetic rather than two
               that can drift. `winnerOf` is the same function the scoreboard's
               own cells use, run over this group alone — the server publishes a
               tally for the matchup and not for half of it. */
            const won = g.categories.map((c) =>
              winnerOf((away as EspnMatchupSide).scores[c.statId], home.scores[c.statId], c),
            );
            const tally = (side: 'left' | 'right') =>
              `${won.filter((w) => w === side).length}-${
                won.filter((w) => w !== null && w !== 'tie' && w !== side).length
              }-${won.filter((w) => w === 'tie').length}`;
            const tallyTitle = (side: 'left' | 'right') =>
              `${side === 'left' ? awayName : homeName} in the ${g.label.toLowerCase()}' categories, won-lost-tied`;
            return (
              <div className="mup-group" key={g.side}>
                {/* The heading takes the row's own grid, so the label centers
                    over the category column it names and each side's tally
                    lands in the column its figures are in — which is also the
                    one number this page could not say before: you are winning
                    the bats and losing the arms. */}
                <div className="mup-group-head">
                  <span className="mup-group-tally" title={tallyTitle('left')}>
                    {tally('left')}
                  </span>
                  <span className="mup-group-label">{g.label}</span>
                  <span className="mup-group-tally" title={tallyTitle('right')}>
                    {tally('right')}
                  </span>
                </div>
                {g.categories.map((c, i) => {
                  const l = (away as EspnMatchupSide).scores[c.statId];
                  const r = home.scores[c.statId];
                  const w = won[i];
                  const share = barShare(l, r, catFull.get(c.statId));
                  const state = (s: 'left' | 'right') =>
                    w === null ? '' : w === s ? ' mup-win' : w === 'tie' ? ' mup-tie' : ' mup-loss';
                  return (
                    <button
                      type="button"
                      className="mup-row"
                      key={c.statId}
                      aria-haspopup="dialog"
                      aria-label={`${c.name} — chart of how it moved through this matchup`}
                      /* **The chart is of the days played, whichever lens the
                         figures are under** — it is a running total and a
                         projection is not one — so while projected the title
                         says so rather than leaving a reader to press `63` and
                         find a line ending at 35. */
                      title={`${rowTitle(c, l, r, w)}${
                        showingProj ? ' by the end of the week' : ''
                      } — press for the day-by-day chart of the days played`}
                      onClick={() => openCategory(c.statId)}
                    >
                      <span className={`mup-val mup-val-left${state('left')}`}>
                        {fmtValue(l, c)}
                      </span>
                      {/* The two figures sit at the edges, under the teams they
                          belong to, and the bar between them says which way the
                          category is going and how far. That is what the page is
                          opened to find out and what a column of bare numbers
                          made the reader work out ten times over. Each
                          half-track is anchored at the label, so the fill grows
                          *out of* the category it belongs to toward the side
                          that is ahead — the Splits card's own rule that a bar
                          grows out of its zero. */}
                      <span className="mup-track mup-track-left">
                        {w === 'left' && (
                          <span className="mup-fill" style={{ width: `${share * 100}%` }} />
                        )}
                      </span>
                      <span className="mup-cat">{c.label}</span>
                      <span className="mup-track mup-track-right">
                        {w === 'right' && (
                          <span className="mup-fill" style={{ width: `${share * 100}%` }} />
                        )}
                      </span>
                      <span className={`mup-val mup-val-right${state('right')}`}>
                        {fmtValue(r, c)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}

        {/* **The `Projected` toggle, at the foot of the comparison rather than
            in the head.**

            It sat at the far end of the Back row, beside the `Projected` tag it
            lights — which is the Scoreboard's own arrangement and the wrong one
            here, for two reasons this card has and that one does not. The head
            is **shared by three pages**, so a control belonging to one of them
            had to be gated out of the other two and cost the band a wrapped
            line on a phone (114 → 160px) whichever page was on screen. And it
            is the *card* whose figures it swaps: below them it reads as the
            comparison's own control, where above them it read as one more thing
            about the week alongside the dates.

            Directly above `Moves` because that is where the categories end —
            everything under it is a fact about the period so far and is not
            projected either way, so the toggle is the last line of the thing it
            governs rather than the first line of the thing it does not. The tag
            in the head still says what the figures **are**, which is the one
            half of this that has to stay visible while the reader scrolls.

            Centered rather than at an edge: this card is a symmetric comparison
            and a control at one end of it would read as belonging to that
            manager. `.lg-proj-tools` carries a `margin-left: auto` for its place
            on the scoreboard's head row, which the stylesheet resets here — an
            auto margin eats the free space `justify-content` would have
            divided. */}
        {projectable && (
          <div className="mup-proj-row">
            <ProjectedTools
              projection={projection}
              categories={board.categories.length}
              showing={showingProj}
              projected={projected}
              loading={projectionLoading}
              onProjected={onProjected}
              /* Upward, because this row is at the foot of a card that runs
                 past the bottom of the window: opening downward left the panel
                 at the hook's own 120px floor, a four-paragraph key read
                 through a letterbox. The stylesheet anchors it to match. */
              drop="up"
            />
          </div>
        )}

        {/* Under the categories, because it is what a manager does *about* them
            rather than one of them — and at the foot rather than the head for
            the same reason.

            **The counts are in the heading and there is no `Acq` row.** They
            were a category row of their own — `5/10 · ACQ · 7/10` under a
            `MOVES` label — which is one row spent on a heading and a subtitle
            for the same section, and which drew a *category*'s shape around the
            one figure on this card that is not one: nobody is winning
            acquisitions, so the row had no bar, no color and two deliberately
            empty track cells holding its figures in place. The heading is the
            row now, exactly as `BATTERS` carries its side's won-lost-tied at
            the same two edges — one line, the same grid, and the lists start
            where the row used to. */}
        {(home.acquisitions !== null ||
          (away as EspnMatchupSide).acquisitions !== null ||
          hasMoves) && (
          <div className="mup-group mup-acq">
            <div className="mup-group-head">
              <span className="mup-group-tally" title={acqTitle(away as EspnMatchupSide)}>
                {acqCell(away as EspnMatchupSide)}
              </span>
              <span className="mup-group-label">Moves</span>
              <span className="mup-group-tally" title={acqTitle(home)}>
                {acqCell(home)}
              </span>
            </div>
            {/* **Who those moves were**, which is the half of this section a
                reader can actually act on: `5/10` says a manager has moved five
                times and not whom he moved, and on a page about two teams' week
                the pickup behind a category swinging back is the more
                interesting fact by some way.

                Two columns under the two counts, mirrored the way every other
                pair on this card is — each list hugging the edge its own team's
                figures are on. */}
            {awayMoves && homeMoves ? (
              <div className="mup-moves">
                <div className="mup-moves-side">
                  <MovesColumn
                    moves={awayMoves}
                    teamId={(away as EspnMatchupSide).teamId}
                    onOpenPlayer={onOpenPlayer}
                  />
                </div>
                <div className="mup-moves-side mup-moves-right">
                  <MovesColumn
                    moves={homeMoves}
                    teamId={home.teamId}
                    onOpenPlayer={onOpenPlayer}
                  />
                </div>
              </div>
            ) : (
              transactions &&
              board.start &&
              board.end && (
                // The feed is in hand, the week has dates, and the feed does not
                // reach that far back — said rather than drawn as two empty
                // columns under a count of five, which would read as nobody
                // having moved.
                <div className="mup-move-none mup-moves-gap">
                  ESPN&rsquo;s activity feed doesn&rsquo;t reach back to this week.
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Above the card rather than beside it: the host sets
          `DialogLayerContext` where it has one (the matchup overlay's own 48),
          so this takes the next rung and one press of Escape closes the chart
          while the page under it stays put. */}
      {openStat !== null && openCat && (
        <Modal
          title={`${openCat.name} — week ${board.matchupPeriod}`}
          titleId="mup-series-title"
          className="lg-series-box"
          onClose={() => setOpenStat(null)}
        >
          {seriesError ? (
            <div className="mser-none">
              <p>Couldn&rsquo;t read the day-by-day totals: {seriesError}</p>
            </div>
          ) : series && series.matchupPeriod === board.matchupPeriod ? (
            <MatchupSeriesChart
              series={series}
              category={openCat}
              teamIds={away ? [away.teamId, home.teamId] : [home.teamId]}
              teams={teams}
            />
          ) : (
            <LoadingLine>Reading the week a day at a time</LoadingLine>
          )}
        </Modal>
      )}
    </>
  );
}
