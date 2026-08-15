import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { BatterGameLog, PitcherGameLog, PlayerKind } from '../types';
import { ExpandButton } from './ExpandButton';
import { useFullPage } from '../hooks';
import { creditLabel, decisionColor, formatIp, formatRate, ordinal, prettyGameDate } from '../lib';
import { PlayerDayModal } from './PlayerDay';

/**
 * A row of the log is a press, and this is what makes it one.
 *
 * The log is the season as the games it is made of, and a row was the end of
 * the road: fourteen columns of what he did that night with no way to see any
 * of it. A press opens the feed's reading of that game — his plate appearances
 * with their clips, his outing with its innings — which is the same reading the
 * page's Overview tab gives for today, one date over.
 *
 * `role`/`tabIndex`/Enter/Space rather than wrapping the cells in a button: a
 * `<tr>` cannot hold one without leaving table layout, and the whole row is the
 * target. Space is `preventDefault`ed, or the press would also scroll the pane
 * under it.
 */
function pressProps(onOpen: () => void, label: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onOpen();
    },
  };
}

/**
 * How many games render before the Load more button. A batter's season is 150
 * rows and this table sits inside an overlay that already scrolls, so it pages
 * the way the feed does rather than dropping the whole season on the page.
 */
const PAGE_SIZE = 25;

/**
 * Which team he played, from his side of it — "@ MIL" on the road — and how it
 * came out: "W 5-3", his team's runs first, so the score reads the same way the
 * result letter does and needs nothing said about who was home. The two are one
 * chip rather than a column of their own; this table is already wider than a
 * phone. A game with no result yet (in progress, suspended) still shows the
 * score it's reached, uncolored — there's no W or L to claim.
 */
function Opponent({ g }: { g: BatterGameLog | PitcherGameLog }) {
  const score =
    g.teamScore !== null && g.opponentScore !== null ? `${g.teamScore}-${g.opponentScore}` : null;
  const decided = g.win !== null;
  return (
    <td className="glog-opp">
      <span className="glog-at">{g.home ? 'vs' : '@'}</span> {g.opponent}
      {(decided || score) && (
        <span
          className={`glog-res glog-res-${decided ? (g.win ? 'w' : 'l') : 'none'}`}
          title={
            decided
              ? `His team ${g.win ? 'won' : 'lost'}${score ? ` ${score}` : ''}`
              : `${score} — no result yet`
          }
        >
          {decided && (g.win ? 'W' : 'L')}
          {decided && score ? ` ${score}` : score}
        </span>
      )}
    </td>
  );
}

/** A count that reads as nothing when it is nothing — the eye should catch the
 *  games with something in them, not count zeroes down the column. */
function Count({ n }: { n: number }) {
  return <td className="glog-num">{n === 0 ? <span className="glog-zero">0</span> : n}</td>;
}

/* Batting is where he hit in the order and Pos is where he started — game
   context like the opponent beside it, so the two lead together rather than
   sitting among the counting stats. They are one fact read twice (both come off
   the same posted-lineup entry, so neither can claim he started when the other
   says he didn't), which is also why they are adjacent. The last four
   are prefixed Szn because they're his line *through* that game rather than the
   game's own — see the field comments on BatterGameLog. They read in slash-line
   order, AVG · OBP · SLG · OPS, so the eye takes them the way a slash line is
   taken. H/AB is where AB and H used to be two columns; see `HitsPerAb` for why
   one cell. */
const BATTER_COLUMNS = [
  'Batting', 'Pos', 'H/AB', 'R', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'SB',
  'Szn AVG', 'Szn OBP', 'Szn SLG', 'Szn OPS',
];

/**
 * What he did with his official turns at bat, as one cell — the shape the
 * summary table's `H/AB` already uses, and for the same reason: hits and their
 * denominator are one reading, and split into two columns the eye has to carry
 * a number three cells to the right to make it.
 *
 * **The denominator is at-bats**, which is what the two numbers beside it are
 * measured against: the `Szn AVG` in the same row is hits over at-bats, and so
 * is the season row's own AVG at the foot of the column, so anything else here
 * would be a cell whose denominator no other number on the line shares. It went
 * over plate appearances for a while, on the argument that AB throws away the
 * walk and the sacrifice; what that traded away was the agreement between this
 * cell and the average it feeds, which is the more useful of the two — and the
 * walk it was defending is not lost at all, being the BB column four cells
 * along. `2/4` with a `1` under BB is a five-trip night stated in the two places
 * that own the two facts.
 *
 * PA leaves the columns and not the row — it rides this cell's tooltip, which is
 * where the reader who wants "and how many times did he come up" can have it.
 *
 * **What dims is `pa === 0`, not `hits === 0`.** A man who appeared without ever
 * coming to the plate — a pinch-runner, a defensive replacement — has nothing to
 * read here and dims whole, the way every other zero in this table does. Over
 * at-bats a walk-only night is *also* `0/0`, and it deliberately stays plain:
 * he did come up and he did something, and the cell can no longer tell the two
 * apart where the row still can. Measured over 120 batters and 9,023 game-log
 * rows: 309 rows are a genuine 0 PA and 97 are `0/0` off a walk or a sacrifice,
 * so dimming on at-bats would have quietly filed those 97 as "not in the game".
 */
function HitsPerAb({ g }: { g: BatterGameLog }) {
  const cell = `${g.hits}/${g.ab}`;
  const trips = `${g.pa} PA`;
  const title =
    g.pa === 0
      ? 'In the game, but never came to the plate'
      : g.ab === 0
        ? `${trips}, no official at-bat — a walk, a sacrifice or a hit by pitch`
        : `${g.hits} ${g.hits === 1 ? 'hit' : 'hits'} in ${g.ab} at-${
            g.ab === 1 ? 'bat' : 'bats'
          } · ${trips}`;
  return (
    <td className="glog-num glog-hab" title={title}>
      {g.pa === 0 ? <span className="glog-zero">{cell}</span> : cell}
    </td>
  );
}

function BatterRows({
  games,
  onOpen,
}: {
  games: BatterGameLog[];
  onOpen: (g: BatterGameLog) => void;
}) {
  return (
    <>
      {games.map((g) => (
        <tr
          key={`${g.gamePk}-${g.date}`}
          title={g.summary}
          {...pressProps(() => onOpen(g), `${prettyGameDate(g.date)} — open the game`)}
        >
          <th className="glog-date" scope="row">
            {prettyGameDate(g.date)}
          </th>
          <Opponent g={g} />
          {/* Where he hit that night. Dashed rather than blank when he isn't in
              the posted order — he came on off the bench, which is a fact about
              the game and not a hole in the row. */}
          <td className="glog-num glog-spot" title={g.lineupSpot !== null ? `Batted ${ordinal(g.lineupSpot)}` : 'Not in the posted lineup'}>
            {g.lineupSpot !== null ? ordinal(g.lineupSpot) : <span className="glog-zero">—</span>}
          </td>
          {/* Where he started. Dashed on exactly the rows the cell beside it is
              dashed on — both come off the same posted-lineup entry, so a man
              who came on off the bench has neither rather than one of them. */}
          <td
            className="glog-num glog-spot"
            title={g.startPosition ? `Started at ${g.startPosition}` : 'Not in the posted lineup'}
          >
            {g.startPosition ?? <span className="glog-zero">—</span>}
          </td>
          <HitsPerAb g={g} />
          <Count n={g.runs} />
          <Count n={g.doubles} />
          <Count n={g.triples} />
          <Count n={g.hr} />
          <Count n={g.rbi} />
          <Count n={g.bb} />
          <Count n={g.so} />
          <Count n={g.sb} />
          <td className="glog-num glog-rate">{g.seasonAvg}</td>
          <td className="glog-num glog-rate">{g.seasonObp}</td>
          <td className="glog-num glog-rate">{g.seasonSlg}</td>
          <td className="glog-num glog-rate">{g.seasonOps}</td>
        </tr>
      ))}
    </>
  );
}

/**
 * The season row: the totals over **every** game in the log, not just the page
 * on screen — it's the line those games add up to, and it stays put as more of
 * them load. The rates are recomputed from the totals rather than averaged out
 * of the per-game ones, which is why the row carries HBP, SF and total bases.
 */
function BatterTotals({ games }: { games: BatterGameLog[] }) {
  const sum = (f: (g: BatterGameLog) => number) => games.reduce((s, g) => s + f(g), 0);
  // One denominator for the whole row: the cell above, the AVG, the SLG and
  // the OPS at the end of it are all over at-bats, which is what a batting
  // average and a slugging percentage are.
  const ab = sum((g) => g.ab);
  const hits = sum((g) => g.hits);
  const pa = sum((g) => g.pa);
  const bb = sum((g) => g.bb);
  const hbp = sum((g) => g.hbp);
  const obpDen = ab + bb + hbp + sum((g) => g.sacFlies);
  const avg = ab > 0 ? formatRate(hits / ab) : '—';
  const obp = obpDen > 0 ? (hits + bb + hbp) / obpDen : null;
  const slg = ab > 0 ? sum((g) => g.totalBases) / ab : null;
  return (
    <tr>
      {/* The label eats the lineup and position columns too: a season has no
          one spot and no one position, and the most common of either is a
          different stat from anything else here. */}
      <th className="glog-date glog-total-label" scope="row" colSpan={4}>
        Season · {games.length} G
      </th>
      {/* Season hits over season at-bats — the sum of the column above it, not
          a rate averaged out of 150 of them, and the very pair the AVG at the
          end of this row divides. */}
      <td className="glog-num glog-hab" title={`${hits} hits in ${ab} at-bats · ${pa} PA`}>
        {hits}/{ab}
      </td>
      <td className="glog-num">{sum((g) => g.runs)}</td>
      <td className="glog-num">{sum((g) => g.doubles)}</td>
      <td className="glog-num">{sum((g) => g.triples)}</td>
      <td className="glog-num">{sum((g) => g.hr)}</td>
      <td className="glog-num">{sum((g) => g.rbi)}</td>
      <td className="glog-num">{bb}</td>
      <td className="glog-num">{sum((g) => g.so)}</td>
      <td className="glog-num">{sum((g) => g.sb)}</td>
      <td className="glog-num glog-rate">{avg}</td>
      {/* Recomputed from the totals like the two beside it, rather than taken
          off the newest row's running line — the four cells are then one
          arithmetic over one set of sums, and the OPS at the end of the row is
          this OBP plus this SLG. Both agree with the newest row's Szn OBP and
          Szn SLG by construction: a season-to-date line through the last game
          is the season. */}
      <td className="glog-num glog-rate">{obp !== null ? formatRate(obp) : '—'}</td>
      <td className="glog-num glog-rate">{slg !== null ? formatRate(slg) : '—'}</td>
      <td className="glog-num glog-rate">
        {obp !== null && slg !== null ? formatRate(obp + slg) : '—'}
      </td>
    </tr>
  );
}

/**
 * Which innings he was in the game for: "8" for one, "6-8" for a longer outing.
 * Plain numbers rather than ordinals — the column header says innings, and a
 * range of two ordinals is twice the width of the cell.
 */
function inningsSpan(g: PitcherGameLog): { label: string; title: string } | null {
  const { firstInning: first, lastInning: last } = g;
  if (first === null) return null;
  if (last === null || last === first) {
    return { label: String(first), title: `Pitched the ${ordinal(first)}` };
  }
  return {
    label: `${first}-${last}`,
    title: `Pitched the ${ordinal(first)} through the ${ordinal(last)}`,
  };
}

/**
 * His team's margin when he threw his first pitch — what he walked into, which
 * is most of what a relief appearance means. Colored the way the W/L chip is:
 * this is game state, not a stat of his.
 */
function EntryMargin({ m }: { m: number | null }) {
  if (m === null) {
    return (
      <td className="glog-num">
        <span className="glog-zero">—</span>
      </td>
    );
  }
  const tone = m > 0 ? 'up' : m < 0 ? 'down' : 'even';
  const title =
    m > 0 ? `Entered up ${m}` : m < 0 ? `Entered down ${-m}` : 'Entered with the game tied';
  return (
    <td className={`glog-num glog-ent glog-ent-${tone}`} title={title}>
      {m > 0 ? `+${m}` : m}
    </td>
  );
}

/* Inn and Ent are the outing's setup — which innings he was in for, and the
   margin he inherited — and sit after the line rather than before it so the
   stats keep the left of the row, where a phone can see them without scrolling. */
const PITCHER_COLUMNS = [
  'Dec', 'IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'P',
  'Szn ERA', 'Szn FIP', 'Szn WHIP', 'Inn', 'Ent',
];

function PitcherRows({
  games,
  roles,
  onOpen,
}: {
  games: PitcherGameLog[];
  roles: boolean;
  onOpen: (g: PitcherGameLog) => void;
}) {
  return (
    <>
      {games.map((g) => (
        <tr
          key={`${g.gamePk}-${g.date}`}
          title={g.summary}
          {...pressProps(() => onOpen(g), `${prettyGameDate(g.date)} — open the outing`)}
        >
          <th className="glog-date" scope="row">
            {prettyGameDate(g.date)}
            {/* Whether he started is the shape of the outing — five innings out
                of the bullpen is a different night from five as the starter. Only
                on a log that holds both, though: twenty rows of SP down a
                starter's column say nothing the IP column doesn't. */}
            {roles && <span className="glog-role">{g.started ? 'SP' : 'RP'}</span>}
          </th>
          <Opponent g={g} />
          <td className="glog-num glog-dec">
            {g.decision ? (
              <span className="glog-credit" style={{ color: decisionColor(g.decision) }}>
                {creditLabel(g.decision)}
              </span>
            ) : (
              <span className="glog-zero">—</span>
            )}
          </td>
          <td className="glog-num">{g.inningsPitched}</td>
          <Count n={g.hits} />
          <Count n={g.runs} />
          <Count n={g.earnedRuns} />
          <Count n={g.walks} />
          <Count n={g.strikeOuts} />
          <Count n={g.hr} />
          <td className="glog-num">{g.pitches || <span className="glog-zero">—</span>}</td>
          {/* The estimator sits immediately after the number it estimates, the
              rule the pitcher card's season line and the research board both
              follow; WHIP comes after the pair rather than between them, being
              a different question — what he allowed on the bases rather than a
              second reading of the runs. Dashed under three innings, where
              `fipLike` declines to answer. */}
          <td className="glog-num glog-rate">{g.seasonEra}</td>
          <td className="glog-num glog-rate">{g.seasonFip ?? <span className="glog-zero">—</span>}</td>
          <td className="glog-num glog-rate">{g.seasonWhip}</td>
          <td className="glog-num" title={inningsSpan(g)?.title}>
            {inningsSpan(g)?.label ?? <span className="glog-zero">—</span>}
          </td>
          <EntryMargin m={g.entryMargin} />
        </tr>
      ))}
    </>
  );
}

/** Same season row, over outs rather than innings — thirds don't add up as
 *  decimals, so "5.1 + 5.2" has to go through the out count to reach 11.0. */
function PitcherTotals({ games }: { games: PitcherGameLog[] }) {
  const sum = (f: (g: PitcherGameLog) => number) => games.reduce((s, g) => s + f(g), 0);
  const outs = sum((g) => g.outs);
  const er = sum((g) => g.earnedRuns);
  const credits = (c: PitcherGameLog['decision']) => games.filter((g) => g.decision === c).length;
  const w = credits('W');
  const l = credits('L');
  // The column is one narrow cell, so it shows the record and carries the rest
  // — a closer's saves and holds are most of his season — in the title.
  const record = [
    `${w} W`,
    `${l} L`,
    ...(credits('S') ? [`${credits('S')} SV`] : []),
    ...(credits('H') ? [`${credits('H')} HLD`] : []),
  ].join(' · ');
  return (
    <tr>
      <th className="glog-date glog-total-label" scope="row" colSpan={2}>
        Season · {games.length} G
      </th>
      <td className="glog-num glog-dec" title={record}>
        {w}-{l}
      </td>
      <td className="glog-num">{formatIp(outs)}</td>
      <td className="glog-num">{sum((g) => g.hits)}</td>
      <td className="glog-num">{sum((g) => g.runs)}</td>
      <td className="glog-num">{er}</td>
      <td className="glog-num">{sum((g) => g.walks)}</td>
      <td className="glog-num">{sum((g) => g.strikeOuts)}</td>
      <td className="glog-num">{sum((g) => g.hr)}</td>
      <td className="glog-num">{sum((g) => g.pitches)}</td>
      <td className="glog-num glog-rate">
        {outs > 0 ? ((er * 27) / outs).toFixed(2) : '—'}
      </td>
      {/* Neither of these is summed, because neither is summable: a
          season-to-date rate through the newest game **is** the season, so the
          foot takes the top row's rather than recomputing it. That also keeps
          FIP's one definition on the server — the constant behind it lives in
          `leagueRates.ts` and has no business being restated in a table. */}
      <td className="glog-num glog-rate">
        {games[0]?.seasonFip ?? <span className="glog-zero">—</span>}
      </td>
      <td className="glog-num glog-rate">{games[0]?.seasonWhip ?? '—'}</td>
      {/* A season has no entry inning and no margin to walk into. */}
      <td className="glog-num">
        <span className="glog-zero">—</span>
      </td>
      <td className="glog-num">
        <span className="glog-zero">—</span>
      </td>
    </tr>
  );
}

/** The log as the two routes hand it back — the pair every piece here reads. */
type Log =
  | { kind: 'batter'; games: BatterGameLog[] }
  | { kind: 'pitcher'; games: PitcherGameLog[] };

/**
 * The table itself, with nobody's chrome around it.
 *
 * It is factored out because the player page draws this table **twice**: whole
 * on the Game Log tab, and five rows of it on the Overview as "how he has been
 * going". Two tables that merely resembled each other would be two tables free
 * to drift the next time a column moved — the same argument `PlayerIdentity` and
 * `PhotoStatus` are shared on — so the column lists, the cells, the zebra stripe
 * and the two sticky axes have one definition, and the preview is this component
 * with `shown` set small and `totals` off.
 *
 * `totals` is the one thing the preview genuinely doesn't want: the season row
 * sums **every** game in the log rather than the rows on screen, which is right
 * under a table that pages toward it and a non-sequitur under one that shows
 * five and says so in its heading.
 */
function GameLogTable({
  log,
  shown,
  totals,
  corner,
  onOpen,
}: {
  log: Log;
  /** How many rows to draw, newest first. */
  shown: number;
  /** Close with the season row — the whole log's totals, not the page's. */
  totals: boolean;
  /** What sits in the Date header ahead of the word, in the corner cell that is
   *  pinned on both axes: the expand button on the tab, nothing on the preview. */
  corner?: ReactNode;
  onOpen: (g: BatterGameLog | PitcherGameLog) => void;
}) {
  const pitching = log.kind === 'pitcher';
  return (
    <div className="glog-scroll">
      <table className="glog-table">
        <thead>
          <tr>
            <th className="glog-date" scope="col">
              {corner}
              Date
            </th>
            <th className="glog-opp" scope="col">
              Opp
            </th>
            {(pitching ? PITCHER_COLUMNS : BATTER_COLUMNS).map((c) => (
              <th key={c} className="glog-num" scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {log.kind === 'pitcher' ? (
            <PitcherRows
              games={log.games.slice(0, shown)}
              roles={log.games.some((g) => g.started) && log.games.some((g) => !g.started)}
              onOpen={onOpen}
            />
          ) : (
            <BatterRows games={log.games.slice(0, shown)} onOpen={onOpen} />
          )}
        </tbody>
        {totals && (
          <tfoot>
            {log.kind === 'pitcher' ? (
              <PitcherTotals games={log.games} />
            ) : (
              <BatterTotals games={log.games} />
            )}
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * Which row's game is open, and the dialog it opens. Both drawings of the table
 * want the same thing — a press opens that afternoon as a feed — so the state
 * and the modal travel together rather than being written out twice.
 *
 * Keyed on the **game** rather than the date, because a doubleheader puts two
 * rows on one afternoon and they are two different readings.
 */
function useGameOpen(playerId: number, kind: PlayerKind, name: string) {
  const [open, setOpen] = useState<{ date: string; gamePk: number } | null>(null);
  const openGame = (g: BatterGameLog | PitcherGameLog) =>
    setOpen({ date: g.date, gamePk: g.gamePk });
  const modal = open ? (
    <PlayerDayModal
      playerId={playerId}
      kind={kind}
      name={name}
      date={open.date}
      gamePk={open.gamePk}
      onClose={() => setOpen(null)}
    />
  ) : null;
  return { openGame, modal };
}

/**
 * The last few games, for the player page's **Overview** tab.
 *
 * That tab is a summary page — how good he is, what he is doing today, how he
 * has been going — and this is the third of those. Five rows is the shape of
 * "lately": enough that a slump or a hot week shows, few enough that it stays a
 * glance rather than the tab beside it. Whatever it can't say, the link over it
 * goes to.
 *
 * It draws the *same table* the Game Log tab does, down to the sticky date
 * column and the press that opens a game — see `GameLogTable`.
 */
export function GameLogPreview({
  log,
  playerId,
  name,
  limit = 5,
  onSeeAll,
}: {
  log: Log;
  playerId: number;
  name: string;
  limit?: number;
  /** Switch the page to the Game Log tab. The preview is a doorway as much as a
   *  reading, so it says where the rest of the season is. */
  onSeeAll: () => void;
}) {
  const { openGame, modal } = useGameOpen(playerId, log.kind, name);
  if (log.games.length === 0) {
    return (
      <section className="ovw-block">
        <h2 className="ovw-head">Recent games</h2>
        <p className="ovw-none">No games played this season.</p>
      </section>
    );
  }
  const shown = Math.min(limit, log.games.length);
  return (
    <section className="ovw-block">
      <div className="ovw-head-row">
        <h2 className="ovw-head">
          Last {shown} {shown === 1 ? 'game' : 'games'}
        </h2>
        <button type="button" className="ovw-link" onClick={onSeeAll}>
          Game Log →
        </button>
      </div>
      <GameLogTable log={log} shown={shown} totals={false} onOpen={openGame} />
      {modal}
    </section>
  );
}

/**
 * The Game Log tab: every game of the player's season, newest first. The Season
 * tab is the season as one line; this is the season as the games it's made of,
 * which is the only place in the app that shows how he got there.
 */
export function GameLog(
  log: Log & {
    /** Who the log is about — needed now that a row opens that player's day for
     *  the date it names, which is a fetch of its own rather than something the
     *  log already holds. */
    playerId: number;
    name: string;
    /** Who the log is about, for when the table has the page and the details
     *  head that normally says so is behind it. Rendered only while expanded,
     *  and smaller than that head: a name and a face, not a page header. */
    chrome?: ReactNode;
  },
) {
  const [shown, setShown] = useState(PAGE_SIZE);
  // Both above the early return: hooks are unconditional, and a player with no
  // games takes that branch.
  const { openGame, modal } = useGameOpen(log.playerId, log.kind, log.name);
  const { isFull, toggle, ref: fullRef } = useFullPage<HTMLDivElement>();
  if (log.games.length === 0) {
    return <div className="details-status">No games played this season.</div>;
  }
  const more = log.games.length - shown;
  return (
    <div ref={fullRef} className={`details-gamelog${isFull ? ' is-expanded' : ''}`}>
      {isFull && log.chrome && <div className="expanded-chrome">{log.chrome}</div>}
      <GameLogTable
        log={log}
        shown={shown}
        totals
        corner={<ExpandButton isFull={isFull} onToggle={toggle} what="log" />}
        onOpen={openGame}
      />
      {more > 0 && (
        <button type="button" className="glog-more" onClick={() => setShown(shown + PAGE_SIZE)}>
          Load more · {more} earlier {more === 1 ? 'game' : 'games'}
        </button>
      )}
      {modal}
    </div>
  );
}
