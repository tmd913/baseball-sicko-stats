import { useState, type ReactNode } from 'react';
import type {
  FacedBatter,
  PitcherGame,
  PitcherSplit,
  PitchingCredit,
  PitchingLine,
  PlayerGame,
  PlayerReport,
} from '../types';
import { playerKey } from '../types';
import { useScrollIntoViewOnExpand } from '../hooks';
import {
  combinePitchingLines,
  creditLabel,
  decisionColor,
  eraOf,
  formatIp,
  liveRole,
  mostRecentGameFirst,
  pitchingBadge,
  pitchingCorner,
  prettyGameDate,
  rangePitchingSummary,
  whipOf,
} from '../lib';
import {
  ArsenalRow,
  SplitTabs,
  ResultStat,
  RateBar,
  avg3,
  pct,
} from './Arsenal';
import type { SplitKey } from './Arsenal';
import { InningsList } from './Innings';
import { OpponentSection } from './OpponentTable';
import {
  GameStatusBadge,
  Headshot,
  LiveRoleTag,
  matchupLine,
  PlayerName,
  ProbablePitcher,
} from './PlayerCard';

/**
 * How the pitcher came into this game — "SP" for the starter (announced before
 * first pitch, confirmed once he's thrown one) or "RP 7th" for a reliever,
 * naming the inning he entered. The pitcher-side counterpart of the batter
 * card's lineup chip; nothing to show until he's announced or appears.
 */
export function PitchingTag({ game }: { game: PlayerGame }) {
  const badge = pitchingBadge(game);
  if (!badge) return null;
  return (
    <span className={`lineup-tag lineup-tag-${badge.tone}`} title={badge.title}>
      {badge.label}
    </span>
  );
}

/** A one-line pitching line: "6.0 IP, 4 H, 2 ER, 1 BB, 5 K". */
export function lineSummary(l: PitchingLine): string {
  const parts = [`${formatIp(l.outs)} IP`];
  if (l.hits) parts.push(`${l.hits} H`);
  parts.push(`${l.earnedRuns} ER`);
  if (l.walks) parts.push(`${l.walks} BB`);
  parts.push(`${l.strikeouts} K`);
  if (l.hr) parts.push(`${l.hr} HR`);
  return parts.join(', ');
}

/**
 * One section of a pitcher card — Line, Innings, Opponent (once there's an
 * outing beneath it), Arsenal. The bar reuses the batter card's game bar
 * (`.game-sub-bar`) so the two cards' toggles share one format: a bare label,
 * no caret.
 *
 * **`defaultOpen` now means "not a toggle at all".** Every surviving render of
 * this component is inside a box opened *for* its sections — and a bar that is
 * open from the start, in a box whose whole purpose is what is under it, is a
 * control asking a question that has already been answered. So the head is a
 * plain label there and the scroll-on-expand goes with the expansion: a dialog
 * has its own scroller and nothing to scroll *to*.
 *
 * **And `bare` is one step further on: not a section header at all.** The
 * outing page (`OutingPage.tsx`) puts each of these behind a *tab*, and a tab
 * strip pinned at the top of that page has already said `Line` — a heading
 * twenty pixels under it saying `Line` again is the same word twice, which is
 * exactly the argument `defaultOpen` makes about the bar it replaced. Three
 * modes rather than two because the three are genuinely three: a section on a
 * long page folds away, a section in a box opened for it is labelled, and a
 * section that *is* the page needs no label at all.
 *
 * The collapsible half is kept, unrendered, because `PitcherCard` still names
 * it and that card is kept for its parts (see **Pitchers on the roster**);
 * where a section is genuinely one of several on a long page, folding it away
 * is still the right shape — which is the same judgment `InningBlock` records.
 */
export function CardSection({
  title,
  defaultOpen = false,
  bare = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  /** Draw the children with no bar and no label — see above. */
  bare?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (bare) return <div className="card-section">{children}</div>;
  if (defaultOpen) {
    return (
      <div className="card-section">
        <div className="game-sub-bar section-bar static">
          <span className="section-title">{title}</span>
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="card-section">
      <button
        type="button"
        className="game-sub-bar section-bar"
        aria-expanded={open}
        title={open ? `Collapse ${title.toLowerCase()}` : `Expand ${title.toLowerCase()}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="section-title">{title}</span>
      </button>
      {open && children}
    </div>
  );
}

/** The selected handedness split, or null for the whole outing. */
function splitOf(pg: PitcherGame, key: SplitKey): PitcherSplit | null {
  if (key === 'R') return pg.vsRight;
  if (key === 'L') return pg.vsLeft;
  return null;
}

/** The Savant-style arsenal table (one row per pitch type), for the whole
 * outing or one batter handedness. */
export function ArsenalSection({
  pg,
  defaultOpen = false,
  bare = false,
}: {
  pg: PitcherGame;
  defaultOpen?: boolean;
  bare?: boolean;
}) {
  const [split, setSplit] = useState<SplitKey>('all');
  if (pg.pitchMix.length === 0) return null;
  const mix = splitOf(pg, split)?.pitchMix ?? pg.pitchMix;
  return (
    <CardSection title="Arsenal" defaultOpen={defaultOpen} bare={bare}>
      <SplitTabs hasRight={!!pg.vsRight} hasLeft={!!pg.vsLeft} value={split} onChange={setSplit} />
      <div className="arsenal">
        {mix.map((m) => (
          <ArsenalRow key={m.pitchType} m={m} split={split} />
        ))}
      </div>
    </CardSection>
  );
}

/** Batted-ball threshold Statcast calls "hard hit". */
const HARD_HIT_MPH = 95;

/**
 * Contact quality allowed, over the balls the pitcher let the batter put in
 * play. Derived from the plays rather than the boxscore — the boxscore only
 * counts batted-ball *outs*, and exit velocity isn't in it at all. A ball
 * counts as in play once it has either a trajectory or an exit velocity;
 * Statcast misses one or the other often enough to need both.
 */
function battedBallStats(faced: FacedBatter[]) {
  let bip = 0;
  let evSum = 0;
  let evCount = 0;
  let maxEv: number | null = null;
  let hard = 0;
  let gb = 0;
  let ld = 0;
  let fly = 0; // fly balls and popups together — the usual "FB%"
  for (const fb of faced) {
    const t = fb.bbType;
    if (!t && fb.launchSpeed === null) continue;
    bip++;
    if (fb.launchSpeed !== null) {
      evSum += fb.launchSpeed;
      evCount++;
      if (maxEv === null || fb.launchSpeed > maxEv) maxEv = fb.launchSpeed;
      if (fb.launchSpeed >= HARD_HIT_MPH) hard++;
    }
    if (t?.includes('ground')) gb++;
    else if (t?.includes('line')) ld++;
    else if (t?.includes('fly') || t?.includes('popup')) fly++;
  }
  const share = (n: number) => (bip ? n / bip : null);
  return {
    bip,
    avgEv: evCount ? evSum / evCount : null,
    maxEv,
    // Over the batted balls Statcast actually tracked, not all of them.
    hardPct: evCount ? hard / evCount : null,
    gbPct: share(gb),
    ldPct: share(ld),
    fbPct: share(fly),
  };
}

/**
 * The outing's aggregate line, laid out as an arsenal row rather than a grid of
 * stat pills — the two then read as one table. The head strip carries the
 * decision, innings and pitch count (with strike% as the usage bar), the
 * counting stats fill the metric grid, and the rates ride in the same dashed
 * strip the arsenal uses for its season results.
 */
export function GameLine({
  pg,
  defaultOpen = true,
  bare = false,
}: {
  pg: PitcherGame;
  defaultOpen?: boolean;
  bare?: boolean;
}) {
  const [split, setSplit] = useState<SplitKey>('all');
  const sp = splitOf(pg, split);
  // A split's line is derived from the plays, so it has no innings, and the
  // decision belongs to the game as a whole — both are Overall-only.
  const L = sp ? sp.line : pg.line;
  const rates = sp ?? pg;
  const color = sp ? 'var(--accent)' : decisionColor(pg.decision);
  const strike = rates.strikePct === null ? 0 : Math.round(rates.strikePct * 100);
  const bb = battedBallStats(
    split === 'all' ? pg.facedBatters : pg.facedBatters.filter((f) => f.stand === split),
  );
  // Rates over batters faced, the denominator Savant uses for K%/BB%.
  const perBf = (n: number) => (L.battersFaced ? n / L.battersFaced : null);
  const singles = Math.max(0, L.hits - L.doubles - L.triples - L.hr);
  return (
    <CardSection title="Line" defaultOpen={defaultOpen} bare={bare}>
      <SplitTabs hasRight={!!pg.vsRight} hasLeft={!!pg.vsLeft} value={split} onChange={setSplit} />
      <div className="pline">
        <div className="ars-row" style={{ borderLeftColor: color }}>
          <div className="ars-head">
            <span className="ars-dot" style={{ background: color }} />
            {!sp && pg.decision && (
              <span className={`ars-abbr dec-${pg.decision}`}>{creditLabel(pg.decision)}</span>
            )}
            <span className="ars-name pline-ip">
              {sp ? `${L.battersFaced} BF` : `${formatIp(L.outs)} IP`}
            </span>
            <span className="ars-count">{L.pitchesThrown} P</span>
            {/* The arsenal's rate bar, so the line and the rows read alike.
                Neutral accent, not the decision color — a strike rate isn't
                good or bad by itself. */}
            <RateBar
              label="Strike"
              pct={rates.strikePct === null ? null : strike}
              color="var(--accent)"
              counts={`${L.strikes} S · ${L.balls} B`}
            />
          </div>
          {/* Hits broken out by base, then runs, free passes and strikeouts. */}
          <div className="ars-results">
            <span className="ars-rtag">Results</span>
            <ResultStat label="H" value={String(L.hits)} title={`${singles} singles`} />
            <ResultStat label="2B" value={String(L.doubles)} />
            <ResultStat label="3B" value={String(L.triples)} />
            <ResultStat label="HR" value={String(L.hr)} />
            <ResultStat
              label="R"
              value={String(L.runs)}
              title={sp ? 'Runs that scored on these plays' : undefined}
            />
            <ResultStat label="ER" value={String(L.earnedRuns)} />
            <ResultStat
              label="BB"
              value={String(L.walks)}
              title={L.intentionalWalks ? `${L.intentionalWalks} intentional` : undefined}
            />
            <ResultStat label="HBP" value={String(L.hitBatsmen)} />
            <ResultStat label="K" value={String(L.strikeouts)} />
          </div>
          <div className="ars-results">
            <span className="ars-rtag">Rates</span>
            {/* Both are per-inning, and a split has no innings of its own. */}
            {!sp && <ResultStat label="ERA" value={eraOf(L)} />}
            {!sp && <ResultStat label="WHIP" value={whipOf(L)} />}
            <ResultStat label="BAA" value={avg3(L.atBats ? L.hits / L.atBats : null)} />
            <ResultStat label="K%" value={pct(perBf(L.strikeouts))} />
            <ResultStat label="BB%" value={pct(perBf(L.walks))} />
            <ResultStat label="Whiff" value={pct(rates.whiffRate)} />
            <ResultStat label="CSW" value={pct(rates.cswRate)} />
            {/* Only worth the space when they actually happened. */}
            {L.wildPitches > 0 && <ResultStat label="WP" value={String(L.wildPitches)} />}
            {L.inheritedRunners > 0 && (
              <ResultStat
                label="IR scored"
                value={`${L.inheritedRunnersScored}/${L.inheritedRunners}`}
              />
            )}
          </div>
          {bb.bip > 0 && (
            <div className="ars-results" title={`${bb.bip} balls in play`}>
              <span className="ars-rtag">Contact</span>
              <ResultStat label="BIP" value={String(bb.bip)} />
              <ResultStat label="EV" value={bb.avgEv === null ? '—' : bb.avgEv.toFixed(1)} />
              <ResultStat label="Max" value={bb.maxEv === null ? '—' : bb.maxEv.toFixed(1)} />
              <ResultStat label={`${HARD_HIT_MPH}+`} value={pct(bb.hardPct)} />
              <ResultStat label="GB" value={pct(bb.gbPct)} />
              <ResultStat label="LD" value={pct(bb.ldPct)} />
              <ResultStat label="FB" value={pct(bb.fbPct)} />
            </div>
          )}
        </div>
      </div>
    </CardSection>
  );
}

// The opponent table moved to its own file when it became a table with its own
// controls and its own fetch; it is re-exported here because it is still a
// *section of a pitcher's card* to every caller, and renaming three import
// sites would buy nothing a line can't say.
export { OpponentSection };

/** One game a watched pitcher threw in: aggregate stats + arsenal + batters faced. */
function PitcherGameBlock({
  game,
  pitcherId,
  throws,
  showMatchup,
  spansMultipleDays,
}: {
  game: PlayerGame;
  pitcherId: number;
  throws: string | null;
  showMatchup: boolean;
  spansMultipleDays: boolean;
}) {
  const pg = game.pitching!;
  const L = pg.line;
  const [collapsed, setCollapsed] = useState(showMatchup);
  const blockRef = useScrollIntoViewOnExpand<HTMLDivElement>(!collapsed);

  const gameId = (
    <div className="game-sub-id">
      <span className="game-sub-title">
        {game.batterTeam} {game.isHome ? 'vs' : '@'} {game.opponent}
      </span>
      {spansMultipleDays && <span className="game-sub-meta">{prettyGameDate(game.date)}</span>}
    </div>
  );

  return (
    <div ref={blockRef} className="game-block">
      {showMatchup && (
        <div
          className="game-sub-bar"
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand game' : 'Collapse game'}
          onClick={() => setCollapsed((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setCollapsed((v) => !v);
            }
          }}
        >
          {gameId}
          <div className="game-sub-summary">
            <PitchingTag game={game} />
            <span className="game-sub-line">{lineSummary(L)}</span>
            <GameStatusBadge game={game} />
          </div>
        </div>
      )}

      {(!showMatchup || !collapsed) && (
        <div className="pitcher-body">
          {/* Game aggregate line */}
          <GameLine pg={pg} />

          {/* Batters faced — grouped by inning, each result expandable to its pitches */}
          <CardSection title="Innings">
            <InningsList game={game} pitcherId={pitcherId} />
          </CardSection>

          {/* The lineup on the other side. Once he's thrown a pitch this is
              background rather than the headline, so it sits under the outing
              itself and collapses like every section around it. */}
          <OpponentSection game={game} throws={throws} collapsible />

          {/* Arsenal: velo/spin/break per pitch type, vs season & league */}
          <ArsenalSection pg={pg} />
        </div>
      )}
    </div>
  );
}

/** "1 G" / "5 G" — how many of them the line above is added up from. */
function gameCount(n: number): string {
  return `${n} G`;
}

/**
 * The W/L/S/HLD earned across the outings in view, in scorebook order and with
 * only the credits he actually took. `PitchingLine` sums wins/saves/holds but
 * carries no losses, so this counts the per-game `decision` instead — one field,
 * all four credits.
 */
function creditTally(games: PlayerGame[]): { credit: PitchingCredit; n: number }[] {
  const ORDER: PitchingCredit[] = ['W', 'L', 'S', 'H'];
  return ORDER.map((credit) => ({
    credit,
    n: games.filter((g) => g.pitching?.decision === credit).length,
  })).filter((c) => c.n > 0);
}


/**
 * What an outing's bar says, whether or not it is a control: the role chip, the
 * credit, the line, and how the game stands. No caret — see the note on
 * `.feed-item-toggle` in styles.css.
 *
 * **It lives here rather than in `LiveFeed.tsx`, where it was written**, because
 * a second reader turned up: the outing page's own head draws the same strip
 * under the pitcher's name, and the two must not become two. Here rather than
 * there because the dependency runs one way — `LiveFeed` and `OutingPage` both
 * import from this file, and this file imports neither, so moving it up is what
 * keeps the pair out of a cycle. It is `PitchingTag`'s and `lineSummary`'s own
 * neighbourhood anyway, both of which it reads.
 */
export function outingBar(game: PlayerGame, pg: NonNullable<PlayerGame['pitching']>) {
  return (
    <>
      <PitchingTag game={game} />
      {pg.decision && (
        <span className={`dec-tag dec-${pg.decision}`}>{creditLabel(pg.decision)}</span>
      )}
      <span className="feed-pitch-line">{lineSummary(pg.line)}</span>
      {/* Score and state, the same badge closing the pitcher card's header —
          and, while he's on the mound, the inning and the bases behind him. */}
      <GameStatusBadge game={game} />
    </>
  );
}

export function PitcherCard({
  report,
  position,
  positionTitle,
  singleDay,
  collapsed,
  onToggleCollapsed,
  onOpenDetails,
}: {
  report: PlayerReport;
  position?: string;
  /** The whole eligibility list the chip is short for — see `PlayerName`. */
  positionTitle?: string;
  singleDay: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenDetails: (key: string) => void;
}) {
  const games = [...report.games].sort(mostRecentGameFirst);
  const pitched = games.filter((g) => g.pitching);
  const role = liveRole(report);
  /**
   * Whether the header can speak for one game — the role chip, the decision and
   * the final score all belong to a particular outing, not to a span of them.
   *
   * This is the **range** in view, not how many times he happened to pitch. On
   * the count alone a week read two different ways depending on the pitcher's
   * role: a starter makes one start in it and got a card that looked exactly
   * like a single day's — one line, one W, one final score, as though that game
   * were the week — while the reliever below him made five appearances and got
   * a bare aggregate. Same view, two formats, and the starter's was the one
   * telling a half-truth.
   */
  const onePitchedGame = singleDay && pitched.length === 1;

  // No outing in range — a header-only card with the game status (scheduled /
  // "did not pitch").
  if (pitched.length === 0) {
    // Nothing has happened in the range, so there is no line to add up and the
    // header says which game hasn't happened yet instead of printing one of
    // dashes — the matchup where there is a single game to name, the count where
    // there are several. It takes the slot the season line used to hold, which
    // is where the space for it was.
    const meta =
      games.length === 1
        ? matchupLine(games[0])
        : games.length > 1
          ? `${games[0].batterTeam} · ${games.length} games`
          : null;
    // He hasn't thrown a pitch, so the only thing this card can say beyond the
    // start time is who's waiting for him — which is when that reads best. A
    // game he sat out isn't offered: the lineup he didn't face is nothing.
    const ahead = games.filter((g) => g.opponentHitting && g.status.state !== 'final');
    const expandable = ahead.length > 0;
    // The dashed border claims "nothing is coming here" — so it belongs only on a
    // pitcher who can't still take the ball: no game at all, or every one of them
    // over (or called off) without him. While a game is scheduled or under way he
    // might yet appear, and if he's the announced starter he certainly will.
    const mayStillPitch = games.some(
      (g) => g.status.state === 'scheduled' || g.status.state === 'live',
    );
    const head = (
      <>
        {/* Tonight's announced starter is the pitcher's version of a posted
            lineup — the one thing worth flagging on a card with no outing. */}
        <Headshot
          id={report.id}
          name={report.name}
          onOpen={() => onOpenDetails(playerKey(report))}
          corner={games.length === 1 ? pitchingCorner(games[0]) : null}
          role={role}
        />
        <div className="player-id">
          <PlayerName
          name={report.name}
          position={position ?? 'P'}
          positionTitle={positionTitle}
          status={report.rosterStatus}
        />
          {meta && <span className="player-meta">{meta}</span>}
        </div>
        <div className="player-summary">
          {/* His counterpart tonight — the other half of what a card with no
              outing is about, the lineup below it being the first. Only for a
              lone game, like the pip: over a range there is no one starter to
              name. The SP chip is deliberately absent — the pip on the headshot
              already says it, under exactly this condition. */}
          {games.length === 1 && <ProbablePitcher game={games[0]} opposing />}
          {/* One badge per game only while the range is a day. Over a week these
              are his team's games, not his — he's in none of them — and a row of
              seven scores ran off the right of the card to say so. The count
              they used to collapse to now leads the header line above. */}
          {singleDay &&
            games.map((g) => (
              <GameStatusBadge key={g.gamePk} game={g} withMatchup={games.length > 1} />
            ))}
          {games.length > 0 && games.every((g) => g.status.state === 'final') && (
            <span className="dnp-badge">Did not pitch</span>
          )}
        </div>
      </>
    );
    return (
      <div
        className={`player-card${mayStillPitch ? '' : ' empty'}${
          expandable && collapsed ? ' collapsed' : ''
        }`}
        id={`player-${playerKey(report)}`}
      >
        {expandable ? (
          <div
            className="player-head player-head-toggle"
            role="button"
            tabIndex={0}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
            onClick={onToggleCollapsed}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleCollapsed();
              }
            }}
          >
            {head}
          </div>
        ) : (
          <div className="player-head">{head}</div>
        )}
        {expandable &&
          !collapsed &&
          ahead.map((g) => (
            <div key={g.gamePk} className="pitcher-body">
              {ahead.length > 1 && (
                <div className="game-sub-bar static">
                  <div className="game-sub-id">
                    <span className="game-sub-title">
                      {g.batterTeam} {g.isHome ? 'vs' : '@'} {g.opponent}
                    </span>
                  </div>
                </div>
              )}
              <OpponentSection game={g} throws={report.throws} />
            </div>
          ))}
      </div>
    );
  }

  const primary = pitched[0];
  const combined = combinePitchingLines(pitched.map((g) => g.pitching!.line));
  const spansMultipleDays = new Set(pitched.map((g) => g.date)).size > 1;
  const showMatchup = pitched.length > 1;

  const head = (
    <>
      {/* The role pip rides the headshot corner: "SP" for a starter, the inning
          a reliever entered in. Only for a lone outing — with several in view
          each game block's bar carries its own role chip. */}
      <Headshot
        id={report.id}
        name={report.name}
        onOpen={() => onOpenDetails(playerKey(report))}
        corner={onePitchedGame ? pitchingCorner(primary) : null}
        role={role}
      />
      <div className="player-id">
        <PlayerName
          name={report.name}
          position={position ?? 'P'}
          positionTitle={positionTitle}
          status={report.rosterStatus}
        />
        {/* A read on the range in view rather than on the season, which every
            section under this header already is. One outing on one day is a game
            the line can name — and worth naming, since a final's status badge
            carries the score and not the teams — so the aggregate takes over
            exactly where `onePitchedGame` stops. The season reads whole on the
            details view's Season tab, a tap away. */}
        <span className="player-meta">
          {onePitchedGame ? matchupLine(primary) : rangePitchingSummary(combined)}
        </span>
      </div>
      <div className="player-summary">
        <LiveRoleTag role={role} />
        {/* One outing's W/L/S/HLD, or — over a range — the tally of them, which
            is what a week of relief work comes down to and the one part of the
            per-game chrome that does survive being added up. */}
        {onePitchedGame
          ? primary.pitching!.decision && (
              <span className={`dec-tag dec-${primary.pitching!.decision}`}>
                {creditLabel(primary.pitching!.decision)}
              </span>
            )
          : creditTally(pitched).map(({ credit, n }) => (
              <span key={credit} className={`dec-tag dec-${credit}`}>
                {n > 1 ? `${n} ` : ''}
                {creditLabel(credit)}
              </span>
            ))}
        <span className="summary-line">
          {!onePitchedGame && `${gameCount(pitched.length)} · `}
          {lineSummary(combined)}
        </span>
        {/* No `withMatchup`: the header line beside it names this game, and the
            badge's own copy of the teams would be the same fact twice. */}
        {onePitchedGame && <GameStatusBadge game={primary} />}
      </div>
    </>
  );

  return (
    <div
      className={`player-card${collapsed ? ' collapsed' : ''}`}
      id={`player-${playerKey(report)}`}
    >
      <div
        className="player-head player-head-toggle"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand' : 'Collapse'}
        onClick={onToggleCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapsed();
          }
        }}
      >
        {head}
      </div>

      {!collapsed &&
        pitched.map((g) => (
          <PitcherGameBlock
            key={g.gamePk}
            game={g}
            pitcherId={report.id}
            throws={report.throws}
            showMatchup={showMatchup}
            spansMultipleDays={spansMultipleDays}
          />
        ))}
    </div>
  );
}
