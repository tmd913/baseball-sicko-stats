import { useState } from 'react';
import type { BaseEvent, FacedBatter, PlayerGame } from '../types';
import {
  baseEventLabel,
  baseEventTone,
  contactHighlight,
  eventLabel,
  ordinal,
  outcomeKind,
} from '../lib';
import { useScrollIntoViewOnExpand } from '../hooks';
import { BaseDiamond } from './BaseDiamond';
import { VideoClip } from './PlateAppearanceCard';
import { PitchSequence } from './PitchSequence';

/** One row inside an inning: a batter he faced, or something that happened on
 *  the bases while he was facing one. */
type InningRow = { fb: FacedBatter; ev?: undefined } | { ev: BaseEvent; fb?: undefined };

/** One inning's worth of a pitcher's outing, in encounter order. */
interface InningGroup {
  inning: number;
  half: string;
  batters: FacedBatter[];
  rows: InningRow[];
}

/**
 * Group an outing by inning, preserving play order — so both the innings and
 * what happened inside each one read first-to-last.
 *
 * The base events are merged in on **`atBatNumber`**, and an event lands
 * *before* the batter of the same number: a balk or a steal happens in the
 * middle of an at-bat, and the batter's row is that at-bat's outcome, which
 * came after. An event whose at-bat has no row at all goes at the end of its
 * inning, which is exactly right for the one case that produces it — a caught
 * stealing for the third out, where MLB files the play under the batter who was
 * up and `savant.ts` drops it as the non-plate-appearance it is.
 *
 * The groups are **sorted by inning** rather than left in the order they were
 * created, because that same case can produce an inning made of nothing but an
 * event — a reliever brought in for one batter who picks the runner off to end
 * it — and an inning first seen while merging the events would otherwise be
 * appended after every inning he actually faced someone in. On the card that is
 * a half-inning at the wrong end of the outing; in the feed, where the list is
 * reversed, it is one at the very top.
 */
function groupByInning(faced: FacedBatter[], events: BaseEvent[]): InningGroup[] {
  const groups: InningGroup[] = [];
  const idx = new Map<number, number>();
  const groupFor = (inning: number, half: string): InningGroup => {
    let gi = idx.get(inning);
    if (gi === undefined) {
      gi = groups.length;
      idx.set(inning, gi);
      groups.push({ inning, half, batters: [], rows: [] });
    }
    return groups[gi];
  };
  for (const fb of faced) groupFor(fb.inning, fb.half).batters.push(fb);
  for (const ev of events) groupFor(ev.inning, ev.half);
  for (const group of groups) {
    const pending = events.filter((ev) => ev.inning === group.inning);
    for (const fb of group.batters) {
      for (const ev of pending.filter((e) => e.atBatNumber === fb.atBatNumber)) {
        group.rows.push({ ev });
      }
      group.rows.push({ fb });
    }
    const seen = new Set(group.batters.map((fb) => fb.atBatNumber));
    for (const ev of pending) if (!seen.has(ev.atBatNumber)) group.rows.push({ ev });
  }
  return groups.sort((a, b) => a.inning - b.inning);
}

/**
 * A base-running event inside an inning block — the balk, the wild pitch, the
 * bag taken off him, the runner he picked off.
 *
 * It takes `.faced-row`'s shape so it lines up with the batters around it — the
 * situation the event happened in where a batter's row carries his, then the
 * badge, then who it was, and at the right end the count it went on where the
 * batter's row carries his pitch count. That count is the one thing about a
 * steal that neither the glyph nor MLB's own line for the play ever says, and
 * it is what decides whether the bag was there to be taken.
 *
 * It **opens onto whatever is under it**, exactly as `FacedBatterCard` does and
 * on the same test — MLB's line for the play and the clip of it, where a
 * batter's card holds a description and a pitch sequence. It was a static row
 * with its description hidden in a `title` (which a phone cannot show at all)
 * for as long as the feed drew a second, watchable copy of every one of these
 * beside the outing; the pitcher stream no longer does (see `LiveFeed.tsx`), so
 * the outing has to be readable as the outing, video and all. An event with
 * neither a line nor a clip stays the static row it was, which is the same rule
 * the batter card above applies to a batter with no pitches recorded.
 */
function InningBaseEvent({ ev, gamePk }: { ev: BaseEvent; gamePk: number }) {
  const [open, setOpen] = useState(false);
  const tone = baseEventTone(ev.kind);
  const expandable = Boolean(ev.description || ev.playId);
  // The count only means something on an event the runner went on a pitch for:
  // a balk or a wild pitch is the pitcher's doing, and the count he was working
  // on says nothing about it.
  const onThePitch = ev.kind === 'sb' || ev.kind === 'cs' || ev.kind === 'pocs';
  const count =
    onThePitch && ev.balls !== null && ev.strikes !== null ? `${ev.balls}-${ev.strikes}` : null;
  // As on a batter faced: opening brings the row to the top of the screen.
  const cardRef = useScrollIntoViewOnExpand<HTMLDivElement>(open);

  const summary = (
    <>
      <span className="faced-seq" aria-hidden="true" />
      <BaseDiamond bases={ev.onBase} outs={ev.outs ?? 0} className="pa-bases" />
      <span className={`pa-badge tone-${tone}`}>{baseEventLabel(ev)}</span>
      {ev.runnerName && <span className="faced-batter">{ev.runnerName}</span>}
      {count && (
        <span className="faced-pitches" title={`${count} count`}>
          {count}
        </span>
      )}
    </>
  );

  if (!expandable) {
    return <div className={`faced-row faced-event tone-${tone}`}>{summary}</div>;
  }

  return (
    <div ref={cardRef} className={`faced-card faced-event tone-${tone}${open ? ' expanded' : ''}`}>
      <button
        type="button"
        className="faced-row faced-summary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {summary}
      </button>
      {open && (
        <div className="faced-detail">
          {ev.description && <p className="pa-des">{ev.description}</p>}
          {ev.playId && <VideoClip playId={ev.playId} gamePk={gamePk} />}
        </div>
      )}
    </div>
  );
}

/** The pitcher's line for one inning: batters faced, hits, R, ER, K, BB, pitches. */
function inningStats(batters: FacedBatter[]) {
  let h = 0;
  let r = 0;
  let er = 0;
  let k = 0;
  let bb = 0;
  let pitches = 0;
  for (const fb of batters) {
    const kind = outcomeKind(fb.event);
    if (kind === 'hit' || kind === 'hr') h++;
    else if (kind === 'strikeout') k++;
    else if (kind === 'walk') bb++;
    r += fb.runs;
    er += fb.earnedRuns;
    pitches += fb.pitches.length;
  }
  return { bf: batters.length, h, r, er, k, bb, pitches };
}

/** One batter faced — the result row, expandable to the full pitch sequence. */
function FacedBatterCard({
  fb,
  seq,
  gamePk,
}: {
  fb: FacedBatter;
  // Where this batter came up within the inning — 1 for the inning's first.
  seq: number;
  gamePk: number;
}) {
  const [open, setOpen] = useState(false);
  const kind = outcomeKind(fb.event);
  const expandable = fb.pitches.length > 0;
  // The same exit velo · launch angle · distance line a batter's at-bat carries
  // — it's one batted ball, and it reads identically from either side.
  const contact = contactHighlight(fb);
  // On expand, bring this batter to the top of the screen — same as a batter's
  // at-bat card, so the pitch sequence isn't left below the fold.
  const cardRef = useScrollIntoViewOnExpand<HTMLDivElement>(open);

  const summary = (
    <>
      <span className="faced-seq" title={`Batter ${seq} of the inning`}>
        {seq}
      </span>
      <BaseDiamond bases={fb.onBase} outs={fb.outsWhenUp ?? 0} className="pa-bases" />
      <span className={`pa-badge kind-${kind}`}>{eventLabel(fb.event)}</span>
      {fb.rbi > 0 && <span className="pa-rbi">{fb.rbi} RBI</span>}
      <span className="faced-batter">
        {fb.batterName}
        {fb.stand ? <span className="faced-hand"> ({fb.stand})</span> : null}
      </span>
      {contact && <span className="pa-contact-main">{contact}</span>}
      {expandable && <span className="faced-pitches">{fb.pitches.length} P</span>}
    </>
  );

  if (!expandable) {
    return <div className={`faced-row kind-${kind}`}>{summary}</div>;
  }

  return (
    <div ref={cardRef} className={`faced-card kind-${kind}${open ? ' expanded' : ''}`}>
      <button
        type="button"
        className="faced-row faced-summary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {summary}
      </button>
      {open && (
        <div className="faced-detail">
          {fb.description && <p className="pa-des">{fb.description}</p>}
          {contact && (
            <div className="pa-contact">
              <span className="pa-contact-main">{contact}</span>
              {fb.bbType && <span className="pa-bbtype">{fb.bbType.replace(/_/g, ' ')}</span>}
              {fb.xwoba !== null && <span className="pa-xwoba">xwOBA {fb.xwoba.toFixed(3)}</span>}
            </div>
          )}
          <PitchSequence pitches={fb.pitches} />
          {fb.playId && <VideoClip playId={fb.playId} gamePk={gamePk} />}
        </div>
      )}
    </div>
  );
}

/** A collapsible per-inning card: header with the inning's line, then the
 * expandable result rows for each batter faced that inning. */
function InningBlock({
  group,
  gamePk,
  active,
}: {
  group: InningGroup;
  gamePk: number;
  // The pitcher is on the mound right now, in this inning.
  active: boolean;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const s = inningStats(group.batters);
  const isTop = group.half === 'Top';
  // Expanding an inning brings it to the top of the screen, like a game block.
  const blockRef = useScrollIntoViewOnExpand<HTMLDivElement>(!collapsed);
  return (
    <div
      ref={blockRef}
      className={`inning-block${collapsed ? ' collapsed' : ''}${active ? ' active' : ''}`}
    >
      <button
        type="button"
        className="inning-head"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="inning-label">
          <svg className="pa-inning-arrow" viewBox="0 0 12 10" aria-hidden="true" fill="currentColor">
            <path d={isTop ? 'M6 0 12 10 0 10Z' : 'M0 0 12 0 6 10Z'} />
          </svg>
          {ordinal(group.inning)}
        </span>
        {active && <span className="inning-live">Live</span>}
        <span className="inning-stats">
          <span className="inning-stat">{s.bf} BF</span>
          {s.h > 0 && <span className="inning-stat is-h">{s.h} H</span>}
          {s.r > 0 && (
            <span className="inning-stat is-r">
              {s.r} R{s.er !== s.r ? ` (${s.er} ER)` : ''}
            </span>
          )}
          {s.k > 0 && <span className="inning-stat is-k">{s.k} K</span>}
          {s.bb > 0 && <span className="inning-stat is-bb">{s.bb} BB</span>}
          <span className="inning-stat is-p">{s.pitches} P</span>
        </span>
      </button>
      {!collapsed && (
        <div className="inning-batters">
          {(() => {
            // The batter number is the batter's, so it counts batters and skips
            // the events between them — `.faced-seq` answers "which man of the
            // inning is this", and a balk is not one of them.
            let seq = 0;
            return group.rows.map((row, i) =>
              row.fb ? (
                <FacedBatterCard
                  key={`b-${row.fb.batterId}-${i}`}
                  fb={row.fb}
                  seq={++seq}
                  gamePk={gamePk}
                />
              ) : (
                <InningBaseEvent key={`e-${row.ev.kind}-${i}`} ev={row.ev} gamePk={gamePk} />
              ),
            );
          })()}
        </div>
      )}
    </div>
  );
}

/**
 * A pitcher's outing as a list of collapsed per-inning blocks — the shape both
 * the pitcher card and the feed's pitcher tab read an outing in, expanding the
 * same way here as everywhere else in the app. The card leaves the innings in
 * play order (an outing reads first inning down); the feed sets `newestFirst`,
 * so the inning that just happened — the one he's throwing, while he's on the
 * mound — sits at the top, like the stream around it.
 */
export function InningsList({
  game,
  pitcherId,
  newestFirst,
}: {
  game: PlayerGame;
  pitcherId: number;
  newestFirst?: boolean;
}) {
  const groups = groupByInning(game.pitching?.facedBatters ?? [], game.baseEvents);
  // While this pitcher is the one on the mound, the half-inning he's throwing
  // gets a live accent. Null once the game is over or he's been pulled.
  const st = game.status;
  const onMound = st.state === 'live' && st.pitchingId === pitcherId;
  const activeInning = onMound ? st.currentInning : null;
  return (
    <div className="innings-list">
      {(newestFirst ? [...groups].reverse() : groups).map((group) => (
        <InningBlock
          key={`${group.inning}-${group.half}`}
          group={group}
          gamePk={game.gamePk}
          active={group.inning === activeInning && (group.half === 'Top') === st.isTopInning}
        />
      ))}
    </div>
  );
}
