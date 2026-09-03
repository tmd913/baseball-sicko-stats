import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LiveRole } from '../lib';
import { playerKey } from '../types';
import { api } from '../api';
import {
  baseballDay,
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
  PlayerReport,
} from '../types';
import {
  answersEscape,
  useDelayedFlag,
  useLockBodyScroll,
  useOverlayChromeOffset,
  useHandedness,
  useOverlayFocus,
} from '../hooks';
import { BackButton } from './BackButton';
import { LoadingLine } from './Loading';
import { DialogLayerContext, Modal } from './Modal';
import { BaseDiamond, PlaySituation } from './BaseDiamond';
import { InlineVideoClip, PlateAppearanceCard } from './PlateAppearanceCard';
import { GamePark, hitterHand } from './ParkFactors';
import { BatterSplitsTab } from './PlatoonSplits';
import { ProjectedGameLine } from './Projection';
import { OpponentSection, PitchingTag, outingBar } from './PitcherCard';
import { OutingPage } from './OutingPage';
import type { PlayFilterKey } from './FeedFilters';
import { EmptyState } from './EmptyState';

/**
 * How many stream items the Recent section shows at a time — a day of at-bats
 * across a roster runs to hundreds, and every one of them mounts a card.
 *
 * **Ten, and it was twenty.** Twenty was a page of *scrolling*: on a full slate
 * the stream opened on more than a phone screen of cards and the reader's first
 * gesture was always down. Ten is a page a reader can see the end of, which is
 * what makes `Load more` a choice rather than the only thing left to do — and
 * `Load more` carries the remainder as a count for exactly that reason, so a
 * cut list can never read as *that is all there is*.
 *
 * The number is a floor rather than a ceiling: App and `LeagueTeam` seed the
 * component with whatever the reader had grown it to (`feedShown`), so a page
 * they had already opened to sixty comes back at sixty.
 */
export const FEED_PAGE_SIZE = 10;

/** Priority order for the Live section: at bat, then on deck, then on base. */
const ROLE_ORDER: Record<LiveRole, number> = {
  'at-bat': 0,
  'on-deck': 1,
  'on-base': 2,
  pitching: 3,
};

/** Where a player with **no** live role sorts in that section — below all four,
 *  which is where a man the live play has just put out or sent home belongs. */
const NO_ROLE = 4;

/** The Live section's sort key for one player's block. */
const liveOrder = (live: { role: LiveRole } | null): number =>
  live ? ROLE_ORDER[live.role] : NO_ROLE;

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

/**
 * Which of the filter pills a stream item answers to.
 *
 * A **set** rather than one kind, and that stays true now that the row is
 * single-select: the six overlap by construction — a home run is a hit, an RBI
 * and, nearly always, a play with film — so an item belongs to several of them
 * at once and the test is "is the lit pill among the ones this item answers to".
 * What single-select decides is how many of these sets a *reader* can ask for,
 * not how many an item is in.
 *
 * **`video` is not one of these** and is answered by `hasFilm` below instead.
 * It used to be `playId != null` here, on the reasoning that resolving a clip is
 * one request per play and a filter that waited for it would send hundreds to
 * draw one screen. That reasoning is sound and the proxy it bought is not: MLB
 * files a play id for very nearly every play, so the pill selected almost the
 * whole stream — measured on 2026-08-18, **42 of 43 items**, of which **13**
 * actually had film.
 */
function playKinds(e: FeedEntry): Set<PlayFilterKey> {
  const out = new Set<PlayFilterKey>();
  if (e.type === 'pa') {
    const kind = outcomeKind(e.pa.event);
    if (kind === 'hr') out.add('hr');
    if (kind === 'hr' || kind === 'hit') out.add('hit');
    // The other half of `run`: that one is him crossing the plate and this is
    // him sending somebody else over it. Read off the plate appearance's own
    // `rbi` rather than off the event, because a run bats in on plays that are
    // not hits at all — a sacrifice fly, a groundout, a bases-loaded walk — and
    // an event list would have to enumerate them and would miss the next one.
    if (e.pa.rbi > 0) out.add('rbi');
    return out;
  }
  if (e.type === 'base') {
    for (const ev of e.evs) {
      if (ev.kind === 'sb') out.add('sb');
      if (ev.kind === 'run') out.add('run');
    }
    return out;
  }
  return out;
}

/**
 * The Statcast play ids an item could have film of — one for a plate
 * appearance, and one per event in a grouped base-running item.
 */
function clipIdsOf(e: FeedEntry): string[] {
  if (e.type === 'pa') return e.pa.playId ? [e.pa.playId] : [];
  if (e.type === 'base') return e.evs.map((ev) => ev.playId).filter((id): id is string => !!id);
  return [];
}

/**
 * **Whether an item survives the lens** — one kind of play, or the plays newer
 * than the marker, or the whole stream.
 *
 * The row above is single-select, so at most one of the two tests can be in
 * force at a time (see `FeedFilters.tsx`); they are still two parameters here
 * because App holds them as two — `New` is in the URL under its own name and
 * turning it off is what marks the stream read. A null key is the whole stream
 * rather than none of it, so the feed opens as it always did.
 */
function passesFilters(
  e: FeedEntry,
  key: PlayFilterKey | null,
  newOnly: boolean,
  seenPlays: number,
  hasFilm: (e: FeedEntry) => boolean,
): boolean {
  if (newOnly && entryTime(e) <= seenPlays) return false;
  if (!key) return true;
  if (key === 'video') return hasFilm(e);
  return playKinds(e).has(key);
}

/**
 * **Which plays have film, cheaply enough to filter a whole day's stream on.**
 *
 * Two sources publish clips and they fail on opposite axes (see
 * `mlbStats.ts::resolveVideoUrl`): **Savant** covers essentially every play and
 * is a day behind, and **MLB's own reel** lands during the game and is curated.
 * So the answer splits on the game's date and neither half costs a request per
 * play:
 *
 * - **A game before today has film for every play.** Measured over three settled
 *   days (2026-08-15/16/17), **90 of 90** sampled plays resolved — so the test is
 *   a date comparison and nothing else.
 * - **A game from today has film for whatever is in its reel**, which is **one
 *   request per game** (`api.gameClips`) against the very cache `/api/video`
 *   already fills. Measured on 2026-08-18: 13 of 42 plays, across 8 games.
 *
 * Resolving per play instead is what this exists to avoid: **~350ms a play** on
 * a settled day (40 plays took 14.1s), which over a range is minutes of upstream
 * to draw one screen.
 *
 * **A today-game whose reel has not landed reads as *no film yet***, so the lens
 * fills in rather than showing plays it cannot vouch for; `pendingFilm` below is
 * what puts a line on screen while that is true. And a reel that could not be
 * read at all leaves its game showing nothing under this lens, which is the
 * direction every join in this app fails in.
 */
function filmTest(today: string, reels: Map<number, Set<string>>) {
  return (e: FeedEntry): boolean => {
    const ids = clipIdsOf(e);
    if (ids.length === 0) return false;
    if (e.game.date < today) return true;
    const reel = reels.get(e.game.gamePk);
    return reel ? ids.some((id) => reel.has(id)) : false;
  };
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
          batterId={report.id}
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
  sameGame = false,
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
  /**
   * **Every item on the page is from the same game and the page has said so** —
   * a game's own Plays tab, whose head carries the matchup and the score above
   * every tab. The item keeps its identity row (whose play this was is the one
   * thing that page cannot say for it) and drops the matchup, which would
   * otherwise be the same seven characters on all sixty-four rows: *a mark that
   * would be on every row marks nothing*.
   *
   * It is a third flag rather than a reading of `grouped` because the three
   * name three different things: `grouped` is *the header above me says who*,
   * `multiGame` is *and it cannot say which game*, and this is *the page says
   * which game*. Two of them being false is what the roster's flat stream is.
   */
  sameGame?: boolean;
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
            {!sameGame && <span className="feed-context">{matchup(game)}</span>}
          </div>
        )}
        <FeedScore game={game} away={pa.awayScore} home={pa.homeScore} />
      </div>
      <PlateAppearanceCard
        pa={pa}
        gamePk={game.gamePk}
        name={report.name}
        batterId={report.id}
        showVideo={false}
      />
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
  sameGame = false,
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
  /**
   * **Every item on the page is from the same game and the page has said so** —
   * a game's own Plays tab, whose head carries the matchup and the score above
   * every tab. The item keeps its identity row (whose play this was is the one
   * thing that page cannot say for it) and drops the matchup, which would
   * otherwise be the same seven characters on all sixty-four rows: *a mark that
   * would be on every row marks nothing*.
   *
   * It is a third flag rather than a reading of `grouped` because the three
   * name three different things: `grouped` is *the header above me says who*,
   * `multiGame` is *and it cannot say which game*, and this is *the page says
   * which game*. Two of them being false is what the roster's flat stream is.
   */
  sameGame?: boolean;
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
            {!sameGame && <span className="feed-context">{matchup(game)}</span>}
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
/**
 * **His game has not been played yet** — which is not the same question as
 * `state === 'scheduled'`, and the difference is a half-hour hole this section
 * used to fall through.
 *
 * MLB flips `abstractGameState` to `Live` at **Warmup**, about thirty minutes
 * before anybody throws anything, and `schedule.ts::stateOf` follows it —
 * deliberately, because `state` is what the client's poll cadence reads and
 * going quiet in the half-hour before first pitch would be quiet through the
 * one read that matters. `mlbStats.ts::hasStarted` carries the whole of that
 * measurement, including MLB's own `/api/v1/gameStatus` reference: **`PW`/Warmup
 * is the only row pairing `abstractGameState: Live` with a game nobody has
 * started**, and every other pre-game row (`Pre-Game`, the fifteen
 * `Delayed Start:` flavors) is a `Preview` that `stateOf` already files as
 * `scheduled`.
 *
 * So this section tested `scheduled` and dropped every rostered player the
 * moment his club began warming up — while the stream below had nothing to show
 * for him either, no plate appearance having happened. He vanished from the
 * Feed entirely and came back at first pitch. Reported exactly that way, on a
 * batter added that morning: *he's there now that the game started*.
 *
 * **Warmup by name rather than a `started` flag off the wire**, which was the
 * alternative: `codedGameState` is not in either `types.ts` and putting it there
 * is a paired-type change plus a day-snapshot version to bump, for a test the
 * measurement above already makes exact from the client's side. If MLB ever
 * pairs `Live` with a second not-started status, the flag becomes worth the
 * bump — and `hasStarted` is where that rule already lives.
 */
function notStartedYet(game: PlayerGame): boolean {
  if (game.status.state === 'scheduled') return true;
  return game.status.state === 'live' && game.status.detailedState === 'Warmup';
}

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
  // **The row no longer needs an announced starter to be worth opening.** It
  // used to: a batter's detail was the platoon card with one half marked, so
  // with nobody named there was no half to mark and nothing the dialog could
  // say. Two things are now true that were not. The **park** is a fact about the
  // fixture rather than about either club's plans, so it is knowable the moment
  // the game is scheduled and is the same reading whoever ends up on the mound.
  // And the platoon comparison **reads perfectly well unmarked** — that is
  // exactly what the player page's own Splits tab draws, and `BatterSplitsTab`
  // has always taken a null `highlight` for it.
  //
  // So the test is *has this row anything to show*: his split, or the park. What
  // an unnamed starter costs is the mark, and the dialog says so where the
  // reader is rather than by refusing to open.
  /** Whether he has a platoon comparison to draw at all — what the row's press
   *  title distinguishes. The press itself is `canPreview`'s to decide. */
  const hasSplits = (report.splitVsLeft?.pa ?? 0) > 0 || (report.splitVsRight?.pa ?? 0) > 0;
  const expandable = canPreview(report, game);
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
          title={
            isPitcher
              ? game.opponentHitting
                ? 'Open opponent'
                : 'Open the ballpark'
              : hasSplits
                ? 'Open platoon splits'
                : 'Open the ballpark'
          }
          onClick={() => setOpen(true)}
        >
          {bar}
        </button>
      ) : (
        <div className="upcoming-head static">{bar}</div>
      )}
      {expandable && open && (
        <UpcomingPreview report={report} game={game} onOpenDetails={onOpenDetails} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}



/**
 * **The man on the mound, at the head of a game preview.**
 *
 * The feed's own headshot and name rather than a third circle of their own, so
 * this is the same target with the same click behavior as every other name in
 * the app — and the headshot is the one route in a preview to the *pitcher's*
 * page, a man nobody has rostered, which `PlayerDetails` opens on as a matter
 * of course.
 *
 * **It is drawn on a pitcher's preview as well as a batter's**, and on his it
 * is his **counterpart** rather than someone he faces: `probablePitcher` on a
 * pitcher's own game is the *opposing* announced starter. A reader deciding
 * whether to start a pitcher wants to know who the other club is running out
 * quite as much as a hitter does, which is why the block is no longer inside
 * the batter branch. The sub-line says which of the two readings it is, because
 * `starting for MIA` under a pitcher's dialog would otherwise be read as a man
 * he steps in against.
 *
 * It carries **no lineup pip or status code**: those are `PhotoStatus`'s marks
 * and read off `/api/statuses`, which the feed does not fetch — and both would
 * only restate what is here (his pip is `SP`, and a man on the IL is not the
 * announced starter).
 */
export function StarterLine({
  sp,
  club,
  viewerIsPitcher,
  onOpenDetails,
  note,
}: {
  /** The other club's starter, announced or projected. Null draws nothing —
   *  the caller says what an absence means, the two surfaces wording it
   *  differently. */
  sp: { id: number; name: string; hand: string | null } | null;
  /** The opposing club's abbreviation. */
  club: string;
  /** Whose preview this is: a pitcher's makes this man his counterpart. */
  viewerIsPitcher: boolean;
  /**
   * Open his page. **Optional, and its absence draws him without the links
   * rather than with dead ones** — the Overview's own opener is optional
   * (`PlayerDay` mounts that block from a context that has none), and a
   * headshot that looks like a door and answers nothing is worse than a
   * headshot that does not look like one.
   */
  onOpenDetails?: (key: string) => void;
  /** A word on how sure this is — the Schedule view's projected tier. */
  note?: string;
}) {
  if (!sp) return null;
  const key = playerKey({ id: sp.id, kind: 'pitcher' });
  const open = onOpenDetails;
  return (
    <div className="upcoming-sp">
      {open ? (
        <FeedHeadshot id={sp.id} name={sp.name} onOpen={() => open(key)} />
      ) : (
        <img className="feed-photo" src={headshotUrl(sp.id)} alt={sp.name} loading="lazy" />
      )}
      <div className="feed-item-id">
        {open ? (
          <FeedPlayerName playerKey={key} name={sp.name} onOpen={open} />
        ) : (
          <span className="feed-player-name">{sp.name}</span>
        )}
        <span className="feed-context">
          {handThrows(sp.hand)} · {viewerIsPitcher ? `${club}’s starter, his counterpart` : `starting for ${club}`}
          {note ? ` · ${note}` : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * **The game preview: everything a scheduled game can be asked before it is
 * played**, as a dialog on its own.
 *
 * It was the body of `UpcomingRow` and is now a component because a **fourth**
 * surface opens it — the summary table's opponent cell, in both of that table's
 * readings. Three copies of a dialog agreeing with each other was already the
 * trap this codebase spends its comments on; four would have been the one where
 * they stop agreeing.
 *
 * For a **batter** it is the platoon card with the announced starter's half
 * marked, over the ballpark; for a **pitcher** the lineup waiting for him, over
 * the same. `canPreview` is the test for whether there is anything here to open
 * at all, and every caller asks it rather than reproducing it.
 */
export function UpcomingPreview({
  report,
  game,
  onOpenDetails,
  onClose,
}: {
  report: PlayerReport;
  game: PlayerGame;
  onOpenDetails: (key: string) => void;
  onClose: () => void;
}) {
  const isPitcher = report.kind === 'pitcher';
  const sp = game.probablePitcher;
  const spHand = sp?.hand === 'L' ? 'L' : sp?.hand === 'R' ? 'R' : null;
  // Which side of the plate he stands on, for the park's own cut. Off
  // `HandednessContext` — the season roster this app already holds — so it
  // costs no request, and a man it has never listed falls to both hands
  // together rather than to a guessed side.
  const bats = useHandedness(report.id)?.bats ?? null;
  return (
      <Modal
        title={`${report.name} — ${matchup(game)}`}
        titleId="upcoming-detail-title"
        className="play-detail-box"
        onClose={onClose}
      >
        <div className="upcoming-detail">
          {/* **The man on the mound comes first.** The whole reason a scheduled
              game is worth opening is *who is pitching*, and both the park and
              the split below are read against him — he sat under the ballpark
              for a commit, which put a fact about the ground above a fact about
              the game. On a **pitcher's** preview he is that man's counterpart
              rather than somebody he faces, and is drawn all the same: a reader
              deciding whether to start a pitcher wants to know who the other
              club is running out quite as much as a hitter does. */}
          <StarterLine
            sp={sp}
            club={game.opponent}
            viewerIsPitcher={isPitcher}
            onOpenDetails={onOpenDetails}
          />
          {/* **What he is expected to be worth in this one game** — under the
              man on the mound, over the ground. The same block the Schedule
              row's `SchedulePreview` draws, and the reading order is argued in
              `Projection.tsx`. */}
          <ProjectedGameLine
            kind={report.kind}
            playerId={report.id}
            gamePk={game.gamePk}
            date={game.date}
          />
          {/* **The ballpark, above whatever the reader pressed for.** It is
              the one fact about a scheduled game that is already knowable in
              full — the split below it is a season's worth of one man and
              the lineup is the other club's, but the park is settled the
              moment the fixture is — and it moves both readings: a platoon
              edge worth 40 points of wOBA is being read inside a park worth
              nine of it either way.

              A **batter** is shown his own side of the plate, and a switch
              hitter is resolved off the very fact this dialog opened to show
              — the hand the announced starter throws with. A **pitcher** is
              shown both hands, because he faces whichever nine the other club
              writes down. */}
          <GamePark
            venueId={game.venueId}
            hand={isPitcher ? 'all' : hitterHand(bats, spHand)}
            handNote={
              isPitcher
                ? 'The park as it plays to both hands — he faces whoever they write down.'
                : undefined
            }
          />
          {isPitcher ? (
            <OpponentSection
              hitting={game.opponentHitting}
              opponent={game.opponent}
              hand={game.stand ?? report.throws ?? null}
            />
          ) : (
            <>
              {!sp && (
                /* **Nobody named yet, said where the reader is.** The dialog
                   opens on the strength of the park and the split, and the
                   thing that is missing is the one thing the split's marked
                   half would have come from — so the sentence names that
                   rather than apologizing for the box. The starter himself,
                   where there is one, is drawn at the top by `StarterLine`. */
                <p className="ovw-none">
                  {game.opponent} haven’t named a starter yet, so neither half of his split is
                  marked — the ballpark above is settled either way.
                </p>
              )}
              {/* The whole platoon comparison with tonight's half marked,
                  rather than that half alone — see the note on this component
                  and `BatterSplitsTab`. */}
              <BatterSplitsTab
                vsLeft={report.splitVsLeft}
                vsRight={report.splitVsRight}
                /* Null where nobody is named — the whole comparison, unmarked,
                   which is exactly what the player page's own Splits tab
                   draws. A mark is a claim about who he will face, and there
                   is nobody to make it about. */
                highlight={spHand === null ? null : spHand === 'L' ? 'left' : 'right'}
                highlightTitle={
                  sp && spHand
                    ? `${sp.name} throws ${spHand === 'L' ? 'left' : 'right'}-handed, so this is the half that applies to this game.`
                    : undefined
                }
              />
            </>
          )}
        </div>
      </Modal>
  );
}

/**
 * **Whether a game has a preview worth opening.**
 *
 * The one test, asked by every caller rather than reproduced by each — the feed's
 * Upcoming row and the summary table's opponent cell both gate their press on
 * it, so a row that presses and a dialog that has something in it cannot come
 * apart.
 *
 * A batter's is his split or the park; a pitcher's is the opposing lineup or the
 * park. **`venueId` rather than a park looked up in the table**, which is fetched
 * lazily: a cell keyed on the park would turn pressable after it had already
 * drawn, and a control that changes under the finger is the fault `RULES.md`
 * names.
 */
export function canPreview(report: PlayerReport, game: PlayerGame): boolean {
  const hasPark = game.venueId !== null;
  if (report.kind === 'pitcher') return !!game.opponentHitting || hasPark;
  const hasSplits = (report.splitVsLeft?.pa ?? 0) > 0 || (report.splitVsRight?.pa ?? 0) > 0;
  return hasSplits || hasPark;
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
  sameGame = false,
}: {
  entry: FeedEntry;
  onOpenDetails: (key: string) => void;
  grouped?: boolean;
  multiGame?: boolean;
  /** Every item on the page is from one game and the page says which — see
   *  `FeedAtBat`. The game page's Plays tab is the caller. */
  sameGame?: boolean;
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
        sameGame={sameGame}
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
      sameGame={sameGame}
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
  /** His base-running off the play **still being thrown** — a steal taken
   *  behind the batter at the plate, the wild pitch that moved him, the run it
   *  scored. Pinned to the Live section rather than filed in `entries`, and
   *  moving into `entries` of its own accord the moment the at-bat resolves.
   *  Play order (cause before effect), which is also how the Live block reads
   *  them down the page. Empty for a pitcher, whose base events are rows inside
   *  his outing rather than items of their own. */
  liveEvents: FeedEntry[];
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
 * Whether a base-event item happened on the play **still being thrown** — the
 * one thing that decides whether it is Live or Recent.
 *
 * `.some` rather than `.every` because a group is one play and its events
 * therefore agree; where a group could ever be mixed (two events with no clip
 * id and the same timestamp), keeping the whole item live is the safe
 * direction — a group is one line and one clip, so splitting it across two
 * sections would state the play twice.
 */
const isMidAtBat = (e: FeedEntry): boolean =>
  e.type === 'base' && e.evs.some((ev) => ev.midAtBat);

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
      // Outings are not plays. They have a section of their own above the
      // stream, the button says `N new plays`, and the page it opens is a page
      // of plays — counting a start in it would be the mark naming one thing
      // and opening another.
      if (e.type === 'pitching') continue;
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
 *
 * **The stream borrowed it too**, for as long as it could be read forwards; the
 * control that turned it round is gone and the pair is down to one caller
 * again, the Live block's in-progress events. Kept as a negation rather than
 * inlined there, for the reason it was written that way: the tiebreak is the
 * whole point, and one of it cannot disagree with itself.
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
  const all = report.games.flatMap((game): FeedEntry[] =>
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
  );
  // **A base event off the play still being thrown is not history yet.** The
  // in-progress plate appearance has been kept out of this list from the
  // beginning (`filter((pa) => pa.event)`), and its base events had no such
  // test at all: a steal taken behind a live batter, or the wild pitch that
  // moved the man on second, landed in Recent while the play it happened on was
  // still going on — the two halves of one play in two different sections, with
  // Recent claiming a completeness the play did not have. Same test now, one
  // field (`BaseEvent.midAtBat`), so the at-bat and its interruptions move
  // together: they sit in Live until MLB gives the play a result, and cross into
  // the stream on the next poll after it does.
  const entries = all.filter((e) => !isMidAtBat(e)).sort(byRecency);
  const liveEvents = all.filter(isMidAtBat).sort(byPlayOrder);
  const upcoming = report.games
    .filter((game) => notStartedYet(game) && isUpcomingFor(report, game))
    .map((game) => ({ report, game }));
  return { live, entries, liveEvents, upcoming };
}

/**
 * The roster as a flat, most-recent-first stream. A "Live" section pins whoever
 * is at bat, on deck, on base or on the mound to the top; below it, everything
 * that has happened reads newest-first. (It could be turned round for a while;
 * see the note by `FeedGlyph` in `FeedFilters.tsx` for what that control was
 * and what its reasoning is still good for.) `reports` is one kind at a time (App's
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
  onOpenDetails,
  shown: shownFromParent,
  onShowMore,
  playFilter = null,
  newOnly = false,
  seenPlays = 0,
  newCount = 0,
  onShowNew,
  onShowAll,
  onClearNew,
  newPlaysFilters,
}: {
  reports: PlayerReport[];
  /** Open a player's page — what the headshot and the name both do now. */
  onOpenDetails: (key: string) => void;
  /** How much of the Recent section to open on, and where to report a "Load
   * more" back to. App holds the number for the same reason it holds the
   * scroll offset, and keyed the same way — see its `feedShown`. */
  shown: number;
  onShowMore: (shown: number) => void;
  /**
   * Which kind of play the stream is narrowed to — null is all of them. See
   * `FeedFilters.tsx`, which owns the row of pills that sets it.
   *
   * **All six of these are optional, and the second caller passes none of
   * them.** A matchup team page draws this same component for a leaguemate's
   * week (`LeagueTeam.tsx`), and neither half of the feature belongs to it: the
   * marker is a fact about how far down *the reader's own* stream they have got,
   * and that page's own control row already carries four groups. Absent, the
   * component is exactly the stream it was — no filter, no button, no marker.
   */
  playFilter?: PlayFilterKey | null;
  /**
   * **Whether the new-plays page is open** — the plays that have arrived since
   * the reader last marked the stream read, on a full-screen page of their own
   * over this one (`NewPlaysPage` below).
   *
   * It was a *mode* over this same list: the Recent section's heading changed
   * its word and the items under it narrowed. It asks *when* where the pills ask
   * *what kind* and the two still AND (`passesFilters`), so `HR` inside the new
   * plays is a question the page can be asked — the pills are on its navbar. But
   * they narrow the page's list rather than this one, and the stream underneath
   * is the whole day whether the page is up or not.
   *
   * **The pitcher tab can never open it**, and that is App's doing rather than a
   * test here: it passes `newOnly={feedIsBatters ? feedNewOnly : undefined}`, so
   * on the pitcher tab this is the default `false`.
   */
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
  /** Press the red button: open the new-plays page. App turns the mode on. */
  onShowNew?: () => void;
  /**
   * Close the new-plays page — every play of the day again. App turns the mode
   * off, **which is what marks the stream read** (its `setFeedNewOnly`), so this
   * is the press that says "done with those" from *inside* the page. It is drawn
   * twice, at the two ends of it: the `Back` button in the pinned head and a
   * `Show all plays` after the last card. It is also what Escape calls, and what
   * gates the page being drawn at all — a page with no way out is not a page.
   */
  onShowAll?: () => void;
  /**
   * **Mark those plays read without going and looking at them** — the `Clear`
   * beside the red count button.
   *
   * The same watermark and the same write as `onShowAll`: App points both at
   * `markPlaysSeen(newestPlayTs)`, so there is one definition of *seen* and one
   * route to the record. What it does not touch is the mode, which is already
   * off wherever this button is drawn (`showNewButton` below), or the URL,
   * which never carried the marker in the first place — "these plays are seen"
   * is a fact about the *person*, saved as `UserPrefs.seenPlays`, where
   * `newplays=1` is a fact about which stream the view is showing.
   */
  onClearNew?: () => void;
  newPlaysFilters?: ReactNode;
  /* **The stream's direction was two props and is none.** `oldestFirst` and
     `newOldestFirst` reversed this list and the new-plays page's, off a toggle
     in the pinned row and a second one in that page's head — deliberately two
     pieces of state, since turning one stream round must not turn the other.
     The control is gone from the app (see `FeedFilters.tsx`) and both lists run
     newest-first, which is the order that makes a stream a stream. */
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
  // priority role first (a player is listed once, for their leading role) —
  // each with whatever has happened on the play still being thrown under him.
  //
  // **A player can be here on those events alone**, with no role left: the
  // runner caught stealing behind a live batter is out, and the one who scored
  // on the wild pitch is in the dugout, yet both things happened ten seconds
  // ago on the play the reader is watching. They sort last (`NO_ROLE`), after
  // everyone who is still in the middle of something.
  const liveRows = perPlayer
    .filter((p) => p.live !== null || p.liveEvents.length > 0)
    .map((p) => ({ report: p.report, live: p.live, events: p.liveEvents }))
    .sort((a, b) => liveOrder(a.live) - liveOrder(b.live));

  // Everything that has happened, interleaved by clock, newest first: for a
  // batter every
  // completed plate appearance and every base-running event of his own, and for
  // a pitcher his whole outing as a single item. The in-progress at-bat (no
  // event yet) lives in the Live section above, and a pitcher pinned there has
  // already been kept out of this list by `playerDayEntries`.
  // Sorted here rather than taking `playerDayEntries`' own order, which is one
  // man's day and already `byRecency`: the merge across players is what decides
  // the stream.
  const allRecent = perPlayer
    .flatMap((p) => p.entries)
    .sort(byRecency);

  /**
   * **The `Video` lens needs today's highlight reels**, and only today's — see
   * `filmTest`. One request for the whole slate, fired when the lens goes on and
   * again whenever a game arrives in the stream that has not been asked about.
   *
   * `askedReels` is a ref rather than state so a landing answer does not re-run
   * the effect that asked for it, and it is **cleared whenever the lens is
   * selected** — so pressing `Video` again is the retry, which is the rule the
   * player page's tabs already follow for a failed read. It costs nothing: the
   * reel is a cached map server-side, and re-reading it is the *right* thing on
   * a game still being played, whose reel grows as the cuts land.
   *
   * **A failed read marks its games answered-with-nothing** rather than being
   * left pending. Their plays then drop out of the lens — the direction every
   * join in this app fails in, and the one that cannot show a play with no film
   * — where leaving them pending would hold `Finding the clips` on screen for
   * ever, which reads as working when nothing is.
   */
  const today = baseballDay(Date.now());
  const [reels, setReels] = useState<Map<number, Set<string>>>(() => new Map());
  const askedReels = useRef<Set<number>>(new Set());
  const liveGames = useMemo(() => {
    if (playFilter !== 'video') return [];
    const out = new Set<number>();
    for (const e of allRecent) {
      if (e.game.date >= today && clipIdsOf(e).length > 0) out.add(e.game.gamePk);
    }
    return [...out].sort((a, b) => a - b);
    // `allRecent` is rebuilt on every poll, so the key is its games rather than
    // the array: an unchanged slate must not re-fire the read every 20 seconds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playFilter, today, allRecent.map((e) => e.game.gamePk).join(',')]);

  // Declared before the read below so it runs first: effects fire in order, and
  // this one is what makes the read a retry.
  useEffect(() => {
    if (playFilter === 'video') askedReels.current = new Set();
  }, [playFilter]);

  useEffect(() => {
    const need = liveGames.filter((pk) => !askedReels.current.has(pk));
    if (need.length === 0) return;
    for (const pk of need) askedReels.current.add(pk);
    const settle = (of: (pk: number) => string[]) =>
      setReels((prev) => {
        const next = new Map(prev);
        for (const pk of need) next.set(pk, new Set(of(pk)));
        return next;
      });
    api.gameClips(need).then(
      (games) => settle((pk) => games[pk] ?? []),
      () => settle(() => []),
    );
  }, [liveGames, playFilter]);

  const hasFilm = filmTest(today, reels);
  /** A today-game the reel has not answered for yet — what the line under the
   *  heading says, so an under-filled `Video` lens reads as *still looking*
   *  rather than as *there is no film*. */
  const pendingFilm = playFilter === 'video' && liveGames.some((pk) => !reels.has(pk));
  const showFilmWait = useDelayedFlag(pendingFilm);
  /**
   * **The page's own stream, and the new-plays page's, are two lists now.**
   *
   * The mode used to narrow *this* list in place — same section, same items,
   * a heading that changed its word — so the two tests ANDed into one filter.
   * The new plays are a page of their own over the feed (`NewPlaysPage`
   * below), so the stream underneath it goes on being the whole day: what a
   * reader has been reading does not rearrange itself behind a box they opened.
   * `passesFilters` takes both tests still, and each caller passes the one it
   * means.
   */
  /**
   * **The outings are their own list, below the plays.**
   *
   * They used to be the *same* list under a different heading — the stream was
   * one kind at a time, so `Recent outings` and `Recent plays` were one section
   * whose word changed with the tab. With both kinds on one feed they cannot
   * be: an outing is a whole game's work in one card and a play is one swing,
   * and interleaving them by clock put a six-inning start between two
   * groundouts as though the three were the same size of event.
   *
   * **Below**, which is a reversal: the split shipped with the outings on top,
   * arguing that a start is the day's larger fact. It reads as the wrong
   * priority in use — the plays are what the feed is opened for and what
   * changes minute to minute, and a roster with three starters pushed ten
   * at-bats below the fold before the reader had seen one. The outings are the
   * settled tail: a start is done when it appears and does not move again.
   * Within each list the order is untouched.
   *
   * **The play pills do not reach them**, and that is the whole reason this
   * split is a filter on `type` rather than on the filtered list: a pitching
   * entry has no play kinds at all (`playKinds` returns an empty set for it),
   * so any lens but `All` would have emptied the outings section as a side
   * effect of narrowing the plays. The pills say what they narrow and they
   * narrow that.
   */
  const outings = allRecent.filter((e) => e.type === 'pitching');
  const allPlays = allRecent.filter((e) => e.type !== 'pitching');
  const recent = allPlays.filter((e) => passesFilters(e, playFilter, false, 0, hasFilm));
  /* **No second sort.** This used to be re-sorted on a direction of its own —
     the page had its own order toggle, deliberately a second piece of state so
     that turning one stream round did not turn the other. Both toggles are gone
     and `allPlays` is already in this stream's order, so the filter's fresh
     array is the page's list. */
  const newRecent = newOnly
    ? allPlays.filter((e) => passesFilters(e, playFilter, true, seenPlays, hasFilm))
    : EMPTY_ENTRIES;

  /**
   * **The red button, and why it is not drawn while the page is open.** It is
   * the doorway to those plays, so with the reader already looking at them it
   * would be a control offering what is on screen — and pressing it would mark
   * them read, which is what empties the page. So while the page is up the
   * marker is frozen and the button is absent; the way *out* is the page's own
   * Back button and the `Show all plays` at the foot of its list, and leaving
   * is what says "done with those": see App's `setFeedNewOnly`.
   */
  const showNewButton = !newOnly && newCount > 0;

  // Not-yet-started games, earliest first pitch first — so the feed still has
  // something to show before the day's first at-bat (and lists later games while
  // earlier ones are underway). Only the ones the player is actually in: see
  // `isUpcomingFor`.
  //
  const upcoming = perPlayer.flatMap((p) => p.upcoming).sort(byStartTime);

  /**
   * **Emptied by a filter is not the same as empty**, which is the distinction
   * `filtered` carries. `No games for these players.` is a statement about the
   * day and would be a lie over a stream the reader has narrowed to home runs on
   * an afternoon of singles — so the Recent section keeps its own heading and
   * says which control did it, and the day-level message is held back.
   */
  const filtered = allPlays.length > 0 && recent.length === 0;
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
            {liveRows.map(({ report, live, events }) => (
              <Fragment key={report.id}>
                {live &&
                  // A pitcher on the mound reads as his outing so far, innings
                  // and all — the same item the stream below would carry,
                  // pinned here.
                  (report.kind === 'pitcher' && live.game.pitching ? (
                    <FeedPitcherGame
                      report={report}
                      game={live.game}
                      role={live.role}
                      onOpenDetails={onOpenDetails}
                    />
                  ) : (
                    <LiveEntry
                      report={report}
                      role={live.role}
                      game={live.game}
                      onOpenDetails={onOpenDetails}
                    />
                  ))}
                {/* What has happened on the play still being thrown, directly
                    under the man it happened to — **the same `FeedItem` the
                    Recent stream draws**, deliberately, rather than a line
                    folded into the live card. It cannot fold: the card belongs
                    to the *batter* and the event to the *runner*, and on most
                    rosters those are two different people of whom only one is
                    watched. And the shape is already what the item needs — the
                    badge, the situation glyph, MLB's line and the clip, which
                    an action line would have to give up. It is not filtered
                    with the stream either: nothing in the Live section is. */}
                {events.map((entry) => (
                  <FeedItem key={entryKey(entry)} entry={entry} onOpenDetails={onOpenDetails} />
                ))}
              </Fragment>
            ))}
          </div>
        </section>
      )}

      {(recent.length > 0 || filtered) && (
        <section className="feed-section">
          {/* The heading says which list this is, and it says one word now
              rather than two. `Recent outings` was this heading's other value
              while the stream was one kind at a time; the outings have a
              section of their own below, so this one is only ever the plays.
              (`New plays` was a third value, and went to the new-plays page's
              own head, where it names a box rather than a state.) */}
          <h2 className="feed-heading">Recent plays</h2>
          {/* News about the day, at the head of the list the news landed in —
              which is where it can also *do* something. The League page's
              Transactions dot is the same statement made on a tab, and it can
              only be a mark: it says a feed has moved on a page the reader is
              not looking at. Here they are looking at it, so the mark carries
              its own count and is the way to the plays it counts. */}
          {showNewButton && onShowNew && (
            /* Two presses in one slot, because the news admits two answers and
               only one of them was reachable: *show me* and *I don't need to
               look*. The second used to cost a trip into the mode and back out
               of it, since leaving the mode was the only thing that moved the
               marker — a reader who could see from the count that it was three
               groundouts had to open them to make them stop being new.

               **`Clear` does not touch the mode**, which is already off
               wherever this row is drawn, and does not touch the URL, which
               never carried the marker: it calls the same
               `markPlaysSeen(newestPlayTs)` that leaving the mode calls. One
               definition of seen, two doors to it.

               **Both go together, and neither is ever disabled.** They are
               inside one gate (`showNewButton`), so the instant the count is
               nought the row is absent rather than sitting there greyed —
               *a mark that would be on every row marks nothing*, and a `Clear`
               with nothing to clear is that mark. The vanishing is also the
               press's own trace, which is why there is no `MIN_SPIN` mark on
               it: the state it changes is local and immediate, and the write
               behind it is queued and swallowed, so there is no wait to stand
               in front of. */
            <div className="feed-new-row">
              <button
                type="button"
                className="feed-new"
                onClick={onShowNew}
                title={`${newCount} ${newCount === 1 ? 'play' : 'plays'} since you last marked the feed read — show them`}
              >
                <span className="feed-new-dot" aria-hidden="true" />
                {newCount} new {newCount === 1 ? 'play' : 'plays'}
              </button>
              {onClearNew && (
                /* `Clear` alone is a word without an object once the count is
                   read out of the sentence beside it, so the accessible name
                   carries the count the way the visible pair does. */
                <button
                  type="button"
                  className="feed-clear-new"
                  onClick={onClearNew}
                  aria-label={`Mark ${newCount} new ${newCount === 1 ? 'play' : 'plays'} read`}
                  title="Mark them read where they are — the count goes and the stream stays as it is"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {/* The reels for today's games, still out — see `filmTest`. A line
              rather than a block wait: the days already settled are on screen
              and answered, so this says the list is still filling rather than
              standing in front of one. It takes the app's own 250ms floor, so a
              warm reel (a cached map) draws nothing at all. Drawn here, at the
              head of the list it is about, but laid out **out of the flow** on
              the heading's own line (`.feed-film-wait`) — in the column it
              pushed every play in the list down as it arrived. */}
          {showFilmWait && <LoadingLine className="feed-film-wait">Finding the clips</LoadingLine>}
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
               app's standing rule for a view a filter has cleared.
               **One control can empty this now**, where it was two: the mode
               went to a page of its own, and that page carries its own empty
               state naming its own way out (`NewPlaysPage`). What is left here
               is the lens, and the sentence it always had. */
            <EmptyState
              compact
              title={
                playFilter === 'video'
                  ? // Its own sentence, because "of that kind" is not what this
                    // lens selects and because the honest reason is a timing
                    // one: MLB cuts a day's highlights as it goes, and Savant
                    // has the rest of the plays a day later.
                    'No plays with video yet — clips land through the day, and the rest arrive a day later'
                  : 'No plays of that kind today'
              }
            >
              <p className="empty-how">
                Change it with the pills above — <b>All</b> is every play of the day.
              </p>
            </EmptyState>
          )}
        </section>
      )}

      {/* **The outings, below the plays.** Its own section and its own heading,
          unpaged and unfiltered: a roster carries two or three starters and a
          day gives each of them at most one card, so there is nothing here for
          a `Load more` to hold back — where the plays above it are a hundred
          at-bats and are paged ten at a time. See `outings`. */}
      {outings.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">Recent outings</h2>
          <div className="feed-items">
            {outings.map((entry) => (
              <FeedItem key={entryKey(entry)} entry={entry} onOpenDetails={onOpenDetails} />
            ))}
          </div>
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

      {isEmpty && <EmptyState compact title="No games for these players" />}

      {/* **The new plays, as a page over this one.** Rendered from inside the
          feed because this is where the stream's vocabulary is — the same
          `allRecent`, the same `passesFilters`, the same `FeedItem` — and
          portalled to the body from in there, so nothing about where it is
          written reaches where it is laid out. Drawn only when App has the mode
          on *and* has handed over the way out: `onShowAll` is what closes it,
          and a page with no way out is not a page. */}
      {newOnly && onShowAll && (
        <NewPlaysPage
          entries={newRecent}
          filters={newPlaysFilters}
          onOpenDetails={onOpenDetails}
          onClose={onShowAll}
          playFilter={playFilter}
        />
      )}
    </div>
  );
}

/** The empty list the feed hands `NewPlaysPage` when the mode is off — a module
 *  constant rather than a fresh `[]` each render, the array being a dependency
 *  of that page's own memo. */
const EMPTY_ENTRIES: FeedEntry[] = [];

/** This page's layer. See `NewPlaysPage` for why it is 48 and not 50. */
const NEWPLAYS_LAYER = 48;

/**
 * **The window a list of plays covers, as one line** — `2:41 – 4:07 PM` on one
 * afternoon, `Aug 18, 7:12 PM – Aug 19, 4:07 PM` across two.
 *
 * The date is printed only where it is *load-bearing*: a stream held to one
 * baseball day says which day in the app's own date bar, and repeating it on
 * every reading of it is noise. Two days is the case the sentence exists for —
 * a range excursion, or a night game that finished after midnight — and there
 * the two stamps are the whole of what the reader needs.
 *
 * Off the same `entryTime` the stream is ordered by rather than a second read
 * of the timestamps, which is this file's standing rule: two readings of when a
 * play happened must not be able to disagree.
 */
function coveredRange(entries: FeedEntry[]): string | null {
  if (entries.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of entries) {
    const t = entryTime(e);
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const a = new Date(lo);
  const b = new Date(hi);
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (a.toDateString() === b.toDateString()) {
    // One stamp where the two land in the same minute: "4:07 – 4:07 PM" is a
    // range that says nothing a single time does not.
    return time(a) === time(b) ? time(a) : `${time(a)} – ${time(b)}`;
  }
  return `${day(a)}, ${time(a)} – ${day(b)}, ${time(b)}`;
}

/**
 * **The new plays, as a full-screen page over the feed.**
 *
 * They were an inline mode: the Recent section's own heading changed its word
 * and the list under it narrowed. What that could not do is *hold still* — a
 * reader forty items down the stream pressed a red button and the stream they
 * were reading rearranged itself around them, and coming back out rearranged it
 * again. A page leaves the feed exactly as it was, which is what makes going and
 * looking free.
 *
 * **It rides on `.details-view`**, the class every full-screen page in this app
 * rides on: its own fixed box, its own scroller, `useLockBodyScroll`,
 * `useOverlayFocus` (focus in on open and back out on close, the background
 * `inert`), a `BackButton` and Escape through `answersEscape`, so a ladder
 * unwinds one rung per press. See **Popups, overlays and the Escape ladder**.
 *
 * **Portalled to `document.body`**, which is a fact about CSS rather than about
 * this ladder: `.app-dialog-body` declares `container-type: inline-size`, and
 * layout containment makes a box a containing block for `position: fixed`
 * descendants — so a page rendered inside one would be laid out inside that
 * dialog. Nothing opens this from inside a dialog today; the portal is what
 * keeps that from being the bug the day something does.
 *
 * **Layer 48 rather than `.details-view`'s own 50** (`.newplays-view`), which is
 * `.mup-view`'s number and for `.mup-view`'s reason: a name or a headshot on any
 * of these cards opens the **player page**, which is fixed at 50, and two boxes
 * on one layer are two boxes `overlayAbove` cannot order — both read nothing
 * above them, and one press of Escape is then answered by whichever listener
 * happens to run first. At 48 the ladder is `feed → new plays (48) → player page
 * (50) → whatever that page opens`.
 *
 * **It takes no layer from `DialogLayerContext`**, and that is deliberate: this
 * page is opened from exactly one place, the red button in the stream, with
 * nothing above it — where `OutingPage` is drawn at three depths and has to
 * climb from wherever it was opened. A fixed 48 is the honest statement of a box
 * with one entry point. It provides its own layer downward all the same, so a
 * dialog raised from a card inside it climbs above it rather than under it.
 *
 * **No `swallowNextClick`.** That rule is for a dismissal by a press *outside*
 * the box — a popover's, where the control under the finger was never covered
 * and the click lands on it. This page is opaque and full-screen and has no
 * backdrop: the only presses that close it are its own two buttons and Escape,
 * and a click on a button is already spent on that button.
 *
 * **The clips behind it stop painting**, which costs this page nothing to
 * arrange: `[inert] video` is keyed on the mark `useOverlayFocus` takes, so the
 * feed's own `<video>` layers are hidden for exactly as long as this box covers
 * them, and the ones on *these* cards — outside `#root`, inside the top box —
 * are not.
 *
 * **Linkable, on the parameter it already had.** `newplays=1` said *which
 * stream this view is showing* while this was a mode and says *this page is
 * open* now, which is the same fact one shape along; App writes it and reads it
 * exactly as before, so every link ever written still opens on these plays and
 * `?plays=hr&newplays=1` still opens on the new home runs. No second parameter,
 * which is the rule: two params must never mean two things, and one page is not
 * two things.
 */
function NewPlaysPage({
  entries,
  filters,
  onOpenDetails,
  onClose,
  playFilter,
}: {
  entries: FeedEntry[];
  /* The direction control stood here, wired to this page's *own* state rather
     than the stream's so that turning one round did not turn the other. Both
     are gone; the page reads newest-first with the stream. */
  /** **The kind pills**, built by App and drawn in the page at the head of the
   *  list they narrow rather than in the head above it. See the render below,
   *  which carries the argument and the guard. */
  filters?: ReactNode;
  onOpenDetails: (key: string) => void;
  /** Leave — which is what marks these plays read. App's `showAllPlays`. */
  onClose: () => void;
  playFilter: PlayFilterKey | null;
}) {
  useLockBodyScroll();
  const viewRef = useRef<HTMLDivElement | null>(null);
  useOverlayFocus(viewRef);
  // The pinned head's height, measured rather than declared — it carries a row
  // of controls that wraps at narrow widths, so there is no one number for it.
  const chromeRef = useOverlayChromeOffset<HTMLDivElement>(viewRef);
  // This page's own reading depth, and it starts where the stream does. Not
  // reported anywhere: the page is opened, read and left, where the feed's own
  // depth has to survive a view switch.
  const [shown, setShown] = useState(FEED_PAGE_SIZE);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answersEscape(e, viewRef.current)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* The window these plays cover, off the list as it stands — so it narrows
     with the pills, which is the honest reading: it states the range of what is
     *on this page*, not of a set the reader can no longer see. */
  const range = useMemo(() => coveredRange(entries), [entries]);

  return createPortal(
    <DialogLayerContext.Provider value={NEWPLAYS_LAYER}>
      <div ref={viewRef} tabIndex={-1} className="details-view newplays-view">
        {/* The head and the controls are one pinned box, `.details-chrome`'s own
            argument one page along: they are one statement of *which plays and
            which reading of them*, and a reader thirty cards down a list of new
            plays must not have to go back up to get out of it. */}
        <div className="details-chrome newplays-chrome" ref={chromeRef}>
          <div className="details-head newplays-head">
            <BackButton onClose={onClose} />
            <div className="newplays-id">
              <h1 className="details-name">New plays</h1>
              {/* What the list covers, in the head rather than over the items:
                  it is a fact about the page, and a line above the first card
                  would scroll away from the reader it is telling. Absent over an
                  empty list, there being no range to state. */}
              {range && <p className="newplays-range">{range}</p>}
            </div>
            {/* The order toggle stood here, in the head rather than on a row
                of its own, on the argument that it was the one control here a
                reader reaches *while scrolling* and a head is a pinned bar. It
                is gone from the app; what the placement bought is on the record
                either way — the navbar was 112px at 320, 390 and 1200 with a
                row of its own and the head alone is 82, so the button rode for
                nothing where a row cost 46. `.details-head` still wraps, and
                `--details-chrome-h` is still measured rather than declared,
                because a two-day range line can take this head to two lines on
                its own. */}
          </div>
        </div>

        {/* **The pills go in the page, at the head of the list they narrow**,
            which is the rule the stream itself follows (`FeedFilterPills`) and
            the matchup's team feed follows one page along (`LeagueTeam.tsx`):
            they are the answer to the question the page was opened with, worked
            once on arrival, where the pinned bar is for a control wanted
            halfway down. In the head they were also the whole of the second row
            of a two-row navbar on a phone.

            **Drawn when there is something for them to be narrowing**, and the
            guard is the empty state's own two branches read off one condition:
            with a lens in force the row is what emptied the page and the
            sentence below points at it, and with no lens and no plays there is
            nothing to narrow and a row of pills would be a control over
            nothing — which is the same test the feed makes with
            `filteredCards.length > 0`. */}
        {(entries.length > 0 || playFilter !== null) && filters}
        <div className="live-feed newplays-feed">
          {entries.length > 0 ? (
            <>
              <div className="feed-items">
                {entries.slice(0, shown).map((entry) => (
                  <FeedItem key={entryKey(entry)} entry={entry} onOpenDetails={onOpenDetails} />
                ))}
              </div>
              {entries.length > shown && (
                <button
                  type="button"
                  className="feed-more"
                  onClick={() => setShown((n) => n + FEED_PAGE_SIZE)}
                >
                  Load more
                  <span className="feed-more-count">{entries.length - shown}</span>
                </button>
              )}
              {/* The second way out, at the foot. A reader who has read down a
                  short list of new plays is at the *bottom* of it, and Back is a
                  scroll away at the top — the same argument the two `Show all
                  plays` buttons made when this was a mode, one of which the
                  pinned head has now taken over. Ordinary chrome rather than
                  red: `--strikeout` in this app means *something has happened
                  since you looked*, and this is the reader putting that away. */}
              <button
                type="button"
                className="feed-more feed-all-plays feed-all-plays-foot"
                onClick={onClose}
                title="Back to every play of the day — this marks the new ones read"
              >
                Show all plays
              </button>
            </>
          ) : (
            /* Emptied by the reader's own control, so it names it — and the
               control is on this page's own navbar, which is where it points. */
            <EmptyState
              compact
              title={
                playFilter === 'video'
                  ? 'No new plays with video yet — clips land through the day, and the rest arrive a day later'
                  : playFilter
                    ? 'No new plays of that kind'
                    : 'Nothing new since you last marked the feed read'
              }
            >
              <p className="empty-how">
                {playFilter ? (
                  <>
                    The pills above are narrowing this — <b>All</b> is every kind of
                    play, and <b>Back</b> is the whole day again.
                  </>
                ) : (
                  <>
                    <b>Back</b> is the whole day again.
                  </>
                )}
              </p>
            </EmptyState>
          )}
        </div>
      </div>
    </DialogLayerContext.Provider>,
    document.body,
  );
}
