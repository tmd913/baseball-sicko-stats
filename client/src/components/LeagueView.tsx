/**
 * The League view — the one page in this app that is about the *fantasy
 * league* rather than about players.
 *
 * **Three tabs, because they are three questions.** The page was a scoreboard
 * with a season table stacked under it, which is the shape a page takes when it
 * has one question and a half; it has three now and each is a page of its own:
 *
 *  1. **Scoreboard** — every matchup of one period, the category line under
 *     both sides and the winning half of each marked. *Am I winning.*
 *  2. **Rankings** — every team's figure in every category and where that
 *     figure stands, over a span the reader picks. *Why.*
 *  3. **Transactions** — who added, dropped and traded whom. *What has been
 *     going on.*
 *
 * **The period arrows live inside the Scoreboard tab rather than above the
 * strip**, and that is a decision rather than a placement. A control above the
 * tabs is a control over the page, and this one governs exactly one third of
 * it: the Rankings tab has a span filter of its own — which is a *different*
 * question, four named cuts rather than a week at a time — and Transactions is
 * a feed with no period on it at all. Left above the strip, `‹ Week 19 ›` would
 * have sat over two tabs it says nothing about, and a reader pressing it on the
 * Transactions tab would have watched nothing happen. The app's own precedent
 * is the date control, which sits with the roster tabs it qualifies and is
 * hidden on the research board it does not.
 *
 * **Which tab is open is in the URL** (`lt=`), because it decides what data is
 * on screen — the rule `view=`, `win=` and `mp=` all follow. The Scoreboard is
 * the default and is omitted, so a bare `?view=league` opens where the page
 * always opened.
 *
 * **Each tab's data is read on its first open and kept**, the way the player
 * page's tabs are — with one exception: the transactions feed is read on entry
 * to the **view**, whichever tab is open, because the red dot on the
 * Transactions tab is computed from its head and nothing else on the wire
 * carries that. All three are then re-read a minute at a time for as long as
 * the page is on screen, quietly and only for what can still change
 * (`App.tsx::LEAGUE_POLL_MS`). See `docs/claude/client-league.md`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EspnCategory,
  EspnCategorySide,
  EspnMatchup,
  EspnMatchupSide,
  EspnPeriodSpan,
  EspnProjectedMatchup,
  EspnProjectedSide,
  EspnProjection,
  EspnRankSpan,
  EspnRankings,
  EspnScoreboard,
  EspnStandingsTeam,
  EspnTransactions,
  SeasonPlayer,
} from '../types';
import { LoadingBlock, SpinningBaseball } from './Loading';
import { useDismissable, usePopoverFit } from '../hooks';
import { prettyDate, wideRange } from '../lib';

/** Re-exported: this view's own two neighbors import it from here, and the
 *  helper itself now lives in `lib.ts` — four surfaces print a span of days. */
export { prettyDate };
import { ProjectedGlyph, ProjectionKey } from './Projection';
import LeagueRankings from './LeagueRankings';
import LeagueTransactions, { type TrendDeltas } from './LeagueTransactions';

/* ---- Formatting ---------------------------------------------------------
 *
 * A category's units are the league's, so the format comes off the category
 * rather than off a guess about the number: `.759` is an OPS and `3.93` is an
 * ERA, and printing either the other way is the difference between a stat and
 * a wrong stat. `count` is deliberately not `toFixed(0)` — a count is an
 * integer already, and rounding one would hide a fractional value the app has
 * no business inventing.
 */
export function fmtValue(value: number | undefined, cat: EspnCategory): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (cat.format === 'avg') {
    const s = value.toFixed(3);
    // The slash-line convention: `.759` rather than `0.759`, and `1.024` keeps
    // its 1 because it is a real digit.
    return s.startsWith('0.') ? s.slice(1) : s;
  }
  if (cat.format === 'rate') return value.toFixed(2);
  return String(Math.round(value * 1000) / 1000);
}

/**
 * **A team's short name**, for the places a full one will not fit — the matchup
 * page's three-tab strip above all, where `The Stickystackers` and
 * `Brian&Tom's Excellent Adventure` clipped mid-word at 320 and crowded the
 * strip at every width above it.
 *
 * **ESPN's own where there is one**, which there almost always is: a manager
 * sets it and ESPN shows it on its own scoreboard, so it is the league's own
 * vocabulary rather than a rendering of ours — and it is often *not* derivable
 * from the name (`GREG` for The Homewreckers, `HOFF` for THE BRONX FLOATERS,
 * `BETS` for Sho me the Parlay), which is the strongest argument for reading it
 * rather than computing one. On the live league all twelve have one, 2 to 4
 * characters.
 *
 * **Derived only where the field is empty.** Initials of the significant words
 * (`Pirates Cove` → `PC`, `Let's Go Mets` → `LGM`), or the first four letters
 * where there is only one word left (`Homewreckers` → `HOME`), with the
 * articles and conjunctions dropped so `The` cannot be a team's whole
 * abbreviation. A name with no letters or digits in it at all falls back to the
 * team's id, which is what every other unnameable team on this view does.
 *
 * The **full name is never lost**: every caller keeps it in the control's own
 * `title`, and the two places with room for it — a scoreboard card and a
 * rankings row — go on printing it.
 */
const ABBREV_NOISE = new Set(['the', 'a', 'an', 'of', 'and']);

export function teamAbbrev(team: EspnStandingsTeam | undefined, teamId: number): string {
  const own = team?.abbrev?.trim();
  if (own) return own;
  const words = (team?.name ?? '')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w && !ABBREV_NOISE.has(w.toLowerCase()));
  if (words.length === 0) return `T${teamId}`;
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** `7-7-4`, or `7-7` where the league has no ties to report. */
export function record(t: { wins: number; losses: number; ties: number }): string {
  return t.ties > 0 ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`;
}

/**
 * A matchup score, which in a categories league is **not one number**.
 *
 * A head-to-head categories matchup is won category by category, so what a
 * side *has* is how many it is winning, losing and tied in: a team up in six,
 * down in three and level in one reads `6-3-1`. Printing the wins alone — which
 * is what this did — said `6` beside a `3` and left the reader to work out how
 * many of the ten were still level, or whether the other seven had even been
 * played.
 *
 * **The triple is the server's own tally, not a second count**, which matters
 * because that tally is the thing that has been checked: ESPN fills its
 * `cumulativeScore` only once a matchup is over, so `espn.ts` computes it for
 * every matchup live and final alike — and the computed answer matched ESPN's
 * on all 1,080 category comparisons of the league's 18 completed periods. A
 * second count here would be a second definition of who is winning a category,
 * free to drift from the one that was measured.
 *
 * **All three terms, always**, where the season record beside it drops a zero
 * tie count: the three are a partition of the categories and the sum is a fact
 * a reader can check against the header above it, which `6-3` cannot be. It
 * also keeps the two numbers on the row telling apart — `7-7` as a season
 * record and `7-7` as this week's categories would be the same string meaning
 * two different things an inch apart.
 */
export function catScore(side: { wins: number; losses: number; ties: number }): string {
  return `${side.wins}-${side.losses}-${side.ties}`;
}

/** The two sides of the ball, in the order a fantasy line is read, plus the
 *  bucket for a category the server's stat table cannot place. */
const SIDE_LABEL: Record<EspnCategorySide, string> = {
  batting: 'Batters',
  pitching: 'Pitchers',
  other: 'Other',
};
const SIDE_ORDER: EspnCategorySide[] = ['batting', 'pitching', 'other'];

export interface CategoryGroup {
  side: EspnCategorySide;
  label: string;
  categories: EspnCategory[];
}

/**
 * The league's categories, split into batters and pitchers.
 *
 * **Ten categories in one run is a list, not a line.** A manager reads a
 * category league as two halves — his bats and his arms are two rosters doing
 * two jobs — and `R HR RBI W ERA SB WHIP K OPS SVHD`, which is the live
 * league's own order, interleaves them: the eye has to sort the row before it
 * can read either half of it. Split, each half is five columns, which is also
 * what stops the scoreboard's category line overflowing a phone.
 *
 * **Which side a category is on is the server's answer, not a guess made
 * here.** `STAT_META` names every stat id the app knows and now names the side
 * and the reading order with it, which is the only place that can: a label
 * cannot say it — `H` is a hit and a hit allowed, `K` a strikeout taken and a
 * strikeout thrown, and `BB`, `HR`, `HBP` and `IBB` are each two categories
 * under one abbreviation. Pattern-matching the labels here would get four of
 * them wrong on a league that scores both.
 *
 * **A category it cannot place is drawn rather than dropped**, in a third
 * group called `Other` — which is the honest bucket for an ESPN stat id the
 * server's table has never been read against, the same one that already draws
 * its header as `Stat 62`. Filing it under Batters would be a claim; a group of
 * its own is an admission. A group with nothing in it is not drawn at all, so
 * the ordinary league sees two.
 *
 * The order within a group is the server's `order`, `statId` breaking a tie so
 * the result is stable whatever the league's own order was.
 */
export function categoryGroups(categories: EspnCategory[]): CategoryGroup[] {
  return SIDE_ORDER.flatMap((side) => {
    const list = categories
      .filter((c) => c.side === side)
      .sort((a, b) => a.order - b.order || a.statId - b.statId);
    return list.length > 0 ? [{ side, label: SIDE_LABEL[side], categories: list }] : [];
  });
}

/**
 * A team's logo, or its abbreviation.
 *
 * ESPN lets a manager upload **any URL** — the live league carries images on
 * `thespun.com` and `pbs.twimg.com` beside ESPN's own CDN — so a dead link is
 * the ordinary case rather than the exceptional one. `onError` swaps to the
 * abbreviation rather than leaving a broken-image glyph, which is the same
 * fallback `TeamMark` makes for an MLB cap that fails to load.
 */
/** The generic mark a team with no usable logo wears.
 *
 * **An image rather than the club's initials**, which is what stood here. Three
 * letters in a circle read as a *broken* logo — the eye takes it as text that
 * failed to become a picture — where a plain mark reads as the absence of one,
 * which is the honest statement: this manager has not set a logo, or ESPN's URL
 * for it is dead (on a real league that is the ordinary case rather than the
 * exception, which is why this is drawn with as much care as the real thing).
 *
 * A baseball, because the app already has one and this is a baseball app: it is
 * `BaseballMark`'s own shape in `--faint`, so the default sits in the same
 * vocabulary as the roster mark and the spinner rather than importing a
 * silhouette from somewhere else. The club's abbreviation is not lost — it is
 * the cell's `title`, where a name too long for the column already goes. */
function DefaultTeamLogo() {
  return (
    <span className="lg-logo lg-logo-none" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="9" strokeWidth="1.6" />
        <path d="M6.4 5.4c2.1 2 3.1 4.2 3.1 6.6s-1 4.6-3.1 6.6" strokeWidth="1.4" />
        <path d="M17.6 5.4c-2.1 2-3.1 4.2-3.1 6.6s1 4.6 3.1 6.6" strokeWidth="1.4" />
      </svg>
    </span>
  );
}

export function TeamLogo({ team }: { team: EspnStandingsTeam | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!team || !team.logo || failed) return <DefaultTeamLogo />;
  return (
    <img
      className="lg-logo"
      src={team.logo}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * A team's name with its record under it.
 *
 * **Stacked rather than side by side**, which is where the record used to sit.
 * The two are not the same kind of fact — the name is who this is and the
 * record is how their season has gone — and on one line they read as a single
 * run of text competing for the same slack the name needs to ellipsize into;
 * the shorter of them also sat between the name and the headline score, so a
 * long team name pushed the record about the row. Under it, the name has the
 * whole width and the record is a caption on it. It is the shape the Rankings
 * table's own team cell already has (`.lg-row-name` over `.lg-row-sub`).
 */
function SideIdentity({
  team,
  teamId,
}: {
  team: EspnStandingsTeam | undefined;
  teamId: number;
}) {
  return (
    <span className="lg-side-id">
      <span className="lg-team-name">{team?.name ?? `Team ${teamId}`}</span>
      {team && <span className="lg-team-rec">{record(team)}</span>}
    </span>
  );
}

/* ---- The scoreboard ----------------------------------------------------- */

/**
 * Which way a category has gone, for one side.
 *
 * Computed from the two scores rather than read, because ESPN fills its own
 * `result` only once a matchup is **over** — see `espn.ts`, where the same
 * arithmetic is checked against ESPN's answer on 1,080 finished categories. A
 * category one side is ineligible for (absent from `scores`) is `null`: not a
 * win, not a loss, and not drawn as either.
 */
function outcome(
  mine: number | undefined,
  theirs: number | undefined,
  cat: EspnCategory,
): 'win' | 'loss' | 'tie' | null {
  if (typeof mine !== 'number' || typeof theirs !== 'number') return null;
  if (mine === theirs) return 'tie';
  return (cat.lowerBetter ? mine < theirs : mine > theirs) ? 'win' : 'loss';
}

/**
 * **A projected matchup wearing the live one's shape**, so the card draws it
 * with no knowledge of projections at all.
 *
 * The card's whole job is to compare two sides across the league's categories and
 * colour the winner, and that arithmetic is identical whether the figures are
 * what has happened or what is going to. So rather than teaching it a second mode
 * — a second set of cells, a second tally, a second `leading` test — the *data*
 * is swapped and everything downstream is the code that was already checked.
 *
 * Three things are kept from the live side because the projection does not touch
 * them: `points` (a points league is not projected at all — see the toggle's own
 * gate), `acquisitions` (a fact about the period so far), and the team ids.
 *
 * **`winner` is the projection's own and is never null**, where a live matchup's
 * is: that is what lights the leading side's name, and a projection whose whole
 * point is to say where the week is going has no business declining to.
 */
export function asProjected(m: EspnMatchup, p: EspnProjectedMatchup): EspnMatchup {
  const side = (orig: EspnMatchupSide, pr: EspnProjectedSide): EspnMatchupSide => ({
    ...orig,
    scores: pr.scores,
    wins: pr.wins,
    losses: pr.losses,
    ties: pr.ties,
  });
  return {
    id: m.id,
    home: side(m.home, p.home),
    away: m.away && p.away ? side(m.away, p.away) : null,
    winner: p.winner,
  };
}

function MatchupCard({
  matchup,
  categories,
  teams,
  myTeamId,
  format,
  live,
  onOpen,
}: {
  matchup: EspnMatchup;
  categories: EspnCategory[];
  teams: Map<number, EspnStandingsTeam>;
  myTeamId: number | null;
  format: EspnScoreboard['format'];
  live: boolean;
  onOpen: (id: number) => void;
}) {
  const { home, away } = matchup;
  const mine = myTeamId != null && (home.teamId === myTeamId || away?.teamId === myTeamId);
  const groups = useMemo(() => categoryGroups(categories), [categories]);

  /**
   * **A bye is one side rather than a different card.**
   *
   * It drew a name, the word `Bye` and nothing else, on the reasoning that a
   * category grid with one row in it is not a comparison. True, and it threw
   * away the thing a manager on a bye week actually wants: **his own numbers**.
   * ESPN fills `cumulativeScore` for a bye exactly as it does for a matchup —
   * checked on the live league, all 23 stats with the period's own figures
   * (24 R, 7 HR, .677 OPS over the week rather than the season) — so the line
   * was there all along and the card simply declined to draw it.
   *
   * So the card is one shape with one or two sides: the grid draws a row per
   * side, and what a bye loses is only what it genuinely hasn't got — an
   * opponent to be winning or losing against, and a headline triple, which is a
   * count of categories won and is nothing at all with nobody to win them from.
   */
  const sides = away ? [away, home] : [home];

  /** The headline beside each name — and in a categories league it is a
   *  **triple rather than a number**: won, lost and tied, which is what a side
   *  of a category matchup actually has. See `catScore`. A points league has
   *  one number a side and takes it. Null on a bye, there being no categories
   *  won from anybody. */
  const score = (side: typeof home) =>
    !away ? null : format === 'h2h-points' ? fmtPoints(side.points) : catScore(side);

  const leading =
    matchup.winner === 'home' ? home.teamId : matchup.winner === 'away' ? away?.teamId : null;

  /**
   * **The whole card opens the matchup**, where a `Breakdown →` link at its
   * foot used to.
   *
   * That link was argued for and the argument was about *accessibility* rather
   * than about the reader: wrapping the card in one control would put a hundred
   * titled cells inside a single tab stop and one accessible name. Both halves
   * of that are answerable and neither is a reason to make somebody aim at
   * eleven characters — a card is a matchup, and a press on it should open it,
   * which is what every row of the research board and every row of the Game Log
   * already do.
   *
   * So it is `role="button"` with a `tabIndex` and an **`aria-label` naming the
   * two teams**, which is what fixes the "one accessible name" half: the name is
   * `Baldy's Bozos vs Sho me the Parlay — breakdown` rather than the whole grid
   * read out. The cells keep their titles, which are a pointer's affordance and
   * were never in the tab order to begin with. Enter and Space press it, Space
   * with `preventDefault` so it does not also scroll the board underneath.
   */
  const label = away
    ? `${teams.get(away.teamId)?.name ?? `Team ${away.teamId}`} vs ${
        teams.get(home.teamId)?.name ?? `Team ${home.teamId}`
      } — breakdown`
    : `${teams.get(home.teamId)?.name ?? `Team ${home.teamId}`} — roster and feed`;
  const open = () => onOpen(matchup.id);

  return (
    <div
      className={`lg-matchup${away ? '' : ' lg-bye'}${mine ? ' lg-mine' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      {mine && <div className="lg-mine-tag">Your matchup</div>}
      {sides.map((side) => {
        const team = teams.get(side.teamId);
        return (
          <div
            key={side.teamId}
            className={`lg-side${leading === side.teamId ? ' lg-leading' : ''}`}
          >
            <TeamLogo team={team} />
            <SideIdentity team={team} teamId={side.teamId} />
            {/* The triple, or — on a bye — the word for why there isn't one. */}
            {away ? (
              <span className="lg-side-score">{score(side)}</span>
            ) : (
              <span className="lg-bye-tag">Bye</span>
            )}
          </div>
        );
      })}

      {/* A points league has one number a side and no category line to draw;
          saying so is the whole of what its card holds.

          **One block per side of the ball**, each with its own head and its own
          two rows, rather than one ten-column run: the league's own order
          interleaves bats and arms, so a reader wanting "how are my pitchers
          doing" had to pick four columns out of ten by eye. Five columns is
          also what fits a phone — the single run overflowed one and scrolled.
          Each block's own `border-top` is the break between the two. */}
      {format === 'h2h-categories' && groups.length > 0 && (
        <div className="lg-cat-groups">
          {groups.map((g) => (
            <div className="lg-cats" role="table" aria-label={`${g.label} categories`} key={g.side}>
              <div className="lg-cat-row lg-cat-head" role="row">
                {/* Which side of the ball this block is, in the column the two
                    rows below carry their badge in — the head row's first cell
                    rather than a line of its own above it, which is 15px of a
                    card that draws two of these blocks. */}
                <span className="lg-cat-side" role="columnheader">
                  {g.label}
                </span>
                {g.categories.map((c) => (
                  <span key={c.statId} role="columnheader" title={c.name}>
                    {c.label}
                  </span>
                ))}
              </div>
              {sides.map((side, i) => {
                // Nobody to compare against on a bye, which is what makes the
                // figures plain: a category is neither won nor lost, so the
                // cells take no color and say only what he did.
                const other = away ? (i === 0 ? home : away) : null;
                const team = teams.get(side.teamId);
                return (
                  <div className="lg-cat-row" role="row" key={side.teamId}>
                    {/* Whose row this is. The two rows are in the same order as
                        the two names above them, which is a thing a reader has
                        to hold in their head — and has to hold twice over on a
                        card carrying a batting block and a pitching one. The
                        badge says it on the row. */}
                    <span
                      className="lg-cat-mark"
                      role="rowheader"
                      title={team?.name ?? `Team ${side.teamId}`}
                    >
                      <TeamLogo team={team} />
                    </span>
                    {g.categories.map((c) => {
                      const v = side.scores[c.statId];
                      const state = other ? outcome(v, other.scores[c.statId], c) : null;
                      const note = `${c.name}: ${fmtValue(v, c)}${
                        state === 'win'
                          ? ' — winning'
                          : state === 'loss'
                            ? ' — losing'
                            : state === 'tie'
                              ? ' — tied'
                              : ''
                      }${live ? ' so far' : ''}`;
                      // **A category with no figure is not a press**, there
                      // being nothing to chart: a side ESPN reports as
                      // ineligible has no score, and the cell says so by being
                      // the plain span it always was.
                      if (typeof v !== 'number') {
                        return (
                          <span key={c.statId} role="cell" title={note}>
                            {fmtValue(v, c)}
                          </span>
                        );
                      }
                      return (
                        <span
                          key={c.statId}
                          role="cell"
                          className={state ? `lg-cat-${state}` : undefined}
                          title={note}
                        >
                          {fmtValue(v, c)}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* The way through to the Matchup tab for *this* matchup — a text door in
          the accent rather than the whole card made pressable, which is the
          idiom the player page's Overview already uses for `Stats →` and
          `News →`. A card is not made a button here for a stated reason: every
          cell in the grid above carries its own `title`, and wrapping the lot
          in one control would put a hundred titled cells inside a single tab
          stop and one accessible name. */}
    </div>
  );
}

/**
 * **The `Projected` toggle and its key**, as one control — because it is drawn
 * in two places now and two copies of it would be two controls that will one
 * day differ.
 *
 * It was the Scoreboard's alone, on the stated reasoning that the matchup page
 * "has no state tag for a projected figure to live in" and that carrying the
 * lens into a page whose Summary is a comparison of *what has happened* would
 * leave it speaking in two tenses. The first half was a fact about that page
 * and has been paid — it prints the week, its dates and `Live`/`Final` in its
 * own head, so `Projected` replaces that word there exactly as it does here —
 * and the second was never true of the categories, which are the same twenty
 * figures the card holds. What stays behind is the *acquisitions* and the
 * moves, which are facts about the period so far and are not projected either
 * way.
 *
 * The caller supplies the row it sits in (`.lg-proj-tools` carries the
 * `margin-left: auto` that puts it at the far end of one) and the anchor the
 * key opens from — `position: relative` on the head row rather than on this
 * button, which is `.roll-key`'s measured trick: a 320px panel hanging off a
 * 30px box at the right edge of a phone runs off the screen.
 */
export function ProjectedTools({
  projection,
  categories,
  showing,
  projected,
  loading,
  onProjected,
  drop,
  days,
}: {
  projection: EspnProjection | null;
  categories: number;
  /** Which way the key opens — `up` where the caller has put this control near
   *  the foot of a long page, and the caller's own CSS anchors it to match. */
  drop?: 'up' | 'down';
  /** Whether the figures on screen *are* the projection — which is not the same
   *  as whether the reader has asked for it: a period with none, or one still
   *  being read, shows the live figures under an unlit button. */
  showing: boolean;
  projected: boolean;
  /**
   * **The projection is being read**, and the mark for it goes inside the
   * control that started it — which is the only place a press-triggered mark
   * may go under rule 1: the board behind this button goes on drawing the
   * figures it has until the answer lands, so without this a press left no
   * trace at all for the 386–715ms the read takes warm ("it looks like nothing
   * happens for a second", reported).
   *
   * It swaps the glyph rather than sitting beside it, so the button does not
   * change width under the finger that pressed it — the same rule the Roster
   * view's own `ProjectedToggle` follows, and the reason both draw the ball at
   * the size the mark it replaces was drawn at.
   */
  loading?: boolean;
  onProjected: (on: boolean) => void;
  /** How many days the key's first paragraph is about. The projection's own
   *  figure where there is one — and a caller that has the number without
   *  holding an `EspnProjection` (the Rankings tab reads it off its own
   *  response) passes it here, so the two cannot come to disagree. */
  days?: number;
}) {
  return (
    <div className="lg-proj-tools">
      <button
        type="button"
        className={`research-toggle lg-proj-btn${showing ? ' on' : ''}`}
        aria-pressed={showing}
        aria-busy={loading || undefined}
        onClick={() => onProjected(!projected)}
        title={showing ? 'Back to the figures so far' : 'Project every total to the end of the week'}
      >
        {loading ? <SpinningBaseball size="sm" /> : <ProjectedGlyph />}
        <span className="lg-proj-label">Projected</span>
      </button>
      <ProjectionKey
        days={days ?? projection?.daysLeft ?? 0}
        categories={categories}
        className="lg-proj-key"
        drop={drop}
      />
    </div>
  );
}

function fmtPoints(p: number | null): string {
  return typeof p === 'number' && Number.isFinite(p) ? String(Math.round(p * 100) / 100) : '—';
}

/* ---- The view ----------------------------------------------------------- */


/**
 * **The week the board is on, and the league's other weeks behind a press.**
 *
 * Two things came together here, and they are one control because they are one
 * question.
 *
 * **It reads the way the roster's date face reads.** It printed `Week 19` in
 * 15px bold over `Aug 10 – Aug 19` in 12px muted — the qualifier large and the
 * days small — where the app's own date bar, four lines of chrome away on the
 * Roster and the Feed, prints the qualifier as small caps *above* days at 15px
 * bold. Two faces stating the same kind of fact in opposite orders. They are
 * the same object now: `.date-face` outright, with `.date-face-lead` carrying
 * `Week 19` and `.date-face-range` the days, and the days themselves through
 * `wideRange` rather than a second `prettyDate` pair — which is what buys the
 * weekday on a one-day span (`Mon, Aug 17`), the roster face's own rule and the
 * shape the first day of a live period takes here.
 *
 * **And the arrows are no longer the only way through the season.** ‹ and › step
 * one period, so week 3 from week 19 is sixteen presses and a reader who wants
 * *the week of the trade deadline* has no way to ask for it. The face opens the
 * league's own weeks as a list, each named and dated, and picking one calls the
 * very same `onPeriod` the arrows call — one door, not two mechanisms.
 *
 * **Newest first, deliberately.** The board opens on the week being played, and
 * the weeks a manager looks back at are the ones just behind it; ascending, the
 * live week is nineteen rows down a scrolling list and the common errand is the
 * expensive one. The selected week is scrolled into view on open regardless, so
 * a reader who has arrowed back to week 3 opens the list on week 3.
 *
 * **It dismisses like every other popover in this app** — `useDismissable`, so
 * Escape undoes exactly this and an outside press is spent on the closing
 * rather than also pressing what was behind it — and `usePopoverFit` caps it to
 * the room below, this being a list as long as the season.
 */
function WeekFace({
  board,
  onPeriod,
}: {
  board: EspnScoreboard;
  onPeriod: (period: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, rootRef, close);
  usePopoverFit(open, popRef);

  /* Newest first — see the note above. Reversed here rather than on the wire:
     the server publishes the schedule's own order, which is what `prevPeriod`
     and `nextPeriod` are indexes into, and a list that arrived backwards would
     be two orders for one fact. */
  const weeks = useMemo(() => [...board.periods].reverse(), [board.periods]);

  /* The week the reader is on, brought into view. Written as a `scrollTop`
     rather than `scrollIntoView`, which scrolls *every* scrollable ancestor —
     including the page — and would carry the board out from under a popover
     that has only just opened. */
  useEffect(() => {
    if (!open) return;
    const list = popRef.current;
    const here = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !here) return;
    list.scrollTop = Math.max(0, here.offsetTop - list.clientHeight / 2 + here.offsetHeight / 2);
  }, [open]);

  /* Both lines are always filled, which is the rule that keeps the face one
     height under the press that changes it. The days can genuinely be absent —
     the period anchor is a read that can fail, and it costs the header its
     dates and nothing else — so they fall back to the app's own no-value mark
     rather than to an empty line. */
  const dates = board.start && board.end ? wideRange(board.start, board.end) : '—';

  return (
    <div className="lg-period-face" ref={rootRef}>
      <button
        type="button"
        className={`date-face${open ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={board.periods.length === 0}
        title={open ? 'Close the weeks' : 'Pick a week'}
      >
        <span className="date-face-lead">Week {board.matchupPeriod}</span>
        <span className="date-face-range">{dates}</span>
      </button>
      {open && (
        <div className="lg-week-pop" role="dialog" aria-label="Matchup weeks" ref={popRef}>
          {weeks.map((w: EspnPeriodSpan) => (
            <button
              key={w.period}
              type="button"
              className={`lg-week${w.period === board.matchupPeriod ? ' on' : ''}`}
              aria-current={w.period === board.matchupPeriod ? 'true' : undefined}
              onClick={() => {
                /* Exactly what the arrows do, through the same callback: the
                   page lets go of the matchup it had open and reads the board
                   for the period named. */
                onPeriod(w.period);
                setOpen(false);
              }}
            >
              <span className="lg-week-n">Week {w.period}</span>
              <span className="lg-week-dates">
                {w.start && w.end ? wideRange(w.start, w.end) : '—'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The Scoreboard tab: the period header, its arrows, and the matchup cards.
 *
 * Split out of the view proper when the view gained tabs, so that "which
 * period" and "which matchups" stay one component — they are one question and
 * the arrows are the only control over it.
 */
function Scoreboard({
  board,
  onPeriod,
  onOpenMatchup,
}: {
  board: EspnScoreboard;
  onPeriod: (period: number) => void;
  onOpenMatchup: (id: number) => void;
}) {
  const teamMap = useMemo(() => new Map(board.teams.map((t) => [t.id, t])), [board.teams]);

  /**
   * **The board draws the figures so far, and only those**, which is a
   * reversal: the `Projected` toggle was here, and the lens it swapped in
   * reached these cards.
   *
   * It has moved to the **matchup page**, which is the page a manager opens to
   * study one week — and the move is what makes the lens honest rather than
   * merely tidier. A board is *ten* summaries scanned at a glance; a projection
   * is a thing to study, and hanging it off the summary meant a whole page of
   * dashed cards a reader could not press their way out of once the button
   * itself had gone. So this page says what has happened and the page it opens
   * says where that is heading, which is also the order the two questions come
   * in. `asProjected` stays exported, being what that page swaps its own
   * figures with.
   */

  // The reader's own matchup leads. That is what this page is opened for, and
  // it is a *sort* rather than a mark on its own — the accent border says which
  // one it is, and putting it first means it is on screen without scrolling on
  // a phone, which no amount of marking achieves.
  const matchups = useMemo(() => {
    const list = [...board.matchups];
    const me = board.myTeamId;
    if (me == null) return list;
    return list.sort((a, b) => {
      const am = a.home.teamId === me || a.away?.teamId === me ? 0 : 1;
      const bm = b.home.teamId === me || b.away?.teamId === me ? 0 : 1;
      return am - bm;
    });
  }, [board]);

  /**
   * The days the figures cover — the **observed** span, which truncates at today
   * for a live period and is exactly right for figures that are what has
   * happened. It is why the dates are printed beside the `Live` tag at all: a
   * week's total that stops on Tuesday is a total to date, and the header has to
   * say which days it is of.
   */
  return (
    <>
      <div className="lg-head">
        <div className="lg-period">
          <button
            type="button"
            className="lg-nav"
            disabled={board.prevPeriod == null}
            onClick={() => board.prevPeriod != null && onPeriod(board.prevPeriod)}
            aria-label="Previous matchup period"
            title="Previous matchup period"
          >
            ‹
          </button>
          <WeekFace board={board} onPeriod={onPeriod} />
          <button
            type="button"
            className="lg-nav"
            disabled={board.nextPeriod == null}
            onClick={() => board.nextPeriod != null && onPeriod(board.nextPeriod)}
            aria-label="Next matchup period"
            title="Next matchup period"
          >
            ›
          </button>
        </div>
        {/* Live or Final, and nothing else: these figures are always the days
            played so far, which is what the dates beside them are printed for.
            `Projected` used to be a third value here and is the matchup page's
            now — see the note above the board. */}
        <span className={`lg-state${board.live ? ' lg-state-live' : ''}`}>
          {board.live ? 'Live' : 'Final'}
        </span>
      </div>

      {board.format === 'unknown' ? (
        <div className="empty-state">
          <h3>This league's scoring isn't supported yet</h3>
          <p>
            ESPN reports it as <code>{board.scoringType}</code>, which this page has never been
            read against — so it shows nothing here rather than guessing at a scoreboard shape
            the league may not have. The Rankings tab still draws the league's own totals.
          </p>
        </div>
      ) : board.format === 'standings' ? (
        <div className="empty-state">
          <h3>No matchups in this league</h3>
          <p>
            ESPN scores it as <code>{board.scoringType}</code> — a season-long league rather than
            head to head, so there is nothing to draw a scoreboard from. The Rankings tab is the
            league.
          </p>
        </div>
      ) : matchups.length === 0 ? (
        <div className="empty-state">
          <h3>No matchups in week {board.matchupPeriod}</h3>
          <p>ESPN has no schedule for this period yet.</p>
        </div>
      ) : (
        <div className="lg-board">
          {matchups.map((m) => (
            <MatchupCard
              key={m.id}
              matchup={m}
              categories={board.categories}
              teams={teamMap}
              myTeamId={board.myTeamId}
              format={board.format}
              /* What puts "so far" on a cell's own tooltip. */
              live={board.live}
              onOpen={onOpenMatchup}
            />
          ))}
        </div>
      )}

    </>
  );
}

/** Which of the three pages of this view is on screen. */
export type LeagueTab = 'scoreboard' | 'rankings' | 'transactions';

/** The three pages of the League view.
 *
 * **Exported, because the strip that draws them is not this component's any
 * more.** It rendered here, directly above the page it selected, which is where
 * a tab row belongs when the page is all there is — but the app already has a
 * row for exactly this statement (`.view-bar-tabs`, which holds the view
 * switch, the kind tabs and the roster row's own controls), and a second strip
 * of tabs an inch under the first read as a different kind of control rather
 * than as one tier down of the same one. So `App` draws it there and this file
 * keeps only the vocabulary. */
export const LEAGUE_TABS: { tab: LeagueTab; label: string; title: string }[] = [
  // **Three again, and the Scoreboard leads.** A `Matchup` tab sat first here
  // for a while and did not belong: the other three are three readings of *the
  // league*, where a matchup is one row of the first of them opened up — a set
  // of siblings with one member at a different depth. It is a page over this
  // view now, opened from the card that names it (`LeagueMatchup.tsx`), so
  // `lt=` goes back to omitting `scoreboard` and `lt=matchup` in an older link
  // is read as the board the matchup was always a row of.
  { tab: 'scoreboard', label: 'Scoreboard', title: "This period's matchups" },
  { tab: 'rankings', label: 'Rankings', title: 'Where every team stands in each category' },
  { tab: 'transactions', label: 'Transactions', title: 'Who has added, dropped and traded whom' },
];

export default function LeagueView({
  tab,
  board,
  onOpenMatchup,
  matchupTeams,
  onOpenTeamMatchup,
  loading,
  error,
  onPeriod,
  rankings,
  rankSpan,
  rankingsLoading,
  rankingsError,
  transactions,
  transactionsLoading,
  transactionsError,
  players,
  rosterPct,
  rosterTrend,
  eligibility,
  onOpenPlayer,
  connected,
  onConnect,
}: {
  tab: LeagueTab;
  board: EspnScoreboard | null;
  /** A press on a scoreboard card's `Breakdown →`: open that matchup as a page
   *  over this view. The card is what names the matchup, which is why this view
   *  no longer carries a picker for one. */
  onOpenMatchup: (id: number) => void;
  /** Which teams are in a matchup this period and which one — the Rankings
   *  tab's own door, threaded through rather than derived here: App holds the
   *  board and this view holds none of its own. Null until it lands, which is
   *  what makes a row's press appear with the data behind it rather than
   *  before it. */
  matchupTeams: Map<number, number> | null;
  /** A press on a Rankings row: open that matchup, on *that team's* page. */
  onOpenTeamMatchup: (teamId: number, matchupId: number) => void;
  loading: boolean;
  error: string | null;
  onPeriod: (period: number) => void;
  rankings: EspnRankings | null;
  rankSpan: EspnRankSpan;
  rankingsLoading: boolean;
  rankingsError: string | null;
  transactions: EspnTransactions | null;
  transactionsLoading: boolean;
  transactionsError: string | null;
  /** Threaded through to the Transactions tab alone — the season roster and the
   *  two maps off the ownership read, which are what a player row draws his
   *  club, his positions and his roster % from. */
  players: SeasonPlayer[];
  rosterPct: Map<number, number> | null;
  rosterTrend: TrendDeltas | null;
  eligibility: Map<number, string[]> | null;
  onOpenPlayer: (mlbId: number) => void;
  connected: boolean;
  onConnect: () => void;
}) {
  // Every empty state names its own cause. This one is the view's rather than a
  // tab's: with no league connected there is nothing for any of the three to
  // read, so the strip is not drawn at all — three tabs over one message would
  // be chrome for a feature the reader hasn't got.
  if (!connected) {
    return (
      <div className="empty-state">
        <h3>No fantasy league connected</h3>
        <p>
          The League page reads your ESPN league's matchups, rankings and transactions, so it
          needs one connected.
        </p>
        <div className="empty-actions">
          <button type="button" className="empty-help" onClick={onConnect}>
            Connect a league
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="league-view">
      {tab === 'rankings' ? (
        <LeagueRankings
          rankings={rankings}
          span={rankSpan}
          loading={rankingsLoading}
          error={rankingsError}
          matchupTeams={matchupTeams}
          onOpenTeamMatchup={onOpenTeamMatchup}
        />
      ) : tab === 'transactions' ? (
        <LeagueTransactions
          data={transactions}
          loading={transactionsLoading}
          error={transactionsError}
          players={players}
          rosterPct={rosterPct}
          rosterTrend={rosterTrend}
          eligibility={eligibility}
          onOpenPlayer={onOpenPlayer}
        />
      ) : error && !board ? (
        <div className="empty-state">
          <h3>Couldn't read your league</h3>
          <p>{error}</p>
        </div>
      ) : !board ? (
        // Never over data: a re-read leaves what is on screen standing, and the
        // block wait is only for a pane with nothing in it yet.
        loading ? (
          <LoadingBlock>Reading your league's scoreboard</LoadingBlock>
        ) : null
      ) : (
        <Scoreboard board={board} onPeriod={onPeriod} onOpenMatchup={onOpenMatchup} />
      )}
    </div>
  );
}
