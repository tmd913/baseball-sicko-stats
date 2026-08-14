import { useState } from 'react';
import type { ReactNode } from 'react';
import { FantasySlotTag } from './FantasySlot';
import { ExpandButton } from './ExpandButton';
import { PhotoSpot, PhotoStatus, useStatusBadge } from './PhotoStatus';
import { PlayerIdentity } from './PlayerIdentity';
import { useEligible, useFullPage } from '../hooks';
import type { BattingLine, PitchingLine, PlayerGame, PlayerReport } from '../types';
import { playerKey } from '../types';
import type { Corner, LiveRole } from '../lib';
import {
  combineLines,
  combinePitchingLines,
  eraOf,
  formatIp,
  formatRate,
  gameStatusView,
  handThrows,
  headshotUrl,
  isRotationStarter,
  lineupCorner,
  liveRole,
  liveRoleLabel,
  lineOps,
  mostRecentGameFirst,
  pitchingCorner,
  positionCell,
  surname,
  whipOf,
} from '../lib';

/**
 * The game to summarize for a player in the opponent column: prefer the live
 * game, then the next scheduled one, then their most recent — the same priority
 * the player cards use, so the column tracks whatever game is most current. (Stats still
 * aggregate every game in the range; this cell reflects one representative game.)
 */
function pickGame(report: PlayerReport): PlayerGame | null {
  const games = report.games;
  if (games.length === 0) return null;
  return (
    games.find((g) => g.status.state === 'live') ??
    games.find((g) => g.status.state === 'scheduled') ??
    [...games].sort(mostRecentGameFirst)[0]
  );
}

/**
 * The opponent / game cell: the matchup before first pitch, the live score +
 * inning while it's on, the final score once it's over.
 *
 * Before first pitch the second line is the starter the other side announced
 * (`game.probablePitcher` — on a pitcher's row that's his counterpart, not
 * someone he faces) and the start time moves up beside the matchup, so the cell
 * is two lines in every state rather than three in one of them. Once the game is
 * under way the starter drops off: by then the line that matters is the score
 * and the inning, and the batter is as likely to be facing a reliever.
 */
function OpponentCell({ game }: { game: PlayerGame | null }) {
  if (!game) return <td className="sum-opp sum-opp-empty">—</td>;
  const { kind, score, detail } = gameStatusView(game);
  const matchup = `${game.isHome ? 'vs' : '@'} ${game.opponent}`;
  const scheduled = kind === 'scheduled';
  const sp = scheduled ? game.probablePitcher : null;
  return (
    <td className={`sum-opp sum-opp-${kind}`}>
      <span className="sum-opp-main">
        {scheduled ? matchup : (score ?? matchup)}
        {scheduled && <span className="sum-opp-time">{detail}</span>}
      </span>
      {!scheduled && <span className="sum-opp-detail">{detail}</span>}
      {sp && (
        <span className="sum-opp-sp" title={`Starting pitcher: ${sp.name}`}>
          vs {handThrows(sp.hand)} {surname(sp.name)}
        </span>
      )}
    </td>
  );
}

/** The player's aggregate batting line for the range, shown as one table row. */
function StatCells({ line }: { line: BattingLine }) {
  const ops = lineOps(line);
  return (
    <>
      <td className="sum-num sum-hab">
        {line.hits}/{line.ab}
      </td>
      <td className="sum-num">{line.runs}</td>
      <td className="sum-num">{line.hr}</td>
      <td className="sum-num">{line.rbi}</td>
      <td className="sum-num">{line.sb}</td>
      <td className="sum-num">{ops !== null ? formatRate(ops) : '—'}</td>
      <td className="sum-num">{line.bb}</td>
      <td className="sum-num">{line.so}</td>
    </>
  );
}

/** A pitcher's aggregate line + rates for the range, shown as one table row. */
/**
 * A win / save / hold count, dashed at zero — these columns are empty for almost
 * every row, and a column of noughts reads as data when it isn't.
 */
function CreditCell({ n }: { n: number }) {
  return <td className="sum-num">{n > 0 ? n : '—'}</td>;
}

function PitchStatCells({ line }: { line: PitchingLine }) {
  return (
    <>
      <td className="sum-num sum-hab">{line.outs > 0 ? formatIp(line.outs) : '—'}</td>
      <td className="sum-num">{line.hits}</td>
      <td className="sum-num">{line.runs}</td>
      <td className="sum-num">{line.earnedRuns}</td>
      <td className="sum-num">{line.walks}</td>
      <td className="sum-num">{line.strikeouts}</td>
      <td className="sum-num">{line.hr}</td>
      <CreditCell n={line.wins} />
      <CreditCell n={line.saves} />
      <CreditCell n={line.holds} />
      <td className="sum-num">{eraOf(line)}</td>
      <td className="sum-num">{whipOf(line)}</td>
    </>
  );
}

/** A pitcher's combined line across every game he pitched in the range. */
function aggregatePitching(report: PlayerReport): PitchingLine {
  return combinePitchingLines(report.games.filter((g) => g.pitching).map((g) => g.pitching!.line));
}

/**
 * Headshot for a summary row; falls back to a blank circle when MLB has none.
 * `role` paints the live-role ring (at bat / on deck / on base) and `corner`
 * pins the lineup-spot pip — the same colours and treatment the cards and feed use.
 */
/**
 * The player's status as a short code on the bottom edge of his headshot —
 * `IL10`, `RA`, `DTD`, `OUT`, `DFA`.
 *
 * On the headshot rather than beside the name because that is where the row
 * already carries what is *true of the player* as opposed to what he did: the
 * lineup-spot pip is on the opposite corner of the same circle. It also costs
 * the name column nothing, which matters on a table that overflows a phone —
 * a "Rehab Assignment" chip beside a name was pushing stat columns off the
 * right edge to say something four characters could.
 *
 * The badge itself is `useStatusBadge`'s, shared with the research board and
 * the details view; the only thing this adds is the report it reads the roster
 * status off, which those two haven't got.
 */
function SumStatus({ r }: { r: PlayerReport }) {
  return <PhotoStatus badge={useStatusBadge(playerKey(r), r.rosterStatus)} className="sum-photo-status" />;
}

function SumPhoto({
  id,
  playerKey: key,
  name,
  role,
  corner,
  status,
  onOpen,
}: {
  id: number;
  playerKey: string;
  name: string;
  role: LiveRole | null;
  corner: Corner;
  status: ReactNode;
  onOpen: (key: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const cls = `sum-photo${role ? ` role-${role}` : ''}`;
  return (
    <button
      type="button"
      className="sum-photo-wrap"
      title={`${name} — details`}
      aria-label={`${name} — details`}
      onClick={() => onOpen(key)}
    >
      {failed ? (
        <span className={`${cls} sum-photo-empty`} aria-hidden="true" />
      ) : (
        <img
          className={cls}
          src={headshotUrl(id)}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <PhotoSpot corner={corner} className="sum-photo-spot" />
      {status}
    </button>
  );
}

/**
 * The identity block on a summary row: the name line the caller draws, over his
 * club's cap mark and the positions his league will let him fill.
 *
 * The **block** is the research board's, shared rather than copied — see
 * `PlayerIdentity`. What this adds is where the two facts come from for a
 * *report* rather than a leaderboard row, and both come off the report itself:
 * `teamId`/`team` are his current club (`getRosterInfo`, so a traded man wears
 * the cap he is wearing now rather than the one on a game in the range), and
 * the position is `lib.ts::positionCell` over the same three-deep rule the
 * board follows.
 *
 * The one thing that is not on the report is ESPN's eligibility, which is a
 * per-user fact about a connected league and reaches this leaf through
 * `EligibilityContext` — see `hooks.ts` for why it is a context and why it is
 * not `FantasyRosterContext`, which is null in saved-roster mode where this
 * must still answer.
 *
 * The **pitcher fallback is his season**, not a window: `isRotationStarter` is
 * the same "a majority of his appearances are starts" test the feed's Upcoming
 * section gates on, and the tooltip says so, where the board's says "over the
 * window" because that is what its own `starter` measures.
 */
function RowIdentity({ r, children }: { r: PlayerReport; children: ReactNode }) {
  const pos = positionCell({
    eligible: useEligible(r.id),
    kind: r.kind,
    position: r.position,
    starter: r.kind === 'pitcher' && isRotationStarter(r),
    starterSource: 'off his appearances this season',
    unknownTitle: (p) => `${p} — MLB's listed position`,
  });
  return (
    <PlayerIdentity teamId={r.teamId} team={r.team ?? ''} pos={pos}>
      {children}
    </PlayerIdentity>
  );
}

interface RowHandlers {
  onOpenDetails: (key: string) => void;
}

/** The shared leading cells of a summary row: headshot, name (link), opponent. */
function LeadCells({
  r,
  game,
  role,
  corner,
  onOpenDetails,
}: {
  r: PlayerReport;
  game: PlayerGame | null;
  role: LiveRole | null;
  corner: Corner;
} & RowHandlers) {
  return (
    <>
      <td className="sum-img-col">
        <SumPhoto
          id={r.id}
          playerKey={playerKey(r)}
          name={r.name}
          role={role}
          corner={corner}
          status={<SumStatus r={r} />}
          onOpen={onOpenDetails}
        />
      </td>
      <th className="sum-name-col" scope="row">
        {/* Ahead of the name rather than after it, and only on this table: the
            slot is what you scan a fantasy roster by, so it leads. Outside the
            button, since the name is a link to that player's page and a slot
            chip is a label rather than part of what you are pressing. It leads
            the whole identity block rather than the name line inside it — the
            chip is one fact about the row, not a second line of who he is, and
            a 42px floor plus `align-items: center` is what keeps every name in
            the column starting at one x against a two-line block. */}
        <FantasySlotTag playerKey={playerKey(r)} />
        {/* **His club and his positions, under the name** — the research
            board's identity block, drawn by the same component (see
            `PlayerIdentity`). This table said neither: which club a man plays
            for, and where a fantasy league will let you start him, are the two
            standing facts about a roster row, and the only column with slack
            to spend is the one already carrying his name. */}
        <RowIdentity r={r}>
          {/* The name opens his player page, exactly as the headshot beside it
              does. It used to jump to his card on the feed's grouped reading —
              the page that reading has since become *is* the player page, whose
              Overview tab opens on the very day the jump was for, so the two
              controls lead to one place rather than to two. */}
          <button
            type="button"
            className="sum-name sum-name-link"
            title={`${r.name} — player page`}
            onClick={() => onOpenDetails(playerKey(r))}
          >
            {r.name}
          </button>
          {/* The status is on the headshot (`PhotoStatus`), not here: an injured
              player is on this table whenever the hide-injured toggle is off, so
              the row must say why its stats are dashes — but it can say it in
              four characters on a circle the row already draws, instead of a
              chip that widens the one column this table can least afford. */}
        </RowIdentity>
      </th>
      <OpponentCell game={game} />
    </>
  );
}

/** The batter stat table: one row per hitter, with an aggregate total row. */
/** Full-page state, handed down to whichever table renders the corner cell the
 *  button sits in. */
type Expand = { isFull: boolean; toggle: () => void };

function BatterTable({
  batters,
  handlers,
  expand,
}: {
  batters: PlayerReport[];
  handlers: RowHandlers;
  expand: Expand;
}) {
  const total = combineLines(batters.flatMap((r) => r.games.map((g) => g.line)));
  const cols = ['H/AB', 'R', 'HR', 'RBI', 'SB', 'OPS', 'BB', 'K'];
  return (
    <table className="summary-table">
      <thead>
        <tr>
          <th className="sum-img-col" scope="col">
            <span className="sr-only">Photo</span>
            <ExpandButton isFull={expand.isFull} onToggle={expand.toggle} what="table" />
          </th>
          <th className="sum-name-col" scope="col">
            Batter
          </th>
          <th className="sum-opp-col" scope="col">
            Opponent
          </th>
          {cols.map((c) => (
            <th key={c} className="sum-num" scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {batters.map((r) => {
          const game = pickGame(r);
          const role = liveRole(r);
          return (
            <tr key={r.id} className={role ? `role-${role}` : undefined}>
              <LeadCells r={r} game={game} role={role} corner={game ? lineupCorner(game) : null} {...handlers} />
              <StatCells line={combineLines(r.games.map((g) => g.line))} />
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td className="sum-img-col" aria-hidden="true" />
          <th className="sum-name-col" scope="row">
            <span className="sum-total-label">Total · {batters.length}</span>
          </th>
          <td className="sum-opp" aria-hidden="true" />
          <StatCells line={total} />
        </tr>
      </tfoot>
    </table>
  );
}

/** The pitcher stat table: one row per pitcher, with an aggregate total row. */
function PitcherTable({
  pitchers,
  handlers,
  expand,
}: {
  pitchers: PlayerReport[];
  handlers: RowHandlers;
  expand: Expand;
}) {
  const totalLine = combinePitchingLines(
    pitchers.flatMap((r) => r.games.filter((g) => g.pitching).map((g) => g.pitching!.line)),
  );
  const cols = ['IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'W', 'SV', 'HLD', 'ERA', 'WHIP'];
  return (
    <table className="summary-table summary-table-pitchers">
      <thead>
        <tr>
          <th className="sum-img-col" scope="col">
            <span className="sr-only">Photo</span>
            <ExpandButton isFull={expand.isFull} onToggle={expand.toggle} what="table" />
          </th>
          <th className="sum-name-col" scope="col">
            Pitcher
          </th>
          <th className="sum-opp-col" scope="col">
            Opponent
          </th>
          {cols.map((c) => (
            <th key={c} className="sum-num" scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pitchers.map((r) => {
          const game = pickGame(r);
          const role = liveRole(r);
          return (
            <tr key={r.id} className={role ? `role-${role}` : undefined}>
              <LeadCells r={r} game={game} role={role} corner={game ? pitchingCorner(game) : null} {...handlers} />
              <PitchStatCells line={aggregatePitching(r)} />
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td className="sum-img-col" aria-hidden="true" />
          <th className="sum-name-col" scope="row">
            <span className="sum-total-label">Total · {pitchers.length}</span>
          </th>
          <td className="sum-opp" aria-hidden="true" />
          <PitchStatCells line={totalLine} />
        </tr>
      </tfoot>
    </table>
  );
}

/**
 * The key to the row tints, drawn under the table.
 *
 * **It is always drawn, and it always names all four rules.** Both halves of
 * that are a reversal, and both reversals are the same correction: this is a
 * *key to the app's colour vocabulary*, not a report on what happens to be live
 * this half-inning.
 *
 * What stood here argued the opposite, and the argument reads well until you
 * meet it on a page. It was gated on `anyLive` — something on screen actually
 * at bat, on deck, on base or on the mound — by analogy with the marks the app
 * suppresses when they would say nothing: the research board's roster baseball
 * when every row carries one, the kind tabs when only one kind is watched. The
 * analogy does not hold. Those are marks *on* the data, and a mark on every row
 * distinguishes nothing; this is a **legend**, and a legend's whole job is to be
 * there before you need it. The effect of the gate was that the one time a
 * reader goes looking for it — a quiet morning, a tinted row they have not seen
 * before, "what does the purple mean" — is precisely the time it was not on the
 * page. And it made the key flicker: it appeared at first pitch and vanished at
 * the last out, on a table the reader had not touched.
 *
 * The contents were per-kind for a related reason and cost the same thing: the
 * batter tab drew the three batting roles and the pitcher tab the one pitching
 * role, so **"On mound" could not be read from the Batters tab at all** — you
 * had to already know the purple meant something in order to go and find out
 * what. A vocabulary is not per-page. All four are drawn on both tabs, which
 * also puts the on-base and on-mound swatches side by side for the first time:
 * they are the same purple, deliberately and by the app's own convention (a man
 * on base and a man on the mound are both *in the game right now*), and a key
 * that shows them as one colour under two labels is stating that convention
 * rather than hiding it.
 *
 * What the gate was really protecting is real and is kept: the row costs the
 * pane its height, this view being a fixed-height column where every pixel
 * under the table is a row of players off the bottom of it. That is a fixed
 * ~36px now rather than a row that comes and goes, which is the cheaper thing
 * to lay out and by far the easier thing to read.
 *
 * The labels are `liveRoleLabel`'s, the same strings the live tag on a feed row
 * and a player card carry, and the swatches read the same `--role-*` tokens the
 * row tints do, so the key and the thing it explains cannot come to call one
 * role by two names or paint it in two colours.
 */
function RoleLegend() {
  return (
    <div className="summary-legend">
      {ALL_ROLES.map((role) => (
        <span key={role} className="summary-legend-item">
          <span className={`summary-legend-swatch role-${role}`} aria-hidden="true" />
          {liveRoleLabel(role)}
        </span>
      ))}
    </div>
  );
}

/** Every rule the row tints can express, in the order a half-inning runs
 *  through them — at the plate, next up, aboard, and the man throwing. */
const ALL_ROLES: LiveRole[] = ['at-bat', 'on-deck', 'on-base', 'pitching'];

/**
 * A full-page stat table over the date range — batters and pitchers in separate
 * stacked tables (each with its own columns + total row). The header/total rows
 * stick vertically and the headshot column sticks horizontally.
 */
export function SummaryTable({
  reports,
  onOpenDetails,
  chrome,
}: {
  reports: PlayerReport[];
  /** The headshot and the name both open the player's page — the one that leads
   *  with his day. */
  onOpenDetails: (key: string) => void;
  /** What to keep from the app's own chrome once the table has the page: the
   *  kind tabs and the date control, handed down as nodes because App owns both
   *  the state behind them and the markup. Rendered only while expanded. */
  chrome?: ReactNode;
}) {
  const handlers = { onOpenDetails };
  const batters = reports.filter((r) => r.kind !== 'pitcher');
  const pitchers = reports.filter((r) => r.kind === 'pitcher');
  const { isFull, toggle, ref: fullRef } = useFullPage<HTMLDivElement>();
  const expand = { isFull, toggle };
  return (
    /* Full page is a class on this box, not the Fullscreen API — see
       `hooks.ts::useFullPage`. The button that sets it is down in the table's
       corner header cell, which is pinned on both axes and so is always the way
       back out. */
    <div ref={fullRef} className={`summary-view${isFull ? ' is-expanded' : ''}`}>
      {/* Expanded, the app's header and tab rows are behind this box — but
          which kind the table is showing and which days it covers are not
          decoration, they are what the numbers *are*, and both are controls you
          reach for while reading. They come along; nothing else does. */}
      {isFull && chrome && <div className="expanded-chrome">{chrome}</div>}
      <div className="summary-scroll">
        {/* The tables sit in one max-content flex column so the narrower of the
            two stretches to the other's width — otherwise the batter table (fewer
            columns) would stop short of the scrolled-right edge. */}
        <div className="summary-tables">
          {batters.length > 0 && (
            <BatterTable batters={batters} handlers={handlers} expand={expand} />
          )}
          {pitchers.length > 0 && (
            <PitcherTable pitchers={pitchers} handlers={handlers} expand={expand} />
          )}
        </div>
      </div>
      {/* The key to the row tints — always, and the whole vocabulary, however
          quiet the day is. See `RoleLegend`. */}
      <RoleLegend />
    </div>
  );
}
