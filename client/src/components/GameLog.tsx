import { useState } from 'react';
import type { BatterGameLog, PitcherGameLog } from '../types';
import { ExpandButton } from './ExpandButton';
import { useFullPage } from '../hooks';
import { creditLabel, decisionColor, formatIp, formatRate, ordinal, prettyGameDate } from '../lib';

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

/* Batting is where he hit in the order — game context like the opponent beside
   it, so it leads rather than sitting among the counting stats. The last two are
   prefixed Szn because they're his line *through* that game rather than the
   game's own — see the field comments on BatterGameLog. */
const BATTER_COLUMNS = [
  'Batting', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'SB', 'Szn AVG', 'Szn OPS',
];

function BatterRows({ games }: { games: BatterGameLog[] }) {
  return (
    <>
      {games.map((g) => (
        <tr key={`${g.gamePk}-${g.date}`} title={g.summary}>
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
          <td className="glog-num">{g.ab}</td>
          <Count n={g.runs} />
          <Count n={g.hits} />
          <Count n={g.doubles} />
          <Count n={g.triples} />
          <Count n={g.hr} />
          <Count n={g.rbi} />
          <Count n={g.bb} />
          <Count n={g.so} />
          <Count n={g.sb} />
          <td className="glog-num glog-rate">{g.seasonAvg}</td>
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
  const ab = sum((g) => g.ab);
  const hits = sum((g) => g.hits);
  const bb = sum((g) => g.bb);
  const hbp = sum((g) => g.hbp);
  const obpDen = ab + bb + hbp + sum((g) => g.sacFlies);
  const avg = ab > 0 ? formatRate(hits / ab) : '—';
  const obp = obpDen > 0 ? (hits + bb + hbp) / obpDen : null;
  const slg = ab > 0 ? sum((g) => g.totalBases) / ab : null;
  return (
    <tr>
      {/* The label eats the lineup column too: a season has no one spot, and
          the most common one is a different stat from anything else here. */}
      <th className="glog-date glog-total-label" scope="row" colSpan={3}>
        Season · {games.length} G
      </th>
      <td className="glog-num">{ab}</td>
      <td className="glog-num">{sum((g) => g.runs)}</td>
      <td className="glog-num">{hits}</td>
      <td className="glog-num">{sum((g) => g.doubles)}</td>
      <td className="glog-num">{sum((g) => g.triples)}</td>
      <td className="glog-num">{sum((g) => g.hr)}</td>
      <td className="glog-num">{sum((g) => g.rbi)}</td>
      <td className="glog-num">{bb}</td>
      <td className="glog-num">{sum((g) => g.so)}</td>
      <td className="glog-num">{sum((g) => g.sb)}</td>
      <td className="glog-num glog-rate">{avg}</td>
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
  'Dec', 'IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'P', 'Szn ERA', 'Inn', 'Ent',
];

function PitcherRows({ games, roles }: { games: PitcherGameLog[]; roles: boolean }) {
  return (
    <>
      {games.map((g) => (
        <tr key={`${g.gamePk}-${g.date}`} title={g.summary}>
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
          <td className="glog-num glog-rate">{g.seasonEra}</td>
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

/**
 * The Game Log tab: every game of the player's season, newest first. The Season
 * tab is the season as one line; this is the season as the games it's made of,
 * which is the only place in the app that shows how he got there.
 */
export function GameLog(
  log: { kind: 'batter'; games: BatterGameLog[] } | { kind: 'pitcher'; games: PitcherGameLog[] },
) {
  const [shown, setShown] = useState(PAGE_SIZE);
  // Above the early return: hooks are unconditional, and a player with no games
  // takes that branch.
  const { isFull, toggle } = useFullPage();
  if (log.games.length === 0) {
    return <div className="details-status">No games played this season.</div>;
  }
  const pitching = log.kind === 'pitcher';
  const more = log.games.length - shown;
  return (
    <div className={`details-gamelog${isFull ? ' is-expanded' : ''}`}>
      <div className="glog-scroll">
        <table className="glog-table">
          <thead>
            <tr>
              <th className="glog-date" scope="col">
                <ExpandButton isFull={isFull} onToggle={toggle} what="log" />
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
              />
            ) : (
              <BatterRows games={log.games.slice(0, shown)} />
            )}
          </tbody>
          <tfoot>
            {log.kind === 'pitcher' ? (
              <PitcherTotals games={log.games} />
            ) : (
              <BatterTotals games={log.games} />
            )}
          </tfoot>
        </table>
      </div>
      {more > 0 && (
        <button type="button" className="glog-more" onClick={() => setShown(shown + PAGE_SIZE)}>
          Load more · {more} earlier {more === 1 ? 'game' : 'games'}
        </button>
      )}
    </div>
  );
}
