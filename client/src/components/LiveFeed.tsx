import { useState } from 'react';
import type { LiveRole } from '../lib';
import { playerKey } from '../types';
import {
  baseEventLabel,
  baseEventTone,
  decisionColor,
  formatStartTime,
  handThrows,
  headshotUrl,
  isOnActiveRoster,
  isRotationStarter,
  liveRoleGame,
  liveRoleLabel,
  outcomeKind,
  scoreLine,
  surname,
} from '../lib';
import type {
  BaseEvent,
  PlateAppearance,
  PlayerGame,
  PlayerKind,
  PlayerReport,
} from '../types';
import { Modal } from './Modal';
import { BaseDiamond, PlaySituation } from './BaseDiamond';
import { InlineVideoClip, PlateAppearanceCard } from './PlateAppearanceCard';
import { BatterSplitsTab } from './PlatoonSplits';
import { OpponentSection, PitchingTag, outingBar } from './PitcherCard';
import { OutingPage } from './OutingPage';
import type { PlayFilterKey } from './FeedFilters';

/** How many stream items the Recent section shows at a time — a day of at-bats
 * across a roster runs to hundreds, and every one of them mounts a card. */
export const FEED_PAGE_SIZE = 20;

/** Module-level so the default never changes identity between renders. */
const EMPTY_FILTERS: Set<PlayFilterKey> = new Set();

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
export function matchup(game: PlayerGame): string {
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
export type FeedEntry =
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

/** Doubles, triples and home runs. `outcomeKind` cannot answer this — it files
 *  all three of the non-homer hits under one `hit`, which is the right grain for
 *  coloring a card's rail and one short of the grain a chip needs. */
const XBH_EVENTS = new Set(['double', 'triple', 'home_run']);

/**
 * Which of the filter chips a stream item answers to.
 *
 * A **set** rather than one kind, because the six overlap by construction: a
 * home run is a hit and an extra-base hit and — nearly always — a play with
 * film. That overlap is the whole reason the chips union rather than partition
 * (see `FeedFilters.tsx`), and it is why the test is "does this item answer any
 * of the chips that are on" rather than "is its kind among them".
 *
 * `video` is **`playId != null`** — the id MLB filed a clip under — rather than
 * a clip that has been *resolved*. Resolution is one request per play and the
 * feed does it lazily per item as each scrolls into view, so a filter that
 * waited for it would send hundreds of requests to draw one screen. The cost is
 * that a play whose clip does not come back is still selected, which is the same
 * thing the item itself already does — it draws the play and no frame.
 */
function playKinds(e: FeedEntry): Set<PlayFilterKey> {
  const out = new Set<PlayFilterKey>();
  if (e.type === 'pa') {
    const kind = outcomeKind(e.pa.event);
    if (kind === 'hr') out.add('hr');
    if (kind === 'hr' || kind === 'hit') out.add('hit');
    if (e.pa.event && XBH_EVENTS.has(e.pa.event)) out.add('xbh');
    if (e.pa.playId) out.add('video');
    return out;
  }
  if (e.type === 'base') {
    for (const ev of e.evs) {
      if (ev.kind === 'sb') out.add('sb');
      if (ev.kind === 'run') out.add('run');
      if (ev.playId) out.add('video');
    }
    return out;
  }
  return out;
}

/**
 * **Whether an item survives the filters** — the six union, `New` narrows.
 *
 * Two axes rather than one, which is `inc=`/`watch=1`'s own split on the
 * research board: the chips ask *what kind of play* and `New` asks *when*, so
 * `HR + New` reads as "the new home runs" and never as "the home runs and also
 * everything new". An empty chip set is the whole stream rather than none of it,
 * so the feed opens as it always did and `New` on its own still means something.
 */
function passesFilters(
  e: FeedEntry,
  keys: Set<PlayFilterKey>,
  newOnly: boolean,
  seenPlays: number,
): boolean {
  if (newOnly && entryTime(e) <= seenPlays) return false;
  if (keys.size === 0) return true;
  const kinds = playKinds(e);
  for (const k of kinds) if (keys.has(k)) return true;
  return false;
}

/**
 * A player's name in a feed row — a button that opens his player page, exactly
 * as the headshot beside it does.
 *
 * It used to jump to his card on the grouped reading of this feed, which was
 * the Games view before that. Both are gone: one player's day, read whole, is
 * the player page's **Overview** tab now, and it is the same day drawn from the
 * same items. So the name and the face lead to one place — the page that opens
 * on his day and carries his season beside it — rather than to two.
 *
 * stopPropagation so it doesn't also toggle a collapsible the name sits inside
 * (the live and upcoming row headers).
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
    <button
      type="button"
      className="feed-player-name feed-player-name-link"
      title={`${name} — player page`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(key);
      }}
    >
      {name}
    </button>
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
export function LiveEntry({
  report,
  role,
  game,
  onOpenDetails,
  grouped = false,
  multiGame = false,
}: {
  report: PlayerReport;
  role: LiveRole;
  game: PlayerGame;
  onOpenDetails: (key: string) => void;
  /** Inside a player group: the group's own header carries the headshot, the
   * name and the matchup, so the item drops its identity row and keeps only
   * what is its own — the score, the role, the inning. */
  grouped?: boolean;
  /** Whether that group spans more than one game. It usually doesn't, and then
   * the matchup on every item would be the group header's line repeated; when
   * it does, the matchup is the only thing saying which game a play belongs to
   * (the game blocks that used to say it went with the Games view). */
  multiGame?: boolean;
}) {
  const pa = roleAtBat(role, game);
  return (
    <div className={`feed-item live-entry role-${role}`}>
      <div className="feed-item-head">
        {!grouped && (
          <FeedHeadshot
            id={report.id}
            name={report.name}
            role={role}
            onOpen={() => onOpenDetails(playerKey(report))}
          />
        )}
        <div className="feed-item-id">
          {!grouped && (
            <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenDetails} />
          )}
          <span className="feed-context">
            {grouped && !multiGame ? liveInning(game) : `${matchup(game)} · ${liveInning(game)}`}
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
          name={report.name}
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
  onOpenDetails,
  grouped = false,
  multiGame = false,
}: {
  report: PlayerReport;
  game: PlayerGame;
  pa: PlateAppearance;
  onOpenDetails: (key: string) => void;
  /** Inside a player group: the group's own header carries the headshot, the
   * name and the matchup, so the item drops its identity row and keeps only
   * what is its own — the score, the role, the inning. */
  grouped?: boolean;
  /** Whether that group spans more than one game. It usually doesn't, and then
   * the matchup on every item would be the group header's line repeated; when
   * it does, the matchup is the only thing saying which game a play belongs to
   * (the game blocks that used to say it went with the Games view). */
  multiGame?: boolean;
}) {
  // The outcome's color rides on the *item*, not the card, so one rail runs
  // the header, the at-bat and the clip — who it was, what he did and the
  // video of it, which is one thing to read. The card keeps its box because it
  // opens, and in this feed that is what a box means; it gives up only its own
  // colored edge, which the rail outside it now carries (styles.css).
  //
  // Nothing scrolls on open any more: the card raises a dialog rather than
  // unrolling in place, so the item it sits in never moves.
  return (
    <div className={`feed-item feed-at-bat kind-${outcomeKind(pa.event)}`}>
      <div className="feed-item-head">
        {!grouped && (
          <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
        )}
        {(!grouped || multiGame) && (
          <div className="feed-item-id">
            {!grouped && (
              <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenDetails} />
            )}
            <span className="feed-context">{matchup(game)}</span>
          </div>
        )}
        <FeedScore game={game} away={pa.awayScore} home={pa.homeScore} />
      </div>
      <PlateAppearanceCard pa={pa} gamePk={game.gamePk} name={report.name} showVideo={false} />
      {pa.playId && <InlineVideoClip playId={pa.playId} gamePk={game.gamePk} />}
    </div>
  );
}

/**
 * The score a feed item left behind, at the right end of its identity row.
 *
 * Both kinds of item say it, and both say it **here** rather than each in its
 * own place: an at-bat's card is `PlateAppearanceCard`, shared with the players
 * view, where a running score under every row would be noise against the game
 * block's own header — and a base event's detail row is a badge row, which is
 * where the score used to sit alone. The header is the one row the two shapes
 * genuinely have in common, so that is where the fact lives.
 */
function FeedScore({
  game,
  away,
  home,
}: {
  game: PlayerGame;
  away: number | null;
  home: number | null;
}) {
  const score = scoreLine(game, away, home);
  return score ? <span className="feed-score">{score}</span> : null;
}

/**
 * Base events that happened on the same play, gathered into one item.
 *
 * A steal of home is **two** events — he took a base and he scored — and the
 * feed listed them separately: same description, same clip, one directly above
 * the other, as though two things had happened. It is one thing, and it now
 * reads as one item carrying both badges. So does the runner who goes to second
 * on a wild pitch and comes home on the next throw.
 *
 * `playId` is the id of the play event both were read off, so it is the key;
 * the timestamp stands in when a play has no clip id, since every event of one
 * play carries that play's `endTime` — which is exactly why `playOrder` had to
 * exist. An event with neither stays on its own rather than being lumped in
 * with every other keyless one.
 *
 * Within a group the run goes last, cause before effect: whatever put him in
 * motion is what he then scored on, and that is how the badges read.
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

/** Whatever moved him before the run it turned into: he took the base, and so
 *  he scored. */
function kindOrder(ev: BaseEvent): number {
  return ev.kind === 'run' ? 1 : 0;
}

/**
 * What the situation glyph can't say: for a steal or a pickoff the count he went
 * on and who was on the mound — the two facts that decide whether a bag was
 * there to be taken — and who was at the plate while he ran.
 *
 * Everything it carried about **where the runners were** is gone, because the
 * glyph beside it draws exactly that. The outs went first ("1 out" beside a
 * picture of one out), and "Scored from 3rd" follows them for the same reason:
 * the diamond on a run's own item is the state he scored out of, so the man on
 * third in the picture *is* him. That used to be a special case — a run off a
 * steal of home dropped the phrase because the badge beside it already said
 * where he was standing — and a special case is what it should never have been:
 * the badge is one drawing of the situation and the diamond is the other, and
 * every run has the second one. Each piece is dropped rather than dashed when
 * the feed didn't carry it.
 *
 * Only a **runner's** item reaches this now: a pitcher's events are read inside
 * his outing rather than as items of their own (see the stream below). The half
 * of the rule that named the runner instead of the man on the mound, on the
 * grounds that "off Luzardo" tells Luzardo nothing, is not lost with it — it is
 * what an inning row states when it names the runner and no pitcher at all.
 */
function baseEventMeta(ev: BaseEvent): string[] {
  const parts: string[] = [];
  const onThePitch = ev.kind === 'sb' || ev.kind === 'cs' || ev.kind === 'pocs';
  if (onThePitch && ev.balls !== null && ev.strikes !== null) {
    parts.push(`${ev.balls}-${ev.strikes} count`);
  }
  if (ev.kind !== 'run') {
    if (ev.pitcherName) parts.push(`off ${surname(ev.pitcherName)}`);
    if (ev.batterName) parts.push(`${surname(ev.batterName)} batting`);
  }
  return parts;
}

/**
 * The situation for a whole play, when more than one event came off it.
 *
 * The lists overlap by construction — every event of one play names the same
 * battery and the same batter — so it dedupes rather than concatenating.
 */
function playMeta(evs: BaseEvent[]): string[] {
  const parts: string[] = [];
  for (const ev of evs) {
    for (const part of baseEventMeta(ev)) {
      if (!parts.includes(part)) parts.push(part);
    }
  }
  return parts;
}

/**
 * One base-running event in the Recent section — a steal, a caught stealing, a
 * pickoff, a balk, a wild pitch, a passed ball, an indifference, or a run.
 *
 * It reads as a plate appearance does, because in this stream it is the same
 * kind of thing: the same player header with the same score at the end of it,
 * then **the same situation glyph** the at-bat card leads with (`PlaySituation`
 * — the half-inning, the runners and the outs), then what happened, then the
 * clip of it. It carries no pitch card — there is no sequence to show — so the
 * detail is MLB's own line for the event plus what the glyph can't draw, and
 * nothing toggles: the whole item is three short rows, where a caret would be
 * hiding one of them.
 *
 * Who it was, what happened and the clip of it are **one thing to read**, so the
 * kind's rail runs down the whole item rather than boxing the middle of it —
 * the way a live entry's role rail runs header and card together. A rail groups
 * them without any row posing as a control, which matters here because none of
 * it opens (see styles.css).
 */
function FeedBaseEvent({
  report,
  game,
  evs,
  onOpenDetails,
  grouped = false,
  multiGame = false,
}: {
  report: PlayerReport;
  game: PlayerGame;
  evs: BaseEvent[];
  onOpenDetails: (key: string) => void;
  /** Inside a player group: the group's own header carries the headshot, the
   * name and the matchup, so the item drops its identity row and keeps only
   * what is its own — the score, the role, the inning. */
  grouped?: boolean;
  /** Whether that group spans more than one game. It usually doesn't, and then
   * the matchup on every item would be the group header's line repeated; when
   * it does, the matchup is the only thing saying which game a play belongs to
   * (the game blocks that used to say it went with the Games view). */
  multiGame?: boolean;
}) {
  // Everything but the badges belongs to the play rather than to either event:
  // one inning, one situation, one description (both were read off the same
  // play event, so the line is the same string), one score, one clip.
  const lead = evs[0];
  const meta = playMeta(evs);
  const description = evs.find((ev) => ev.description)?.description ?? '';
  const playId = evs.find((ev) => ev.playId)?.playId ?? null;
  // One badge per *kind*. A runner's play is never two of the same, but a
  // pitcher's is: one wild pitch that moves two runners is two events on his
  // list, and two WILD PITCH chips side by side say it twice — the description
  // under them names both men, which is the part that differs.
  const badges = evs.filter((ev, i) => evs.findIndex((o) => o.kind === ev.kind) === i);
  // The rail says what the play was, and with two events off one play that is
  // two things: a steal of home is a steal *and* a run, so the rail splits in
  // half rather than picking one of them and stating half of what happened.
  // Tones rather than kinds — ten kinds would be ten colors and a hundred
  // pairs, where four tones are four and a handful (see `baseEventTone`). The
  // first two are enough: no play in the vocabulary puts three on one runner.
  const tones = evs.map((ev) => baseEventTone(ev.kind)).filter((t, i, all) => all.indexOf(t) === i);
  const rail = `rail-${tones[0]}${tones[1] ? ` rail2-${tones[1]}` : ''}`;
  return (
    <div className={`feed-item feed-base-item ${rail}`}>
      <div className="feed-item-head">
        {!grouped && (
          <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
        )}
        {(!grouped || multiGame) && (
          <div className="feed-item-id">
            {!grouped && (
              <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenDetails} />
            )}
            <span className="feed-context">{matchup(game)}</span>
          </div>
        )}
        <FeedScore game={game} away={lead.awayScore} home={lead.homeScore} />
      </div>
      <div className="feed-base">
        <div className="feed-base-row">
          <PlaySituation
            inning={lead.inning}
            half={lead.half}
            bases={lead.onBase}
            outs={lead.outs ?? 0}
          />
          {badges.map((ev) => (
            <span key={ev.kind} className={`feed-base-badge tone-${baseEventTone(ev.kind)}`}>
              {baseEventLabel(ev)}
            </span>
          ))}
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
 * batter faced. In the stream it is the usual feed header plus his line, and a
 * press **opens the outing as a full-screen page** (`OutingPage`) — his line,
 * his innings, the lineup he faced and his arsenal, one per tab. `role` is set
 * only while he's on the mound, and tints the header.
 *
 * **The press used to raise a dialog of innings with a `Full breakdown` button
 * raising a second one**, which is what that page replaced; see `OutingPage`,
 * where the argument for four readings behind a tab strip lives.
 *
 * **It was the largest accordion in the app**, which is why the swap matters
 * most here: a seven-inning start unrolled several screens of innings into the
 * middle of a stream, so the item had to scroll itself to the top on expand
 * (gone with it) and everything the reader had been reading was pushed out from
 * under them. In a dialog the stream holds still and the outing gets a scroller
 * of its own — and closing it puts the reader back exactly where they were,
 * which no amount of scroll-restoration around an accordion ever managed.
 *
 * The line bar under the header is the control — the header itself carries the
 * headshot and name links and is static, so a mistimed tap can't navigate off
 * the outing it meant to open. No caret: nothing on the pitcher side carries one
 * (see styles.css), and a control that raises a box is no different.
 */
function FeedPitcherGame({
  report,
  game,
  role,
  onOpenDetails,
  grouped = false,
  multiGame = false,
}: {
  report: PlayerReport;
  game: PlayerGame;
  role?: LiveRole | null;
  onOpenDetails: (key: string) => void;
  /** Inside a player group: the group's own header carries the headshot, the
   * name and the matchup, so the item drops its identity row and keeps only
   * what is its own — the score, the role, the inning. */
  grouped?: boolean;
  /** Whether that group spans more than one game. It usually doesn't, and then
   * the matchup on every item would be the group header's line repeated; when
   * it does, the matchup is the only thing saying which game a play belongs to
   * (the game blocks that used to say it went with the Games view). */
  multiGame?: boolean;
  /* There was a third prop here — `detailInline`, which drew the innings under
     a *static* bar with a `Full breakdown` button through to the page, for the
     one box that was already about this game: the Game Log's per-game popup.
     That popup is gone for a pitcher (a row opens the outing page directly, see
     `useGameOpen`), so the flag had no reader left and went with it, along with
     `.feed-item-toggle.static` and the button's own rule. The bar is always a
     press now, which is what it always was everywhere a reader could see it. */
}) {
  const pg = game.pitching!;
  // Whether the outing page is open over everything. The bar is the one route
  // in, everywhere this item is drawn.
  const [open, setOpen] = useState(false);
  // The rail. Every other item shape in this feed groups itself with one — the
  // outcome's color on an at-bat, the role's on a live entry, the event's on a
  // base event — and the outing was the one that didn't, so the pitcher feed
  // read as a list of loose blocks where the batter feed read as items.
  //
  // The color is **`decisionColor`**, which is the pitcher side's existing
  // answer to "what did this outing come to": the same green/red/accent/amber
  // the credit chip on the bar takes, the game line's own accent on the card,
  // and the log's W/L/S/HLD. A fifth definition here would be a fourth place
  // for those four colors to drift. `--muted` for a start still in progress or
  // a no-decision relief appearance — the item is grouped either way, and a
  // gray rail claims nothing about how it went, which is the truth at that
  // point. While he is **on the mound** the role rail wins outright: `.live-entry`
  // is what says a group is happening now, and a decision he hasn't got yet is
  // the lesser fact.
  const rail = role ? undefined : { borderLeftColor: decisionColor(pg.decision) };
  return (
    <div
      className={`feed-item feed-pitcher${role ? ` live-entry role-${role}` : ' feed-outing'}`}
      style={rail}
    >
      {/* Identity only, and deliberately NOT the toggle: the headshot and the
          name are links, and while they sat inside the expand target a thumb
          that missed either one navigated away instead of opening the outing.
          Every other feed item is already this shape — a static header over a
          tappable card — so the outing follows it. */}
      {/* Grouped, the whole of this row is the group header's job — except the
          role tag, which belongs to the outing rather than to the player. */}
      {(!grouped || multiGame || role) && (
        <div className="feed-item-head">
          {!grouped && (
            <FeedHeadshot
              id={report.id}
              name={report.name}
              role={role}
              onOpen={() => onOpenDetails(playerKey(report))}
            />
          )}
          {(!grouped || multiGame) && (
            <div className="feed-item-id">
              {!grouped && (
                <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenDetails} />
              )}
              <span className="feed-context">{matchup(game)}</span>
            </div>
          )}
          {role && <span className={`live-role role-${role}`}>{liveRoleLabel(role)}</span>}
        </div>
      )}
      {/* The card under that header: tags and the line, and the whole bar is the
          control — the batter's `PlateAppearanceCard` in the same slot. It holds
          no links, so every pixel of it opens the outing. */}
      <button
        type="button"
        className="feed-item-toggle"
        /* No `aria-haspopup` and no `aria-expanded`: what this opens is a
           page rather than a popup, and it is not an expansion of this
           element — the same reason the research board's row and the
           scoreboard's card, which each open a page, carry neither. */
        title="Open outing"
        onClick={() => setOpen(true)}
      >
        {outingBar(game, pg)}
      </button>
      {open && <OutingPage report={report} game={game} onClose={() => setOpen(false)} />}
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
 * when his side has *announced* him, which `pitchingRole` already reports. A
 * reliever is never filtered — any of his team's games could be his.
 *
 * A side that has announced nobody yet (a TBD probable) used to hide no one, on
 * the reasoning that an unannounced game might still be his. It is the wrong way
 * round: four starters in five are not pitching, so a TBD put the whole rotation
 * on the page and was right about one of them — Logan Webb sat in Upcoming every
 * morning San Francisco had yet to name anybody. An announcement is the only
 * thing that makes a start a fact, so it is what this waits for; the cost is
 * that a genuinely undeclared starter shows up when his club names him rather
 * than before, which is also the moment anyone could have known.
 */
function isUpcomingFor(report: PlayerReport, game: PlayerGame): boolean {
  if (!isOnActiveRoster(report.rosterStatus)) return false;
  if (report.kind !== 'pitcher' || !isRotationStarter(report)) return true;
  return game.pitchingRole === 'starting';
}

/**
 * One not-yet-started game in the Upcoming section: player + matchup + the
 * announced starter on the other side + first pitch, expanding to what that
 * player wants to know about it. For a **batter** that's the platoon card with
 * the announced starter's half marked; for a **pitcher** it's the lineup waiting
 * for him (the same `OpponentSection` his card carries).
 *
 * The opposing starter reads on the closed bar rather than only inside the
 * detail: it's the one fact that decides whether a scheduled game is worth
 * opening, and the same thing the summary table's opponent cell shows pre-game
 * (**surname only there and here** — the bar wraps on a phone, and the matchup
 * and first pitch are what it must keep on one line; his full name, his hand and
 * his headshot are inside the dialog, which has the width for them and is the
 * one place in this row a reader can go *to* him). On a *pitcher's* row that's
 * his counterpart, not someone he faces, which is why the detail below still
 * belongs to the lineup instead.
 *
 * **The batter's detail is the player page's own Splits card** — the
 * diverging-bar comparison, drawn from `report.splitVsLeft`/`splitVsRight`,
 * which are the very objects `/api/players/:id/splits` answers with (both come
 * out of `getPlayerStats`). So the dialog fetches nothing and there is one
 * definition of the number, which is the whole reason it is those fields rather
 * than a read of that route. It replaces `PlayerCard`'s `PlatoonSplit`, six stat
 * pills of his line against one hand — a line no reader could grade, an .800 OPS
 * against lefties being a platoon edge for one hitter and a shortfall for
 * another. See `docs/claude/client-feed.md`.
 *
 * The identity row (headshot + name, both links) sits above the bar rather than
 * inside it, so a tap meant for the row can't land on a link. The bar is static
 * when there's nothing to reveal yet, and carries no caret on either side — the
 * bar itself is the affordance (see styles.css).
 */
export function UpcomingRow({
  report,
  game,
  onOpenDetails,
  grouped = false,
}: {
  report: PlayerReport;
  game: PlayerGame;
  onOpenDetails: (key: string) => void;
  /** Inside a player group: the group's own header carries the headshot, the
   * name and the matchup, so the item drops its identity row and keeps only
   * what is its own — the score, the role, the inning. */
  grouped?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const time = formatStartTime(game.status.startTime);
  const isPitcher = report.kind === 'pitcher';
  const sp = game.probablePitcher;
  // A batter's detail is the platoon card with one half marked, so it opens on a
  // starter of a *known hand* rather than on any announced starter: without one
  // there is no half to mark, and the row's reason to open at all is the man who
  // has been named for it.
  const spHand = sp?.hand === 'L' ? 'L' : sp?.hand === 'R' ? 'R' : null;
  const expandable = isPitcher ? !!game.opponentHitting : spHand !== null;
  const spKey = sp ? playerKey({ id: sp.id, kind: 'pitcher' }) : null;
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

  // `feed-item` for the layout every item shape in this feed shares (column,
  // 8px gap, the scroll offset that clears the sticky chrome on expand), and
  // `upcoming-item` for the rail alone — the same 3px/11px edge the at-bat, the
  // base event, the live entry and the outing group themselves with, in the
  // muted tone a game that hasn't been played has earned. Without it the
  // identity row, the bar and the detail read as three loose blocks.
  return (
    <div className="feed-item upcoming-item">
      {/* Grouped, the identity row is the group header's — the bar below still
          carries the matchup, which for a scheduled game is the whole point of
          the row rather than a repetition of anything. */}
      {!grouped && (
        <div className="upcoming-id">
          <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
          <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenDetails} />
        </div>
      )}
      {expandable ? (
        <button
          type="button"
          className="upcoming-head"
          aria-haspopup="dialog"
          aria-expanded={open}
          title={isPitcher ? 'Open opponent' : 'Open platoon splits'}
          onClick={() => setOpen(true)}
        >
          {bar}
        </button>
      ) : (
        <div className="upcoming-head static">{bar}</div>
      )}
      {expandable && open && (
        <Modal
          title={`${report.name} — ${matchup(game)}`}
          titleId="upcoming-detail-title"
          className="play-detail-box"
          onClose={() => setOpen(false)}
        >
          <div className="upcoming-detail">
            {isPitcher ? (
              <OpponentSection
                hitting={game.opponentHitting}
                opponent={game.opponent}
                hand={game.stand ?? report.throws ?? null}
              />
            ) : (
              <>
                {/* Who he is facing, in full and with a way through to him. The
                    bar above says `vs LHP Gasser`, which is what fits a phone
                    line beside the matchup and first pitch; a dialog has the
                    width for the whole name, and the headshot is the row's only
                    route to the *pitcher's* page — a man nobody has rostered,
                    which `PlayerDetails` opens on as a matter of course. Drawn
                    with the feed's own `FeedHeadshot`/`FeedPlayerName` rather
                    than a third headshot circle, so it is the same target with
                    the same click behavior as every other name in this stream.
                    It carries **no lineup pip or status code**: those are
                    `PhotoStatus`'s marks and read off `/api/statuses`, which the
                    feed does not fetch — and both would only restate the bar
                    (his pip is `SP`, and a man on the IL is not the announced
                    starter). */}
                <div className="upcoming-sp">
                  <FeedHeadshot
                    id={sp!.id}
                    name={sp!.name}
                    onOpen={() => onOpenDetails(spKey!)}
                  />
                  <div className="feed-item-id">
                    <FeedPlayerName playerKey={spKey!} name={sp!.name} onOpen={onOpenDetails} />
                    <span className="feed-context">
                      {handThrows(sp!.hand)} · starting for {game.opponent}
                    </span>
                  </div>
                </div>
                {/* The whole platoon comparison with tonight's half marked,
                    rather than that half alone — see the note on this component
                    and `BatterSplitsTab`. */}
                <BatterSplitsTab
                  vsLeft={report.splitVsLeft}
                  vsRight={report.splitVsRight}
                  highlight={spHand === 'L' ? 'left' : 'right'}
                  highlightTitle={`${sp!.name} throws ${spHand === 'L' ? 'left' : 'right'}-handed, so this is the half that applies to this game.`}
                />
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}



/**
 * A stream item's React key. It used to be two things — the key an item's *open
 * state* was held under as well — and the second job went with the accordions:
 * every shape that opens now raises a dialog and holds its own flag, so nothing
 * outside an item needs to name it. It takes the `base-` prefix because a
 * play's own id is not unique against an at-bat's `player-game-atbat`.
 */
export function entryKey(e: FeedEntry): string {
  if (e.type === 'base') return `base-${e.key}`;
  if (e.type === 'pitching') return `pitching-${e.report.id}-${e.game.gamePk}`;
  return `${e.report.id}-${e.game.gamePk}-${e.pa.atBatNumber}`;
}

/**
 * One item of the recent stream, whichever of the three shapes it is. Extracted
 * so the flat feed and a player group draw an at-bat the same way by
 * construction rather than by two call sites agreeing to — which is the trap
 * the `grouped` prop would otherwise set, one of them forgetting to pass it.
 */
export function FeedItem({
  entry,
  onOpenDetails,
  grouped = false,
  multiGame = false,
}: {
  entry: FeedEntry;
  onOpenDetails: (key: string) => void;
  grouped?: boolean;
  multiGame?: boolean;
}) {
  if (entry.type === 'base') {
    return (
      <FeedBaseEvent
        report={entry.report}
        game={entry.game}
        evs={entry.evs}
        onOpenDetails={onOpenDetails}
        grouped={grouped}
        multiGame={multiGame}
      />
    );
  }
  if (entry.type === 'pitching') {
    return (
      <FeedPitcherGame
        report={entry.report}
        game={entry.game}
        onOpenDetails={onOpenDetails}
        grouped={grouped}
        multiGame={multiGame}
      />
    );
  }
  return (
    <FeedAtBat
      report={entry.report}
      game={entry.game}
      pa={entry.pa}
      onOpenDetails={onOpenDetails}
      grouped={grouped}
      multiGame={multiGame}
    />
  );
}

/**
 * Everything that happened to **one** player over the days in his report,
 * ready to be drawn as feed items.
 *
 * The flat stream below is this fanned across a roster and re-sorted by clock;
 * the player page's **Overview** tab is this for one man, drawn in game order.
 * It is one function rather than two because the two readings must not be able
 * to disagree about what happened — the trap the grouped feed avoided the same
 * way before it moved onto the player page.
 */
export interface PlayerDayEntries {
  /** His live role and the game it is in, if he is at bat, on deck, on base or
   *  on the mound right now. */
  live: { role: LiveRole; game: PlayerGame } | null;
  /** Completed plays, newest first. A batter's plate appearances and his own
   *  base-running interleaved; a pitcher's whole outing as one item per game. */
  entries: FeedEntry[];
  /** Games of his that haven't started, in schedule order — see `isUpcomingFor`
   *  for why this is not simply "his club's games". */
  upcoming: { report: PlayerReport; game: PlayerGame }[];
}

/**
 * A batter's own base-running, one item per play.
 *
 * **A pitcher's are not items of their own**, and a batter's are. The
 * difference is what each stream's item *is*: a batter's is one play, so the
 * bag he took is a play like the at-bat above it, while a pitcher's is the
 * whole outing — his balk belongs inside it, in the inning he threw it, which
 * is where `InningsList` puts it. Drawn as a stream item too it was the same
 * event twice on one page: once in the fourth inning of the outing and again a
 * few hundred pixels below it, timed by its own clock and so detached from the
 * outing by whatever else happened in between.
 */
function baseEntries(report: PlayerReport, game: PlayerGame): FeedEntry[] {
  return groupBaseEvents(game.baseEvents).map((evs, i): FeedEntry => ({
    type: 'base',
    report,
    game,
    evs,
    // The play's own id where it has one, so the item keeps its identity as the
    // day's events arrive; the index only stands in for a play with neither a
    // clip nor a timestamp.
    key: `${report.id}-${game.gamePk}-${evs[0].playId ?? evs[0].timestamp ?? i}`,
  }));
}

/**
 * **How many completed plays are newer than a marker, and the timestamp of the
 * newest one** — the two numbers the red `N new plays` button is made of.
 *
 * Exported because the two halves of that button live in two places and both
 * have to be right. **App** owns the marker (it persists it, and merges the
 * saved one on arrival) and owns the `New` filter, so it is App that needs the
 * timestamp to mark the stream read with; the **stream's vocabulary** — what
 * counts as a play, and which clock orders them — lives here. One function
 * rather than App reproducing `entryTime`, which is the same rule that keeps
 * `playerDayEntries` one function for the stream and the player page: two
 * readings of what happened must not be able to disagree.
 *
 * `newest` is the head of the **whole** stream rather than of the new part of
 * it, because marking read has to cover what the reader can already see as well
 * as what the button is about.
 */
export function newPlays(
  reports: PlayerReport[],
  seenPlays: number,
): { count: number; newest: number } {
  let count = 0;
  let newest = 0;
  for (const report of reports) {
    for (const e of playerDayEntries(report).entries) {
      const t = entryTime(e);
      if (t > newest) newest = t;
      if (t > seenPlays) count += 1;
    }
  }
  return { count, newest };
}

/** Newest first, with a play's own events kept in cause-then-effect order. */
function byRecency(a: FeedEntry, b: FeedEntry): number {
  const t = entryTime(b) - entryTime(a);
  if (t) return t;
  const gn = (b.game.gameNumber ?? 0) - (a.game.gameNumber ?? 0);
  if (gn) return gn;
  if (a.game.gamePk !== b.game.gamePk) return b.game.gamePk - a.game.gamePk;
  return playOrder(b) - playOrder(a);
}

/**
 * The same order read forwards — first play of the game first.
 *
 * The **stream** is newest-first because it is a stream: what just happened is
 * what you opened it for, and a roster's day runs to hundreds of items you page
 * *down* into the past. A **game** is not a stream. Opened from a card on the
 * player page or a row of the Game Log, it is one afternoon read start to
 * finish, so the first inning leads and the last at-bat closes it — the order a
 * box score, a play-by-play and the innings inside a pitcher's outing all use,
 * and now the one every "this game" surface in the app uses.
 *
 * It is `byRecency` negated rather than a second comparator written out, so the
 * two can never disagree about ties — which matters most exactly where the
 * timestamps are equal, a play's own grouped events being the case that has
 * needed the tiebreak from the beginning.
 */
export function byPlayOrder(a: FeedEntry, b: FeedEntry): number {
  return -byRecency(a, b);
}

export function playerDayEntries(report: PlayerReport): PlayerDayEntries {
  const lr = liveRoleGame(report);
  const live = lr ? { role: lr.role, game: lr.game } : null;
  // The game pinned to the Live section, so the stream below doesn't repeat it
  // (a pitcher's outing is one item either way). Only a pitcher can collide:
  // his live item *is* his outing, where a batter's is the in-progress at-bat,
  // which is never one of the completed plays below.
  const pinned = live && report.kind === 'pitcher' ? live.game.gamePk : null;
  const entries = report.games
    .flatMap((game): FeedEntry[] =>
      report.kind === 'pitcher'
        ? game.pitching && game.gamePk !== pinned
          ? [{ type: 'pitching' as const, report, game }]
          : []
        : [
            ...game.plateAppearances
              .filter((pa) => pa.event)
              .map((pa): FeedEntry => ({ type: 'pa', report, game, pa })),
            ...baseEntries(report, game),
          ],
    )
    .sort(byRecency);
  const upcoming = report.games
    .filter((game) => game.status.state === 'scheduled' && isUpcomingFor(report, game))
    .map((game) => ({ report, game }));
  return { live, entries, upcoming };
}

/**
 * The roster as a flat, most-recent-first stream. A "Live" section pins whoever
 * is at bat, on deck, on base or on the mound to the top; below it, everything
 * that has happened reads newest-first. `reports` is one kind at a time (App's
 * kind tabs sit above this view), so a batter's at-bats and a pitcher's outings
 * never mix: for a batter an item is a single plate appearance or base-running
 * event, for a pitcher it's a whole outing grouped by inning.
 *
 * **There used to be a second reading of this page** — the same days grouped
 * one card per player, which was the Games view before that. It has moved to
 * the player page's **Overview** tab, where it belongs: a card per player is a
 * page *about a player*, and the app already had one that opened on anybody,
 * carried his season beside his day, and was reachable from every row in every
 * view. What that took away from this file is the grouping, its toggle and the
 * `expanded=` cards; what it left is `playerDayEntries` above, which the tab
 * calls for its one man.
 */
export function LiveFeed({
  reports,
  kind,
  onOpenDetails,
  shown: shownFromParent,
  onShowMore,
  playFilters = EMPTY_FILTERS,
  newOnly = false,
  seenPlays = 0,
  newCount = 0,
  onShowNew,
}: {
  reports: PlayerReport[];
  // Which kind the tabs above are showing — the stream is one kind at a time,
  // and a pitcher's items are outings rather than plays.
  kind: PlayerKind;
  /** Open a player's page — what the headshot and the name both do now. */
  onOpenDetails: (key: string) => void;
  /** How much of the Recent section to open on, and where to report a "Load
   * more" back to. App holds the number for the same reason it holds the
   * scroll offset, and keyed the same way — see its `feedShown`. */
  shown: number;
  onShowMore: (shown: number) => void;
  /**
   * Which kinds of play the stream is narrowed to — empty is all of them. See
   * `FeedFilters.tsx` for why they union and why `New` is not among them.
   *
   * **All five of these are optional, and the second caller passes none of
   * them.** A matchup team page draws this same component for a leaguemate's
   * week (`LeagueTeam.tsx`), and neither half of the feature belongs to it: the
   * marker is a fact about how far down *the reader's own* stream they have got,
   * and that page's own control row already carries four groups. Absent, the
   * component is exactly the stream it was — no filter, no button, no marker.
   */
  playFilters?: Set<PlayFilterKey>;
  /** The `New` filter — a different axis, so it narrows rather than adding. */
  newOnly?: boolean;
  /** How far down the stream this reader has marked read (epoch ms) — what
   *  `New` narrows to. */
  seenPlays?: number;
  /** How many plays are newer than that marker. **App's own count, off
   *  `newPlays`**, because App owns the marker and the filter and would
   *  otherwise have to be told a number this component derived. It is counted
   *  over the *unfiltered* stream on purpose: it is news about the day rather
   *  than about the lens, and a count that shrank when the reader ticked `HR`
   *  would be saying the other plays had stopped being new. */
  newCount?: number;
  /** Press the red button: show the new plays. App turns the `New` filter on. */
  onShowNew?: () => void;
}) {
  // How much of the Recent section is on screen, grown a page at a time by the
  // "Load more" button. Deliberately not in the URL — it's a reading position,
  // not a view. It survives the 20s live poll (only the data changes, the
  // component stays mounted) and resets when the kind or the date range does,
  // since App keys this view on both.
  //
  // Seeded from App and reported back to it, because a *view* switch unmounts
  // this component and a count that died with it took the scroll memory's
  // answer down with it: read sixty items, cross to Research and come back,
  // and the offset the reader left is not an offset a twenty-item page has.
  const [shown, setShown] = useState(shownFromParent);
  const showMore = () => {
    const next = shown + FEED_PAGE_SIZE;
    setShown(next);
    onShowMore(next);
  };

  // One player's day at a time (`playerDayEntries`), then merged by clock — so
  // the stream and the player page's Overview tab, which calls that same helper
  // for its one man, cannot come to disagree about what happened.
  const perPlayer = reports.map((report) => ({ report, ...playerDayEntries(report) }));

  // Players currently in a live at-bat/on-deck/on-base situation, highest-
  // priority role first (a player is listed once, for their leading role).
  const liveRows = perPlayer
    .filter((p) => p.live !== null)
    .map((p) => ({ report: p.report, role: p.live!.role, game: p.live!.game }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

  // Everything that has happened, interleaved newest-first: for a batter every
  // completed plate appearance and every base-running event of his own, and for
  // a pitcher his whole outing as a single item. The in-progress at-bat (no
  // event yet) lives in the Live section above, and a pitcher pinned there has
  // already been kept out of this list by `playerDayEntries`.
  const allRecent = perPlayer.flatMap((p) => p.entries).sort(byRecency);
  const recent = allRecent.filter((e) => passesFilters(e, playFilters, newOnly, seenPlays));

  /**
   * **The red button, and why it is not drawn while `New` is on.** It is the
   * doorway to those plays, so with the reader already looking at them it would
   * be a control offering what is on screen — and pressing it would mark them
   * read, which is what empties a `New` view. So while the filter is on the
   * marker is frozen and the button is absent, and turning the filter off is
   * what says "done with those": see App's `setFeedNewOnly`.
   */
  const showNewButton = !newOnly && newCount > 0;

  // Not-yet-started games, earliest first pitch first — so the feed still has
  // something to show before the day's first at-bat (and lists later games while
  // earlier ones are underway). Only the ones the player is actually in: see
  // `isUpcomingFor`.
  const upcoming = perPlayer.flatMap((p) => p.upcoming).sort(byStartTime);

  /**
   * **Emptied by a filter is not the same as empty**, which is the distinction
   * `filtered` carries. `No games for these players.` is a statement about the
   * day and would be a lie over a stream the reader has narrowed to home runs on
   * an afternoon of singles — so the Recent section keeps its own heading and
   * says which control did it, and the day-level message is held back.
   */
  const filtered = allRecent.length > 0 && recent.length === 0;
  const isEmpty =
    liveRows.length === 0 && allRecent.length === 0 && upcoming.length === 0;

  return (
    <div className="live-feed">
      {liveRows.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">
            <span className="feed-heading-dot" aria-hidden="true" />
            Live
          </h2>
          <div className="live-rows">
            {liveRows.map(({ report, role, game }) =>
              // A pitcher on the mound reads as his outing so far, innings and
              // all — the same item the stream below would carry, pinned here.
              report.kind === 'pitcher' && game.pitching ? (
                <FeedPitcherGame
                  key={report.id}
                  report={report}
                  game={game}
                  role={role}
                  onOpenDetails={onOpenDetails}
                />
              ) : (
                <LiveEntry
                  key={report.id}
                  report={report}
                  role={role}
                  game={game}
                  onOpenDetails={onOpenDetails}
                />
              ),
            )}
          </div>
        </section>
      )}

      {(recent.length > 0 || filtered) && (
        <section className="feed-section">
          <h2 className="feed-heading">
            {kind === 'pitcher' ? 'Recent outings' : 'Recent plays'}
          </h2>
          {/* News about the day, at the head of the list the news landed in —
              which is where it can also *do* something. The League page's
              Transactions dot is the same statement made on a tab, and it can
              only be a mark: it says a feed has moved on a page the reader is
              not looking at. Here they are looking at it, so the mark carries
              its own count and is the way to the plays it counts. */}
          {showNewButton && onShowNew && (
            <button
              type="button"
              className="feed-new"
              onClick={onShowNew}
              title={`${newCount} ${newCount === 1 ? 'play' : 'plays'} since you last marked the feed read — show them`}
            >
              <span className="feed-new-dot" aria-hidden="true" />
              {newCount} new {newCount === 1 ? 'play' : 'plays'}
            </button>
          )}
          {recent.length > 0 ? (
            <>
              <div className="feed-items">
                {recent.slice(0, shown).map((entry) => (
                  <FeedItem key={entryKey(entry)} entry={entry} onOpenDetails={onOpenDetails} />
                ))}
              </div>
              {recent.length > shown && (
                <button type="button" className="feed-more" onClick={showMore}>
                  Load more
                  <span className="feed-more-count">{recent.length - shown}</span>
                </button>
              )}
            </>
          ) : (
            /* Emptied by the reader's own controls, so it names them — the
               app's standing rule for a view a filter has cleared, and the one
               state this section could not previously be in. */
            <div className="feed-empty">
              {newOnly && playFilters.size > 0
                ? 'No new plays of those kinds.'
                : newOnly
                  ? 'Nothing new since you last marked the feed read.'
                  : 'No plays of those kinds today.'}{' '}
              <span className="feed-empty-how">
                Change it with <b>Plays</b> in the row above.
              </span>
            </div>
          )}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">Upcoming</h2>
          <div className="upcoming-rows">
            {upcoming.map(({ report, game }) => (
              <UpcomingRow
                key={`up-${report.id}-${game.gamePk}`}
                report={report}
                game={game}
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        </section>
      )}

      {isEmpty && <div className="feed-empty">No games for these players.</div>}
    </div>
  );
}
