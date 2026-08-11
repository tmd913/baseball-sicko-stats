import { useState } from 'react';
import type { LiveRole } from '../lib';
import { playerKey } from '../types';
import {
  creditLabel,
  formatStartTime,
  handThrows,
  headshotUrl,
  isOnActiveRoster,
  isRotationStarter,
  liveRoleGame,
  liveRoleLabel,
  surname,
} from '../lib';
import type {
  BaseEvent,
  PlateAppearance,
  PlayerGame,
  PlayerKind,
  PlayerReport,
} from '../types';
import { useScrollIntoViewOnExpand } from '../hooks';
import { BaseDiamond } from './BaseDiamond';
import { InlineVideoClip, PlateAppearanceCard } from './PlateAppearanceCard';
import { GameStatusBadge, PlatoonSplit } from './PlayerCard';
import { OpponentSection, PitchingTag, lineSummary } from './PitcherCard';
import { InningsList } from './Innings';

/** How many stream items the Recent section shows at a time — a day of at-bats
 * across a watchlist runs to hundreds, and every one of them mounts a card. */
const PAGE_SIZE = 20;

/** Priority order for the Live section: at bat, then on deck, then on base. */
const ROLE_ORDER: Record<LiveRole, number> = {
  'at-bat': 0,
  'on-deck': 1,
  'on-base': 2,
  pitching: 3,
};

/** A player's live game inning, e.g. "Top 7" (falls back to the game's label). */
function liveInning(game: PlayerGame): string {
  const s = game.status;
  return s.currentInning !== null
    ? `${s.inningState ?? ''} ${s.currentInning}`.trim()
    : s.detailedState || 'Live';
}

/** The matchup line, "NYY vs BOS" / "NYY @ BOS", from the batter's perspective. */
function matchup(game: PlayerGame): string {
  return `${game.batterTeam} ${game.isHome ? 'vs' : '@'} ${game.opponent}`;
}

/** The in-progress plate appearance (no final event yet) — the batter's current at-bat. */
function currentAtBat(game: PlayerGame): PlateAppearance | null {
  const inProgress = game.plateAppearances.filter((pa) => !pa.event);
  return inProgress.length ? inProgress[inProgress.length - 1] : null;
}

/**
 * The at-bat to surface for a player's live role: the current (in-progress)
 * at-bat while he's batting, and nothing otherwise. A runner on base has only a
 * *completed* at-bat behind him, which the Recent section already carries in
 * full — repeating it, and its clip, in the Live section stated the same thing
 * twice and pushed the players actually batting down the page. On deck there's
 * nothing to show yet either.
 */
function roleAtBat(role: LiveRole, game: PlayerGame): PlateAppearance | null {
  return role === 'at-bat' ? currentAtBat(game) : null;
}

/** A recent-stream item: a batter's plate appearance, a base-running event, or
 * a watched pitcher's whole outing (one item, grouped by inning below). */
type FeedEntry =
  | { type: 'pa'; report: PlayerReport; game: PlayerGame; pa: PlateAppearance }
  | { type: 'base'; report: PlayerReport; game: PlayerGame; evs: BaseEvent[]; key: string }
  | { type: 'pitching'; report: PlayerReport; game: PlayerGame };

/** When a pitcher's outing last saw action — the batters faced are in play
 * order, so that's the last one's timestamp. */
function lastFacedTime(game: PlayerGame): string | null {
  const faced = game.pitching?.facedBatters ?? [];
  return faced.length ? faced[faced.length - 1].timestamp : null;
}

/** Sort key for the recent stream: the item's timestamp, falling back to the end
 * of the game's date so undated cached items still land on the right day. */
function entryTime(e: FeedEntry): number {
  const ts =
    e.type === 'pa'
      ? e.pa.timestamp
      : e.type === 'pitching'
        ? lastFacedTime(e.game)
        : e.evs[0].timestamp;
  if (ts) {
    const t = Date.parse(ts);
    if (!Number.isNaN(t)) return t;
  }
  const d = Date.parse(`${e.game.date}T23:59:59Z`);
  return Number.isNaN(d) ? 0 : d;
}

/**
 * Tie-break within a single play. Every event of a play carries that play's
 * `endTime`, so a steal, the run it turned into and the plate appearance they
 * happened on are indistinguishable by timestamp — and which of them led came
 * down to the order the server happened to record them in. This orders them by
 * what actually happened: the batter's result, then the steal, then the run.
 * Sorted descending like the timestamp, so the newest-first stream still reads
 * back in time through a play (Run Scored above Stole 3rd above the single).
 */
function playOrder(e: FeedEntry): number {
  if (e.type !== 'base') return 0;
  return e.evs.some((ev) => ev.kind === 'run') ? 2 : 1;
}

/**
 * A player's name in a feed row — a button that jumps to their full day of
 * at-bats on the players view. stopPropagation so it doesn't also toggle a
 * collapsible the name sits inside (the live/upcoming row headers).
 */
function FeedPlayerName({
  playerKey: key,
  name,
  onOpen,
}: {
  playerKey: string;
  name: string;
  onOpen: (key: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        className="feed-player-name feed-player-name-link"
        title={`${name} — full day`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(key);
        }}
      >
        {name}
      </button>
    </>
  );
}

/**
 * A player's headshot, opening their Statcast details on click. A compact
 * variant of the player card's headshot; `role` paints the live-role ring.
 */
function FeedHeadshot({
  id,
  name,
  role,
  onOpen,
}: {
  id: number;
  name: string;
  role?: LiveRole | null;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={`feed-photo-link${role ? ` role-${role}` : ''}`}
      title={`${name} — Statcast details`}
      aria-label={`${name} — Statcast details`}
      onClick={(e) => {
        // Don't also toggle a collapsible row this headshot sits inside.
        e.stopPropagation();
        onOpen();
      }}
    >
      {failed ? (
        <span className="feed-photo feed-photo-empty" aria-hidden="true" />
      ) : (
        <img
          className="feed-photo"
          src={headshotUrl(id)}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}

/**
 * One player in the Live section. The header carries the headshot (role ring),
 * name, matchup + inning, the situation and the role tag; beneath it, the
 * batter's current at-bat while he's up — on base and on deck the row is the
 * header alone.
 *
 * **The situation is the point of this section**, and it used to be missing:
 * "on base" said where the player was and nothing about the state he was in.
 * The diamond is `BaseDiamond`, the same glyph an at-bat card and the summary
 * table's live badge carry, so runners and outs read the one way everywhere —
 * and it is drawn from `game.status`, which is the *current* state, where the
 * at-bat card's is the state that at-bat began in.
 *
 * **What has happened during the at-bat rides under the header** (`pa.actions`)
 * — a pitching change most of all, since the man on the mound is the whole
 * question when your batter is up and the card's matchup line has already been
 * overtaken by it. Only for a live at-bat, which is the only place the server
 * fills them.
 */
function LiveEntry({
  report,
  role,
  game,
  open,
  onToggle,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  role: LiveRole;
  game: PlayerGame;
  open: boolean;
  onToggle: () => void;
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  const pa = roleAtBat(role, game);
  // Scroll the whole item (player header + at-bat) into view on expand, so the
  // player info isn't cut off above the viewport — the card itself doesn't scroll.
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  return (
    <div className={`feed-item live-entry role-${role}`} ref={ref}>
      <div className="feed-item-head">
        <FeedHeadshot
          id={report.id}
          name={report.name}
          role={role}
          onOpen={() => onOpenDetails(playerKey(report))}
        />
        <div className="feed-item-id">
          <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
          <span className="feed-context">
            {matchup(game)} · {liveInning(game)}
          </span>
        </div>
        {game.status.bases && (
          <BaseDiamond
            bases={game.status.bases}
            outs={game.status.outs ?? 0}
            className="live-bases"
          />
        )}
        <span className={`live-role role-${role}`}>{liveRoleLabel(role)}</span>
      </div>
      {pa?.actions.map((action, i) => (
        <p key={`${action.type}-${i}`} className="live-action">
          {action.description}
        </p>
      ))}
      {pa && (
        <PlateAppearanceCard
          pa={pa}
          gamePk={game.gamePk}
          open={open}
          onToggle={onToggle}
          autoScroll={false}
          showVideo={false}
        />
      )}
      {pa?.playId && <InlineVideoClip playId={pa.playId} gamePk={game.gamePk} />}
    </div>
  );
}

/** One completed at-bat in the Recent section: player header + the at-bat card. */
function FeedAtBat({
  report,
  game,
  pa,
  open,
  onToggle,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  game: PlayerGame;
  pa: PlateAppearance;
  open: boolean;
  onToggle: () => void;
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  // Expanding scrolls the whole item to the top so the player header stays in
  // view above the at-bat detail (the card itself doesn't self-scroll).
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  return (
    <div className="feed-item" ref={ref}>
      <div className="feed-item-head">
        <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
        <div className="feed-item-id">
          <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
          <span className="feed-context">{matchup(game)}</span>
        </div>
      </div>
      <PlateAppearanceCard
        pa={pa}
        gamePk={game.gamePk}
        open={open}
        onToggle={onToggle}
        autoScroll={false}
        showVideo={false}
      />
      {pa.playId && <InlineVideoClip playId={pa.playId} gamePk={game.gamePk} />}
    </div>
  );
}

/** The label for a base-running feed event, e.g. "Stole 2nd" or "Run Scored". */
function baseEventLabel(ev: BaseEvent): string {
  if (ev.kind === 'run') return 'Run Scored';
  return ev.base ? `Stole ${ev.base}` : 'Stolen Base';
}

/**
 * Base events that happened on the same play, gathered into one item.
 *
 * A steal of home is **two** events — he took a base and he scored — and the
 * feed listed them separately: same description, same clip, one directly above
 * the other, as though two things had happened. It is one thing, and it now
 * reads as one item carrying both badges. So does the runner who steals second
 * and comes home on the throw.
 *
 * `playId` is the id of the play event both were read off, so it is the key;
 * the timestamp stands in when a play has no clip id, since every event of one
 * play carries that play's `endTime` — which is exactly why `playOrder` had to
 * exist. An event with neither stays on its own rather than being lumped in
 * with every other keyless one.
 *
 * Within a group the steal leads and the run follows, cause before effect,
 * which is how the badges read.
 */
function groupBaseEvents(events: BaseEvent[]): BaseEvent[][] {
  const groups: BaseEvent[][] = [];
  const byKey = new Map<string, BaseEvent[]>();
  for (const ev of events) {
    const key = ev.playId ?? ev.timestamp;
    const existing = key === null ? undefined : byKey.get(key);
    if (existing) {
      existing.push(ev);
      continue;
    }
    const group = [ev];
    groups.push(group);
    if (key !== null) byKey.set(key, group);
  }
  for (const group of groups) group.sort((a, b) => kindOrder(a) - kindOrder(b));
  return groups;
}

/** Steal before run within one play: he took the base, and so he scored. */
function kindOrder(ev: BaseEvent): number {
  return ev.kind === 'sb' ? 0 : 1;
}

/** A base as the feed says it: "2B" → "2nd". */
function baseName(base: string): string {
  return base === '1B' ? '1st' : base === '2B' ? '2nd' : base === '3B' ? '3rd' : base;
}

/** "2 outs" / "1 out" — MLB counts the outs already made. */
function outsLabel(outs: number): string {
  return `${outs} ${outs === 1 ? 'out' : 'outs'}`;
}

/**
 * The situation the event happened in, as a list of phrases the row joins with
 * dots. A run says where he came from; a steal says the count he went on and
 * who the battery was — the two facts that decide whether a bag was there to be
 * taken. Each piece is dropped rather than dashed when the feed didn't carry it.
 */
function baseEventMeta(ev: BaseEvent): string[] {
  const parts: string[] = [];
  if (ev.kind === 'run' && ev.fromBase) parts.push(`Scored from ${baseName(ev.fromBase)}`);
  if (ev.kind === 'sb' && ev.balls !== null && ev.strikes !== null) {
    parts.push(`${ev.balls}-${ev.strikes} count`);
  }
  if (ev.outs !== null) parts.push(outsLabel(ev.outs));
  if (ev.kind === 'sb') {
    if (ev.pitcherName) parts.push(`off ${surname(ev.pitcherName)}`);
    if (ev.batterName) parts.push(`${surname(ev.batterName)} batting`);
  }
  return parts;
}

/**
 * The situation for a whole play, when more than one event came off it.
 *
 * The two lists overlap by construction — both events carry the play's outs —
 * so it dedupes rather than concatenating. And a run that came of a **steal of
 * home** drops its "Scored from 3rd": stealing home says where he was standing,
 * and the phrase would only restate the badge beside it.
 */
function playMeta(evs: BaseEvent[]): string[] {
  const stoleHome = evs.some((ev) => ev.kind === 'sb' && ev.base === 'home');
  const parts: string[] = [];
  for (const ev of evs) {
    for (const part of baseEventMeta(ev)) {
      if (stoleHome && part.startsWith('Scored from')) continue;
      if (!parts.includes(part)) parts.push(part);
    }
  }
  return parts;
}

/** The score the event left behind, in the game badge's own form. */
function baseEventScore(ev: BaseEvent, game: PlayerGame): string | null {
  if (ev.awayScore === null || ev.homeScore === null) return null;
  return `${game.awayTeam} ${ev.awayScore}–${ev.homeScore} ${game.homeTeam}`;
}

/**
 * One base-running event in the Recent section — a stolen base or a run scored.
 *
 * It reads as a plate appearance does, because in this stream it is the same
 * kind of thing: the same player header, then what happened, then the clip of it
 * (a steal's own action clip; for a run, the play that drove him in). It carries
 * no pitch card — there is no sequence to show — so the detail is MLB's own line
 * for the event plus the situation it happened in, and nothing toggles: the
 * whole item is three short rows, where a caret would be hiding one of them.
 *
 * Who, what happened and the clip of it are **one thing to read**, so the
 * kind's rail runs down the whole item rather than boxing the middle of it —
 * the way a live entry's role rail runs header and card together. It used to
 * be three detached blocks: the name loose above a bordered box, the video in
 * a box of its own below, with nothing tying them together. A rail groups them
 * without any row posing as a control, which matters here because none of it
 * opens (see styles.css).
 */
function FeedBaseEvent({
  report,
  game,
  evs,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  game: PlayerGame;
  evs: BaseEvent[];
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  // Everything but the badges belongs to the play rather than to either event:
  // one inning, one description (both were read off the same play event, so the
  // line is the same string), one score, one clip.
  const lead = evs[0];
  const meta = playMeta(evs);
  const score = baseEventScore(lead, game);
  const description = evs.find((ev) => ev.description)?.description ?? '';
  const playId = evs.find((ev) => ev.playId)?.playId ?? null;
  // A run is what the play *did*, whatever the runner did to cause it, so it
  // takes the rail when both are here — the steal keeps its own colour on its
  // badge, where the distinction still reads.
  const railKind = evs.some((ev) => ev.kind === 'run') ? 'run' : lead.kind;
  return (
    <div className={`feed-item feed-base-item kind-${railKind}`}>
      <div className="feed-item-head">
        <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
        <div className="feed-item-id">
          <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
          <span className="feed-context">{matchup(game)}</span>
        </div>
      </div>
      <div className="feed-base">
        <div className="feed-base-row">
          <span className="feed-base-inning">
            {lead.half} {lead.inning}
          </span>
          {evs.map((ev, i) => (
            <span key={`${ev.kind}-${i}`} className={`feed-base-badge kind-${ev.kind}`}>
              {baseEventLabel(ev)}
            </span>
          ))}
          {score && <span className="feed-base-score">{score}</span>}
        </div>
        {description && <p className="feed-base-desc">{description}</p>}
        {meta.length > 0 && <div className="feed-base-meta">{meta.join(' · ')}</div>}
      </div>
      {playId && <InlineVideoClip playId={playId} gamePk={game.gamePk} />}
    </div>
  );
}

/**
 * A watched pitcher's outing in the feed — one item per game, not a row per
 * batter faced. Collapsed it's the usual feed header plus his line; open it adds
 * his innings, grouped the way the players view groups them (`InningsList`),
 * each expandable to the batters faced and their pitch sequences. Newest inning
 * first, so the half he's throwing right now sits directly under his name, like
 * the stream around it. `role` is set only while he's on the mound, and tints
 * the header.
 *
 * The line bar under the header toggles the item — the header itself carries the
 * headshot and name links and is static, so a mistimed tap can't navigate off the
 * outing it meant to open. The scroll-on-expand is on the item, not the innings
 * inside it — the same shape as a batter's at-bat card, so opening one brings the
 * player it belongs to into view rather than a bare inning. No caret: nothing on
 * the pitcher side carries one (see styles.css).
 */
function FeedPitcherGame({
  report,
  game,
  role,
  open,
  onToggle,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  game: PlayerGame;
  role?: LiveRole | null;
  open: boolean;
  onToggle: () => void;
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  const pg = game.pitching!;
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  return (
    <div className={`feed-item feed-pitcher${role ? ` live-entry role-${role}` : ''}`} ref={ref}>
      {/* Identity only, and deliberately NOT the toggle: the headshot and the
          name are links, and while they sat inside the expand target a thumb
          that missed either one navigated away instead of opening the outing.
          Every other feed item is already this shape — a static header over a
          tappable card — so the outing follows it. */}
      <div className="feed-item-head">
        <FeedHeadshot
          id={report.id}
          name={report.name}
          role={role}
          onOpen={() => onOpenDetails(playerKey(report))}
        />
        <div className="feed-item-id">
          <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
          <span className="feed-context">{matchup(game)}</span>
        </div>
        {role && <span className={`live-role role-${role}`}>{liveRoleLabel(role)}</span>}
      </div>
      {/* The card under that header: tags and the line, and the whole bar is the
          toggle — the batter's `PlateAppearanceCard` in the same slot. It holds
          no links, so every pixel of it expands the outing. */}
      <button
        type="button"
        className="feed-item-toggle"
        aria-expanded={open}
        title={open ? 'Collapse outing' : 'Expand outing'}
        onClick={onToggle}
      >
        <PitchingTag game={game} />
        {pg.decision && (
          <span className={`dec-tag dec-${pg.decision}`}>{creditLabel(pg.decision)}</span>
        )}
        {/* Collapsed, the line is what the item says. No caret — see the note on
            `.feed-item-toggle` in styles.css. */}
        <span className="feed-pitch-line">{lineSummary(pg.line)}</span>
        {/* Score and state, the same badge closing the pitcher card's header —
            and, while he's on the mound, the inning and the bases behind him.
            It carries the live inning the context line used to spell out. */}
        <GameStatusBadge game={game} />
      </button>
      {open && <InningsList game={game} pitcherId={report.id} newestFirst />}
    </div>
  );
}

/** Order not-yet-started games by first pitch (earliest first); unknown times last. */
function byStartTime(
  a: { game: PlayerGame },
  b: { game: PlayerGame },
): number {
  const ta = a.game.status.startTime;
  const tb = b.game.status.startTime;
  if (ta && tb) return ta.localeCompare(tb);
  if (ta) return -1;
  if (tb) return 1;
  return 0;
}

/**
 * Whether a scheduled game is one this player is actually part of — the test the
 * Upcoming section is filtered on, since a watched player's *team* has a game
 * far more often than he does.
 *
 * Two ways that happens. A player off the active roster — hurt, suspended,
 * optioned — is on none of his team's games, however many of them are on the
 * schedule. And a starting pitcher is in one game in five: he belongs here only
 * when his side has announced him, which `pitchingRole` already reports. A side
 * that has announced nobody yet (a TBD probable) hides no one, and a reliever is
 * never filtered — any of his team's games could be his.
 */
function isUpcomingFor(report: PlayerReport, game: PlayerGame): boolean {
  if (!isOnActiveRoster(report.rosterStatus)) return false;
  if (report.kind !== 'pitcher' || !isRotationStarter(report)) return true;
  return game.pitchingRole === 'starting' || game.teamProbablePitcher === null;
}

/**
 * One not-yet-started game in the Upcoming section: player + matchup + the
 * announced starter on the other side + first pitch, expanding to what that
 * player wants to know about it. For a **batter** that's his own line against
 * the starter's hand; for a **pitcher** it's the lineup waiting for him (the
 * same `OpponentSection` his card carries).
 *
 * The opposing starter reads on the closed bar rather than only inside the
 * detail: it's the one fact that decides whether a scheduled game is worth
 * opening, and the same thing the summary table's opponent cell shows pre-game
 * (surname only there and here — the bar wraps on a phone, and the matchup and
 * first pitch are what it must keep on one line). On a *pitcher's* row that's
 * his counterpart, not someone he faces, which is why the detail below still
 * belongs to the lineup instead.
 *
 * The identity row (headshot + name, both links) sits above the bar rather than
 * inside it, so a tap meant for the row can't land on a link. The bar is static
 * when there's nothing to reveal yet, and carries no caret on either side — the
 * bar itself is the affordance (see styles.css).
 */
function UpcomingRow({
  report,
  game,
  open,
  onToggle,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  game: PlayerGame;
  open: boolean;
  onToggle: () => void;
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  const time = formatStartTime(game.status.startTime);
  const isPitcher = report.kind === 'pitcher';
  const sp = game.probablePitcher;
  // A batter's detail is now the platoon split alone, so it opens on a starter
  // of a known hand rather than on any announced starter: without one there is
  // nothing under the bar to reveal, the name itself being on the bar.
  const expandable = isPitcher
    ? !!game.opponentHitting
    : sp?.hand === 'R' || sp?.hand === 'L';
  // On expand, bring the row to the top of the viewport (its scroll-margin-top
  // clears the sticky nav), matching how the at-bat cards behave.
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(expandable && open);
  // The bar under the name: matchup, the SP chip, the other side's announced
  // starter and first pitch. It is the whole of the row's interactive surface —
  // the headshot and name above it are links, and inside a tappable row a
  // near-miss on either navigated away instead of expanding (the same split the
  // pitcher outing takes).
  const bar = (
    <>
      <span className="feed-context">{matchup(game)}</span>
      {/* For a watched pitcher, whether he's the announced starter tonight. */}
      <PitchingTag game={game} />
      {sp && (
        <span
          className="game-prob-pitcher"
          title={`${isPitcher ? 'Opposing' : 'Probable'} starting pitcher: ${sp.name}`}
        >
          vs {handThrows(sp.hand)} {surname(sp.name)}
        </span>
      )}
      {/* No caret either side — the bar's own hover is the affordance. */}
      <span className="feed-time">{time ?? (game.status.detailedState || 'TBD')}</span>
    </>
  );

  return (
    <div className="upcoming-item" ref={ref}>
      <div className="upcoming-id">
        <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
        <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
      </div>
      {expandable ? (
        <button
          type="button"
          className="upcoming-head"
          aria-expanded={open}
          title={open ? 'Collapse' : isPitcher ? 'Expand opponent' : 'Expand platoon split'}
          onClick={onToggle}
        >
          {bar}
        </button>
      ) : (
        <div className="upcoming-head static">{bar}</div>
      )}
      {expandable && open && (
        <div className="upcoming-detail">
          {isPitcher ? (
            <OpponentSection game={game} throws={report.throws} />
          ) : (
            /* The batter's season line against the probable starter's hand — the
               starter himself is named on the bar above, so this is only the
               split (whose own head says which hand it's against). */
            <PlatoonSplit report={report} game={game} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The watchlist as a flat, most-recent-first stream — shown while games are
 * active. A "Live" section pins whoever is at bat, on deck, on base or on the
 * mound to the top; below it, everything that has happened reads newest-first,
 * with none of the per-player stats, season line or score chrome the grouped
 * player view carries. `reports` is one kind at a time (App's kind tabs sit
 * above this view), so a batter's at-bats and a pitcher's outings never mix:
 * for a batter an item is a single plate appearance or base-running event, for
 * a pitcher it's a whole outing grouped by inning.
 */
export function LiveFeed({
  reports,
  kind,
  onOpenDetails,
  onOpenPlayerDay,
  openKeys,
  onToggleKey,
}: {
  reports: PlayerReport[];
  // Which kind the tabs above are showing — the stream is one kind at a time,
  // and a pitcher's items are outings rather than plays.
  kind: PlayerKind;
  onOpenDetails: (key: string) => void;
  // Jump to a player's full day of at-bats on the players view.
  onOpenPlayerDay: (key: string) => void;
  // Which at-bats / upcoming rows are expanded, keyed by player + game + at-bat
  // number. Lifted to the parent so a "collapse all" control can clear them.
  openKeys: Set<string>;
  onToggleKey: (key: string) => void;
}) {
  const toggle = onToggleKey;
  // How much of the Recent section is on screen, grown a page at a time by the
  // "Load more" button. Deliberately not in the URL — it's a reading position,
  // not a view. It survives the 20s live poll (only the data changes, the
  // component stays mounted) and resets when the kind or the date range does,
  // since App keys this view on both.
  const [shown, setShown] = useState(PAGE_SIZE);

  // Players currently in a live at-bat/on-deck/on-base situation, highest-
  // priority role first (a player is listed once, for their leading role).
  const liveRows = reports
    .map((report) => {
      const lr = liveRoleGame(report);
      return lr ? { report, role: lr.role, game: lr.game } : null;
    })
    .filter((x): x is { report: PlayerReport; role: LiveRole; game: PlayerGame } => x !== null)
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

  // The games already pinned to the Live section, so the stream below doesn't
  // repeat them (a pitcher's outing is one item either way).
  const livePinned = new Set(liveRows.map((r) => `${r.report.id}-${r.game.gamePk}`));

  // Everything that has happened, interleaved newest-first: for a batter every
  // completed plate appearance plus every base-running event (stolen bases, runs
  // scored); for a pitcher his outing, as a single item. The in-progress at-bat
  // (no event yet) lives in the Live section above, not here.
  const recent = reports
    .flatMap((report) =>
      report.games.flatMap((game): FeedEntry[] =>
        report.kind === 'pitcher'
          ? game.pitching && !livePinned.has(`${report.id}-${game.gamePk}`)
            ? [{ type: 'pitching', report, game }]
            : []
          : [
              ...game.plateAppearances
                .filter((pa) => pa.event)
                .map((pa): FeedEntry => ({ type: 'pa', report, game, pa })),
              ...groupBaseEvents(game.baseEvents).map(
                (evs, i): FeedEntry => ({
                  type: 'base',
                  report,
                  game,
                  evs,
                  // The play's own id where it has one, so the item keeps its
                  // identity as the day's events arrive; the index only stands
                  // in for a play with neither a clip nor a timestamp.
                  key: `${report.id}-${game.gamePk}-${evs[0].playId ?? evs[0].timestamp ?? i}`,
                }),
              ),
            ],
      ),
    )
    .sort((a, b) => {
      const t = entryTime(b) - entryTime(a);
      if (t) return t;
      const gn = (b.game.gameNumber ?? 0) - (a.game.gameNumber ?? 0);
      if (gn) return gn;
      if (a.game.gamePk !== b.game.gamePk) return b.game.gamePk - a.game.gamePk;
      return playOrder(b) - playOrder(a);
    });

  // Not-yet-started games, earliest first pitch first — so the feed still has
  // something to show before the day's first at-bat (and lists later games while
  // earlier ones are underway). Only the ones the player is actually in: see
  // `isUpcomingFor`.
  const upcoming = reports
    .flatMap((report) =>
      report.games
        .filter((game) => game.status.state === 'scheduled' && isUpcomingFor(report, game))
        .map((game) => ({ report, game })),
    )
    .sort(byStartTime);

  const isEmpty = liveRows.length === 0 && recent.length === 0 && upcoming.length === 0;

  return (
    <div className="live-feed">
      {liveRows.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">
            <span className="feed-heading-dot" aria-hidden="true" />
            Live
          </h2>
          <div className="live-rows">
            {liveRows.map(({ report, role, game }) => {
              const key = `live-${report.id}`;
              // A pitcher on the mound reads as his outing so far, innings and
              // all — the same item the stream below would carry, pinned here.
              return report.kind === 'pitcher' && game.pitching ? (
                <FeedPitcherGame
                  key={report.id}
                  report={report}
                  game={game}
                  role={role}
                  open={openKeys.has(key)}
                  onToggle={() => toggle(key)}
                  onOpenDetails={onOpenDetails}
                  onOpenPlayerDay={onOpenPlayerDay}
                />
              ) : (
                <LiveEntry
                  key={report.id}
                  report={report}
                  role={role}
                  game={game}
                  open={openKeys.has(key)}
                  onToggle={() => toggle(key)}
                  onOpenDetails={onOpenDetails}
                  onOpenPlayerDay={onOpenPlayerDay}
                />
              );
            })}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">
            {kind === 'pitcher' ? 'Recent outings' : 'Recent plays'}
          </h2>
          <div className="feed-items">
            {recent.slice(0, shown).map((entry) => {
              if (entry.type === 'base') {
                const { report, game, evs, key } = entry;
                return (
                  <FeedBaseEvent
                    key={`base-${key}`}
                    report={report}
                    game={game}
                    evs={evs}
                    onOpenDetails={onOpenDetails}
                    onOpenPlayerDay={onOpenPlayerDay}
                  />
                );
              }
              if (entry.type === 'pitching') {
                const { report, game } = entry;
                const key = `pitching-${report.id}-${game.gamePk}`;
                return (
                  <FeedPitcherGame
                    key={key}
                    report={report}
                    game={game}
                    open={openKeys.has(key)}
                    onToggle={() => toggle(key)}
                    onOpenDetails={onOpenDetails}
                    onOpenPlayerDay={onOpenPlayerDay}
                  />
                );
              }
              const { report, game, pa } = entry;
              const key = `${report.id}-${game.gamePk}-${pa.atBatNumber}`;
              return (
                <FeedAtBat
                  key={key}
                  report={report}
                  game={game}
                  pa={pa}
                  open={openKeys.has(key)}
                  onToggle={() => toggle(key)}
                  onOpenDetails={onOpenDetails}
                  onOpenPlayerDay={onOpenPlayerDay}
                />
              );
            })}
          </div>
          {recent.length > shown && (
            <button
              type="button"
              className="feed-more"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
            >
              Load more
              <span className="feed-more-count">{recent.length - shown}</span>
            </button>
          )}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">Upcoming</h2>
          <div className="upcoming-rows">
            {upcoming.map(({ report, game }) => {
              const key = `up-${report.id}-${game.gamePk}`;
              return (
                <UpcomingRow
                  key={key}
                  report={report}
                  game={game}
                  open={openKeys.has(key)}
                  onToggle={() => toggle(key)}
                  onOpenDetails={onOpenDetails}
                  onOpenPlayerDay={onOpenPlayerDay}
                />
              );
            })}
          </div>
        </section>
      )}

      {isEmpty && <div className="feed-empty">No games for these players.</div>}
    </div>
  );
}
