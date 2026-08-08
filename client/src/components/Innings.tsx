import { useState } from 'react';
import type { FacedBatter, PlayerGame } from '../types';
import { contactHighlight, eventLabel, ordinal, outcomeKind } from '../lib';
import { useScrollIntoViewOnExpand } from '../hooks';
import { BaseDiamond } from './BaseDiamond';
import { VideoClip } from './PlateAppearanceCard';
import { PitchSequence } from './PitchSequence';

/** One inning's worth of a pitcher's results, grouped in encounter order. */
interface InningGroup {
  inning: number;
  half: string;
  batters: FacedBatter[];
}

/** Group the batters faced by inning, preserving play order — so both the
 * innings and the batters within each one read first-to-last. */
function groupByInning(faced: FacedBatter[]): InningGroup[] {
  const groups: InningGroup[] = [];
  const idx = new Map<number, number>();
  for (const fb of faced) {
    let gi = idx.get(fb.inning);
    if (gi === undefined) {
      gi = groups.length;
      idx.set(fb.inning, gi);
      groups.push({ inning: fb.inning, half: fb.half, batters: [] });
    }
    groups[gi].batters.push(fb);
  }
  return groups;
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
          {group.batters.map((fb, i) => (
            <FacedBatterCard
              key={`${fb.batterId}-${fb.inning}-${i}`}
              fb={fb}
              seq={i + 1}
              gamePk={gamePk}
            />
          ))}
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
  const groups = groupByInning(game.pitching?.facedBatters ?? []);
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
