import { useState } from 'react';
import type { LiveRole } from '../lib';
import { playerKey } from '../types';
import {
  baseEventLabel,
  baseEventTone,
  creditLabel,
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
import { useScrollIntoViewOnExpand } from '../hooks';
import { BaseDiamond, PlaySituation } from './BaseDiamond';
import { InlineVideoClip, PlateAppearanceCard } from './PlateAppearanceCard';
import { GameStatusBadge, PlatoonSplit } from './PlayerCard';
import { OpponentSection, OutingBreakdown, PitchingTag, lineSummary } from './PitcherCard';
import { InningsList } from './Innings';

/** How many stream items the Recent section shows at a time — a day of at-bats
 * across a roster runs to hundreds, and every one of them mounts a card. */
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
  open,
  onToggle,
  onOpenDetails,
  grouped = false,
  multiGame = false,
}: {
  report: PlayerReport;
  role: LiveRole;
  game: PlayerGame;
  open: boolean;
  onToggle: () => void;
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
  // Scroll the whole item (player header + at-bat) into view on expand, so the
  // player info isn't cut off above the viewport — the card itself doesn't scroll.
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  return (
    <div className={`feed-item live-entry role-${role}`} ref={ref}>
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
  grouped = false,
  multiGame = false,
}: {
  report: PlayerReport;
  game: PlayerGame;
  pa: PlateAppearance;
  open: boolean;
  onToggle: () => void;
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
  // The outcome's colour rides on the *item*, not the card, so one rail runs
  // the header, the at-bat and the clip — who it was, what he did and the
  // video of it, which is one thing to read. The card keeps its box because it
  // opens, and in this feed that is what a box means; it gives up only its own
  // coloured edge, which the rail outside it now carries (styles.css).
  //
  // Expanding scrolls the whole item to the top so the player header stays in
  // view above the at-bat detail (the card itself doesn't self-scroll).
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  return (
    <div className={`feed-item feed-at-bat kind-${outcomeKind(pa.event)}`} ref={ref}>
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
  // Tones rather than kinds — ten kinds would be ten colours and a hundred
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
  grouped = false,
  multiGame = false,
}: {
  report: PlayerReport;
  game: PlayerGame;
  role?: LiveRole | null;
  open: boolean;
  onToggle: () => void;
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
  const pg = game.pitching!;
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  // The three sections the Games view's card carried and the feed's item never
  // has — the game line with its Results/Rates/Contact strips, the lineup he
  // faced, and his arsenal for the outing. They are a dialog rather than more
  // of this item because an item is a stream entry: the innings are the outing,
  // and this is the read *around* it.
  const [breakdown, setBreakdown] = useState(false);
  // The rail. Every other item shape in this feed groups itself with one — the
  // outcome's colour on an at-bat, the role's on a live entry, the event's on a
  // base event — and the outing was the one that didn't, so the pitcher feed
  // read as a list of loose blocks where the batter feed read as items.
  //
  // The colour is **`decisionColor`**, which is the pitcher side's existing
  // answer to "what did this outing come to": the same green/red/accent/amber
  // the credit chip on the bar takes, the game line's own accent on the card,
  // and the log's W/L/S/HLD. A fifth definition here would be a fourth place
  // for those four colours to drift. `--muted` for a start still in progress or
  // a no-decision relief appearance — the item is grouped either way, and a
  // grey rail claims nothing about how it went, which is the truth at that
  // point. While he is **on the mound** the role rail wins outright: `.live-entry`
  // is what says a group is happening now, and a decision he hasn't got yet is
  // the lesser fact.
  const rail = role ? undefined : { borderLeftColor: decisionColor(pg.decision) };
  return (
    <div
      className={`feed-item feed-pitcher${role ? ` live-entry role-${role}` : ' feed-outing'}`}
      style={rail}
      ref={ref}
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
      {open && (
        <>
          {/* Below the innings rather than on the bar above them: the bar is the
              toggle, every pixel of it, and a button inside a button is not a
              thing. A reader who wants the full read has already opened the
              outing, so this is where they are. */}
          <InningsList game={game} pitcherId={report.id} newestFirst />
          <button
            type="button"
            className="outing-breakdown-btn"
            onClick={() => setBreakdown(true)}
            title={`${report.name} — the full line, the lineup he faced and his arsenal for this outing`}
          >
            Full breakdown
          </button>
        </>
      )}
      {breakdown && (
        <OutingBreakdown report={report} game={game} onClose={() => setBreakdown(false)} />
      )}
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
export function UpcomingRow({
  report,
  game,
  open,
  onToggle,
  onOpenDetails,
  grouped = false,
}: {
  report: PlayerReport;
  game: PlayerGame;
  open: boolean;
  onToggle: () => void;
  onOpenDetails: (key: string) => void;
  /** Inside a player group: the group's own header carries the headshot, the
   * name and the matchup, so the item drops its identity row and keeps only
   * what is its own — the score, the role, the inning. */
  grouped?: boolean;
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

  // `feed-item` for the layout every item shape in this feed shares (column,
  // 8px gap, the scroll offset that clears the sticky chrome on expand), and
  // `upcoming-item` for the rail alone — the same 3px/11px edge the at-bat, the
  // base event, the live entry and the outing group themselves with, in the
  // muted tone a game that hasn't been played has earned. Without it the
  // identity row, the bar and the detail read as three loose blocks.
  return (
    <div className="feed-item upcoming-item" ref={ref}>
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
 * A stream item's key — its React key, and for the two shapes that open, the
 * key their open state is held under. A base event doesn't open, so it only
 * ever needs the first; it takes the `base-` prefix because a play's own id is
 * not unique against an at-bat's `player-game-atbat`.
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
  openKeys,
  onToggleKey,
  onOpenDetails,
  grouped = false,
  multiGame = false,
}: {
  entry: FeedEntry;
  openKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onOpenDetails: (key: string) => void;
  grouped?: boolean;
  multiGame?: boolean;
}) {
  const key = entryKey(entry);
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
        open={openKeys.has(key)}
        onToggle={() => onToggleKey(key)}
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
      open={openKeys.has(key)}
      onToggle={() => onToggleKey(key)}
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

/** Newest first, with a play's own events kept in cause-then-effect order. */
function byRecency(a: FeedEntry, b: FeedEntry): number {
  const t = entryTime(b) - entryTime(a);
  if (t) return t;
  const gn = (b.game.gameNumber ?? 0) - (a.game.gameNumber ?? 0);
  if (gn) return gn;
  if (a.game.gamePk !== b.game.gamePk) return b.game.gamePk - a.game.gamePk;
  return playOrder(b) - playOrder(a);
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
  openKeys,
  onToggleKey,
}: {
  reports: PlayerReport[];
  // Which kind the tabs above are showing — the stream is one kind at a time,
  // and a pitcher's items are outings rather than plays.
  kind: PlayerKind;
  /** Open a player's page — what the headshot and the name both do now. */
  onOpenDetails: (key: string) => void;
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
  const recent = perPlayer.flatMap((p) => p.entries).sort(byRecency);

  // Not-yet-started games, earliest first pitch first — so the feed still has
  // something to show before the day's first at-bat (and lists later games while
  // earlier ones are underway). Only the ones the player is actually in: see
  // `isUpcomingFor`.
  const upcoming = perPlayer.flatMap((p) => p.upcoming).sort(byStartTime);

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
            {recent.slice(0, shown).map((entry) => (
              <FeedItem
                key={entryKey(entry)}
                entry={entry}
                openKeys={openKeys}
                onToggleKey={toggle}
                onOpenDetails={onOpenDetails}
              />
            ))}
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
