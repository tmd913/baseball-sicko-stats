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
import { BaseDiamond } from './BaseDiamond';
import { Modal } from './Modal';
import { InlineVideoClip, PlayMatchup } from './PlateAppearanceCard';
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
 * appended after every inning he actually faced someone in — a half-inning at
 * the wrong end of the outing, wherever the outing is drawn.
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
 * **It opens nothing, and that is the change.** It was a press onto a dialog
 * holding MLB's line for the play and the clip of it — which was right while
 * these rows lived in an *inning block* squeezed into whatever box the outing
 * was drawn in, where a video frame unrolled between two rows pushed the rest
 * of the inning down the page. The inning is a dialog of its own now
 * (`InningBlock`), and inside a box about one inning there is room to say the
 * whole of what a base-running play is: a badge, a sentence and six seconds of
 * video. A press onto a box holding one sentence would be a rung of the ladder
 * spent on nothing — so the sentence and the clip read here, exactly as the
 * feed's own `FeedBaseEvent` draws them, and this row is the terminus.
 *
 * An event with neither a line nor a clip is the bare row it always was.
 */
function InningBaseEvent({ ev, gamePk }: { ev: BaseEvent; gamePk: number }) {
  const tone = baseEventTone(ev.kind);
  const detailed = Boolean(ev.description || ev.playId);
  // The count only means something on an event the runner went on a pitch for:
  // a balk or a wild pitch is the pitcher's doing, and the count he was working
  // on says nothing about it.
  const onThePitch = ev.kind === 'sb' || ev.kind === 'cs' || ev.kind === 'pocs';
  const count =
    onThePitch && ev.balls !== null && ev.strikes !== null ? `${ev.balls}-${ev.strikes}` : null;

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

  if (!detailed) {
    return <div className={`faced-row faced-event tone-${tone}`}>{summary}</div>;
  }

  return (
    <div className={`faced-card faced-event tone-${tone}`}>
      <div className="faced-row faced-line">{summary}</div>
      {ev.description && <p className="faced-des">{ev.description}</p>}
      {ev.playId && <InlineVideoClip playId={ev.playId} gamePk={gamePk} />}
    </div>
  );
}

/**
 * The pitcher's line for one inning: batters faced, hits, R, ER, K, BB, HBP,
 * pitches.
 *
 * **`BB` counts walks and a hit batsman is not one.** It used to be
 * `outcomeKind(event) === 'walk'`, which is the right test for the thing that
 * function answers — *how did this man reach*, where a walk, an intentional walk
 * and a hit-by-pitch are one outcome and take one tone — and the wrong test for
 * a **statistic**. A box score has never put a hit batsman in the walk column,
 * and an inning where a pitcher plunked somebody read `1 BB` with no walk in it.
 * So the count reads the event itself, and `outcomeKind` keeps the job it is
 * for: the row's color, one component up.
 *
 * **And the fact is not dropped, it moves to its own figure.** Counting the
 * hit batsman nowhere would trade a wrong chip for a missing one — a free base
 * is the whole reason this line carries `BB` at all. `HBP` is drawn on the same
 * terms as every other figure here: only where there is one.
 */
function inningStats(batters: FacedBatter[]) {
  let h = 0;
  let r = 0;
  let er = 0;
  let k = 0;
  let bb = 0;
  let hbp = 0;
  let pitches = 0;
  for (const fb of batters) {
    const kind = outcomeKind(fb.event);
    if (kind === 'hit' || kind === 'hr') h++;
    else if (kind === 'strikeout') k++;
    else if (fb.event === 'walk' || fb.event === 'intent_walk') bb++;
    else if (fb.event === 'hit_by_pitch') hbp++;
    r += fb.runs;
    er += fb.earnedRuns;
    pitches += fb.pitches.length;
  }
  return { bf: batters.length, h, r, er, k, bb, hbp, pitches };
}

/**
 * One batter faced — the result row, its clip under it, and a press onto the
 * description, the batted ball, the pitch sequence and the strike zone.
 *
 * It is **exactly the shape `FeedAtBat` gives a batter's plate appearance**, and
 * that is the point rather than a coincidence: a summary row, the video of the
 * play directly beneath it, and the pitch-by-pitch read a press away
 * (`PlateAppearanceCard` with `showVideo={false}`, since the clip is already on
 * the item). One at-bat drawn from the pitcher's side and the same at-bat drawn
 * from the batter's now read as one thing in one app.
 *
 * **The clip used to be inside the dialog**, which was the right place while
 * these rows were the contents of an accordion inside somebody else's box; in
 * an inning's own dialog there is room for the video where the feed puts it,
 * and the box behind the press keeps what genuinely needs the room — a pitch
 * table and a strike-zone plot.
 */
function FacedBatterCard({
  fb,
  seq,
  gamePk,
  pitcherId,
  pitcherName,
}: {
  fb: FacedBatter;
  // Where this batter came up within the inning — 1 for the inning's first.
  seq: number;
  gamePk: number;
  /** Whose outing, for the dialog's matchup head — the other half of the
   *  at-bat, which a `FacedBatter` does not name because every row in the list
   *  is his. */
  pitcherId: number;
  pitcherName?: string;
}) {
  const [open, setOpen] = useState(false);
  const kind = outcomeKind(fb.event);
  const expandable = fb.pitches.length > 0;
  // The same exit velo · launch angle · distance line a batter's at-bat carries
  // — it's one batted ball, and it reads identically from either side.
  const contact = contactHighlight(fb);

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

  if (!expandable && !fb.playId) {
    return <div className={`faced-row kind-${kind}`}>{summary}</div>;
  }

  return (
    <div className={`faced-card kind-${kind}`}>
      {expandable ? (
        <button
          type="button"
          className="faced-row faced-summary"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          {summary}
        </button>
      ) : (
        <div className="faced-row faced-line">{summary}</div>
      )}
      {fb.playId && <InlineVideoClip playId={fb.playId} gamePk={gamePk} />}
      {open && (
        <Modal
          title={`${fb.batterName} — ${eventLabel(fb.event)} · ${
            fb.half === 'Top' ? 'Top' : 'Bot'
          } ${fb.inning}`}
          titleId="faced-batter-title"
          className="play-detail-box"
          onClose={() => setOpen(false)}
        >
          <div className="faced-detail">
            {/* **The same head a batter's own dialog carries**, and this is the
                same at-bat: `PlayMatchup` takes two men rather than a plate
                appearance for exactly this caller. The batter is the row's, the
                pitcher is whose outing this is — which is why the list has to
                pass him down, a `FacedBatter` naming only the man at the plate.
                The hands come off the season roster where the play carries
                none, so the pitcher's `RHP` needs nothing threaded. */}
            <PlayMatchup
              batter={{ id: fb.batterId, name: fb.batterName, hand: fb.stand }}
              pitcher={pitcherName ? { id: pitcherId, name: pitcherName, hand: null } : null}
            />
            {fb.description && <p className="pa-des">{fb.description}</p>}
            {contact && (
              <div className="pa-contact">
                <span className="pa-contact-main">{contact}</span>
                {fb.bbType && <span className="pa-bbtype">{fb.bbType.replace(/_/g, ' ')}</span>}
                {fb.xwoba !== null && <span className="pa-xwoba">xwOBA {fb.xwoba.toFixed(3)}</span>}
              </div>
            )}
            {/* No clip in here: the row that opened this box carries it, the
                way `FeedAtBat` carries a batter's and passes `showVideo={false}`
                into the card's own dialog. The same video twice is the same
                video twice wherever it happens. */}
            <PitchSequence pitches={fb.pitches} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The inning's line, as the chips the bar carries and the dialog repeats. */
function InningLine({ s, active }: { s: ReturnType<typeof inningStats>; active?: boolean }) {
  return (
    <span className="inning-stats">
      {active && <span className="inning-live">Live</span>}
      <span className="inning-stat">{s.bf} BF</span>
      {s.h > 0 && <span className="inning-stat is-h">{s.h} H</span>}
      {s.r > 0 && (
        <span className="inning-stat is-r">
          {s.r} R{s.er !== s.r ? ` (${s.er} ER)` : ''}
        </span>
      )}
      {s.k > 0 && <span className="inning-stat is-k">{s.k} K</span>}
      {s.bb > 0 && <span className="inning-stat is-bb">{s.bb} BB</span>}
      {/* A free base and not a walk — see `inningStats`. It takes `is-bb`'s tone
          because it is the same *kind* of thing to the reader scanning the line
          (a man on for nothing), which is the distinction `outcomeKind` draws
          and the one this figure does not. */}
      {s.hbp > 0 && <span className="inning-stat is-bb">{s.hbp} HBP</span>}
      <span className="inning-stat is-p">{s.pitches} P</span>
    </span>
  );
}

/** The rows of one inning, in encounter order — the batters he faced and what
 *  happened on the bases between them. Its own component because it is what the
 *  dialog holds, and a `.map` with a running counter inside JSX reads worse than
 *  a named list. */
function InningRows({
  group,
  gamePk,
  pitcherId,
  pitcherName,
}: {
  group: InningGroup;
  gamePk: number;
  pitcherId: number;
  pitcherName?: string;
}) {
  // The batter number is the batter's, so it counts batters and skips the
  // events between them — `.faced-seq` answers "which man of the inning is
  // this", and a balk is not one of them.
  let seq = 0;
  return (
    <>
      {group.rows.map((row, i) =>
        row.fb ? (
          <FacedBatterCard
            key={`b-${row.fb.batterId}-${i}`}
            fb={row.fb}
            seq={++seq}
            gamePk={gamePk}
            pitcherId={pitcherId}
            pitcherName={pitcherName}
          />
        ) : (
          <InningBaseEvent key={`e-${row.ev.kind}-${i}`} ev={row.ev} gamePk={gamePk} />
        ),
      )}
    </>
  );
}

/**
 * One inning of an outing: a bar carrying its line, **opening a dialog** onto
 * that inning read as a feed.
 *
 * ### This reverses a decision recorded here, and the reason it reverses is
 *
 * The note this replaces argued that the inning was the one thing in the
 * accordion-to-popup sweep that should *stay* an accordion: everything else
 * opened onto a **detail about one thing** — one at-bat, one steal, one outing —
 * where an inning is a **grouping**, and popping it would make the pitch
 * sequence a third dialog. Both halves of that are still true as stated. What
 * they left out is what the reader actually gets from a batter's game and did
 * not get from a pitcher's.
 *
 * A batter's game opens as a **feed**: a row per plate appearance with the clip
 * of it underneath, and the pitch-by-pitch a press away. A pitcher's opened as
 * a bar and a stack of closed accordions, and unrolling one grew the box it was
 * in — pushing every inning under it down the dialog's own scroller, which is
 * the exact complaint the sweep was written to answer everywhere else. The
 * space argument the old note waved off ("what an open inning grows is that
 * box's own scroller") is a scroller the reader is *reading*, and a seven-inning
 * start with two innings open is 2,000px of it.
 *
 * So the inning takes a rung, and **the rung under it is given back**. The
 * inning's dialog *is* the feed, so its rows carry what the feed's rows carry:
 * MLB's line for the play and the clip of it, inline. A base event has nothing
 * else to show, so it stops being a press at all (`InningBaseEvent`); a batter
 * faced keeps one, because a pitch table and a strike zone genuinely want a box.
 *
 * ### What that costs, counted rather than waved at
 *
 * Presses to reach a pitch sequence from a Game Log row are **unchanged** — row,
 * inning, batter, three either way. What moves is the Escape count on the very
 * deepest path, from two to three: `PlayerDayModal` → this dialog → the batter's.
 * From the feed's stream it is outing → inning → batter, also three; from the
 * player page's Overview tab it is the overlay plus three, which is the four
 * levels this app has measured before. `Modal`'s `DialogLayerContext` gives each
 * rung its own z-index, so `overlayAbove` still lets exactly one of them answer
 * a press — verified three and four deep, in both directions.
 *
 * What it buys is that a pitcher's game log now reaches his innings as readable
 * feed items, at the same shape and weight as a batter's plays, and that the
 * list of innings holds still: it is bars all the way down and a seven-inning
 * start is 300px rather than a page.
 */
function InningBlock({
  group,
  gamePk,
  pitcherId,
  pitcherName,
  active,
}: {
  group: InningGroup;
  gamePk: number;
  /** Whose outing, for the matchup head on each batter's own dialog one rung
   *  further in. */
  pitcherId: number;
  /** Whose inning, for the dialog's heading — the bar sits under a header that
   *  has already said it, and the box does not. Optional for the same reason
   *  `paTitle`'s is: one call site has no name in scope. */
  pitcherName?: string;
  // The pitcher is on the mound right now, in this inning.
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const s = inningStats(group.batters);
  const isTop = group.half === 'Top';
  const half = isTop ? 'Top' : 'Bottom';
  const when = `${half} of the ${ordinal(group.inning)}`;
  return (
    <div className={`inning-block${active ? ' active' : ''}`}>
      <button
        type="button"
        className="inning-head"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`${when} — the batters he faced`}
        onClick={() => setOpen(true)}
      >
        <span className="inning-label">
          <svg className="pa-inning-arrow" viewBox="0 0 12 10" aria-hidden="true" fill="currentColor">
            <path d={isTop ? 'M6 0 12 10 0 10Z' : 'M0 0 12 0 6 10Z'} />
          </svg>
          {ordinal(group.inning)}
        </span>
        <InningLine s={s} active={active} />
      </button>
      {open && (
        <Modal
          title={`${pitcherName ? `${pitcherName} — ` : ''}${when}`}
          titleId="inning-title"
          className="inning-box"
          onClose={() => setOpen(false)}
        >
          {/* The bar that opened this box is behind it, so the line it carries
              leads the box — the same reason the Game Log's expanded head puts
              back the name the details head would have said. */}
          <div className="inning-box-line">
            <InningLine s={s} active={active} />
          </div>
          {/* Wrapped rather than dropped straight into the dialog's body — see
              `.inning-batters` in styles.css, where a flex item that clips its
              own corners has an automatic minimum size of zero and the cards
              cut their own clips in half. */}
          <div className="inning-batters">
            <InningRows
              group={group}
              gamePk={gamePk}
              pitcherId={pitcherId}
              pitcherName={pitcherName}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * A pitcher's outing as a list of per-inning bars — the shape every place an
 * outing is drawn reads it in: the feed's item, the player page's Overview tab
 * and the Game Log's per-game popup.
 *
 * **Bars all the way down**: each one opens its inning in a dialog rather than
 * unrolling it in place (see `InningBlock`), so the list is the same height
 * whatever the reader has open and a seven-inning start is a glance rather than
 * a page. It is the pitcher-side answer to what a batter's game already reads
 * as — a list you scan, with each thing on it a press away from the whole of
 * itself.
 *
 * **The innings read first-to-last, everywhere.** The feed used to pass a
 * `newestFirst` that flipped them, so the half he was throwing sat under his
 * name the way the stream around it reads newest-first — and the cost was that
 * an outing was drawn in two different orders in two places of the same app,
 * with the reader expected to notice which. An outing is a thing with a
 * beginning: a first inning at the top is how a box score, a game log and a
 * scorebook all read it, and it is what makes "he lost it in the sixth" a
 * sentence you can follow down the page. The live half is still marked — the
 * `.inning-block.active` accent says which one is being thrown — so nothing is
 * lost by leaving it where it belongs in the sequence.
 */
export function InningsList({
  game,
  pitcherId,
  pitcherName,
}: {
  game: PlayerGame;
  pitcherId: number;
  /** Whose outing, for each inning dialog's heading. */
  pitcherName?: string;
}) {
  const groups = groupByInning(game.pitching?.facedBatters ?? [], game.baseEvents);
  // While this pitcher is the one on the mound, the half-inning he's throwing
  // gets a live accent. Null once the game is over or he's been pulled.
  const st = game.status;
  const onMound = st.state === 'live' && st.pitchingId === pitcherId;
  const activeInning = onMound ? st.currentInning : null;
  return (
    <div className="innings-list">
      {groups.map((group) => (
        <InningBlock
          key={`${group.inning}-${group.half}`}
          group={group}
          gamePk={game.gamePk}
          pitcherId={pitcherId}
          pitcherName={pitcherName}
          active={group.inning === activeInning && (group.half === 'Top') === st.isTopInning}
        />
      ))}
    </div>
  );
}
