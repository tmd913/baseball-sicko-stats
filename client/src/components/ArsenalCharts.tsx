import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FocusEvent, PointerEvent, ReactNode } from 'react';
import type {
  ArmAngleInfo,
  MovementSample,
  PitchMix,
  PitcherGame,
  SeasonArsenalPitch,
} from '../types';
import { pitchStyle } from '../lib';
import { TAP_SLOP, useDismissable } from '../hooks';
import { InfoKey } from './InfoKey';
import { pitchDirections } from './Arsenal';

/**
 * The Arsenal tab's two pictures: **Pitch Usage** (how often he throws each
 * pitch, and how that changes by the batter's side) and **Movement Profile**
 * (where each pitch breaks, as a cloud of real pitches rather than one bubble
 * per type). Both are recreations of the charts on a Baseball Savant player
 * page, and both read the data the tab already has.
 *
 * **They share one selection.** The tab owns it and hands it to both, so
 * picking out the slider in one picks it out in the other — they are two views
 * of one arsenal, and letting each keep its own selection would be two answers
 * to "which pitch am I looking at" on one screen.
 *
 * ### What is lit, and who is allowed to say so
 *
 * One sentence: **the chart shows the pitch the reader is pointing at, or the
 * one they last pressed.** A pointer over a button previews it and leaving that
 * button drops the preview; a press pins, pressing the same one again unpins,
 * and a press anywhere else unpins. On touch there is no pointer, so it reduces
 * to *the one you last tapped*.
 *
 * That is two pieces of state (`PitchSelection` below) rather than one, and the
 * split is the whole of what was wrong before. The old shape was a single
 * `hovered`, written by **three** handlers on every button — `onMouseEnter`,
 * `onFocus` and `onClick` — and cleared by exactly one, a `mouseleave` on the
 * whole `<figure>`. Neither half of that survives contact:
 *
 * - **A press could not select.** Chrome dispatches a tap as `pointerenter:touch
 *   → mouseenter → mousedown → focus → mouseup → click`, so the compatibility
 *   `mouseenter` set the pitch, React rendered it as picked, and the click then
 *   read that fresh `on` and toggled it straight back off. Measured on the live
 *   Arsenal tab under touch emulation: **a tap selected nothing, and it took two
 *   taps of the same button to light one** — so tapping a *different* pitch type
 *   left the reader looking at neither. It is the trap `ArmAngleMark` records a
 *   few hundred lines down, unfixed on these two buttons.
 * - **And the clear was a different element from the setter.** The plot sits
 *   inside `.mv-chart`, so moving the pointer off a legend column and onto the
 *   circle left that column lit with nothing under the pointer — measured,
 *   `legOn` stayed `["4-Seam Fastball"]` with 60 of 101 dots still dimmed.
 *   Tabbing past the last legend column left the last one lit for the same
 *   reason: nothing answered the blur.
 *
 * **Hover is for pointers; the press is for everyone.** Every highlightable
 * thing here is a real `<button>` (the usage rows, the legend columns). The
 * preview is filtered on `pointerType === 'mouse'` — `ArmAngleMark`'s own rule,
 * and the reason a tap now selects on the first press — and on the keyboard it
 * is `:focus-visible` that previews, which is the same discrimination read off
 * the platform rather than guessed at: Chrome matches it on a Tab and not on a
 * click or a tap (measured, `false` on both). The `:hover` tints are scoped to
 * `(hover: hover)` in the stylesheet, the app-wide rule argued under *A card
 * doesn't highlight when you scroll past it*.
 */

/**
 * What the two charts are handed. Four fields rather than the two this used to
 * be, and each answers a question the others cannot:
 *
 * - `selected` — what is lit. The preview if there is one, else the pin.
 * - `picked` — what is pinned, which is what `aria-pressed` reports. A toggle
 *   button owes assistive technology its *toggle* state, and reporting
 *   `selected` there would have it flicker as the pointer crossed the row.
 * - `onPreview(type, on)` — a pointer or the keyboard arriving at or leaving a
 *   button. It takes the type on the way out as well as in, so a leave can only
 *   ever clear **its own** preview: focus can leave one button while the pointer
 *   sits on another, and a bare `onPreview(null)` would clear the wrong one.
 * - `onPick(type)` — a press.
 */
export interface PitchSelection {
  selected: string | null;
  picked: string | null;
  onPreview: (pitchType: string, on: boolean) => void;
  onPick: (pitchType: string) => void;
}

/**
 * The handlers every pitch button carries, written once so the usage rows and
 * the legend columns cannot come to answer a gesture differently.
 *
 * `data-pitch` is what the tab's outside-press listener tests against — a press
 * that lands on a pitch button is the pick itself and must not also be read as
 * a press "outside" one.
 */
function pitchButtonProps(pitchType: string, sel: PitchSelection) {
  return {
    'data-pitch': pitchType,
    'aria-pressed': sel.picked === pitchType,
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') sel.onPreview(pitchType, true);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') sel.onPreview(pitchType, false);
    },
    onFocus: (e: FocusEvent<HTMLButtonElement>) => {
      // Only a keyboard focus previews. A click and a tap both focus the button
      // too, and previewing there is what let the click cancel its own press.
      if (e.currentTarget.matches(':focus-visible')) sel.onPreview(pitchType, true);
    },
    onBlur: () => sel.onPreview(pitchType, false),
    onClick: () => sel.onPick(pitchType),
  } as const;
}

/**
 * **What the two charts read: a pitch, its own numbers, and the baseline it is
 * drawn against — whatever that baseline is.**
 *
 * The charts used to take a `SeasonArsenalPitch` and read `leagueHBreak` /
 * `leagueVelo` off it directly, which was true of the only caller there was and
 * stopped being true the moment an outing wanted the same pictures: on a game
 * chart the blob behind a pitch is **his own season**, and a field called
 * `league` holding a season figure is a name that lies to the next reader.
 *
 * So the comparison is named for its *role* rather than for one caller's
 * population, and each caller adapts into it (`seasonChartPitches`,
 * `gameChartPitches`). Nothing else about the two charts differs — the same
 * butterfly, the same cloud, the same callouts — which is the point: an outing's
 * arsenal is the same question asked against a nearer baseline.
 *
 * The fields the charts never read are not here at all. A `SeasonArsenalPitch`
 * carries the season's BA/SLG/wOBA against and a `PitchMix` its whiff rate;
 * neither picture draws them, and carrying them through would invite the next
 * change to draw one of them off whichever caller happened to have it.
 */
export interface ChartPitch {
  pitchType: string;
  /** Share of the pitches in *this* view (0-1) — a season, a game, or one hand
   *  of either, so a split's usage adds to 100%. */
  share: number;
  /** How many of them there were. The Run Value chart's denominator: run value
   *  is a total, and per 100 pitches is what makes a wipeout slider thrown 180
   *  times comparable with a fastball thrown a thousand. */
  count: number;
  /** Runs the pitch saved, pitcher-positive — what the Run Value chart draws.
   *  Null on a caller that has none, which is the game one: run value is a
   *  season column off Savant's CSV and there is no such thing as tonight's. */
  runValue: number | null;
  velo: number | null;
  hBreak: number | null;
  vBreak: number | null;
  /** The baseline this pitch is read against: the league's average for a season
   *  chart, his own season's for a game one. */
  baseVelo: number | null;
  baseHBreak: number | null;
  baseVBreak: number | null;
  /** How wide that baseline is, in inches — the hatched blob's radii. Null
   *  draws no blob, which is the honest reading of "we cannot say how wide". */
  baseHRange: number | null;
  baseVRange: number | null;
}

/** A season row, read against the league. */
export function seasonChartPitches(pitches: SeasonArsenalPitch[]): ChartPitch[] {
  return pitches.map((p) => ({
    pitchType: p.pitchType,
    share: p.share,
    count: p.count,
    runValue: p.runValue ?? null,
    velo: p.velo,
    hBreak: p.hBreak,
    vBreak: p.vBreak,
    baseVelo: p.leagueVelo,
    baseHBreak: p.leagueHBreak,
    baseVBreak: p.leagueVBreak,
    baseHRange: p.leagueHRange,
    baseVRange: p.leagueVRange,
  }));
}

/** A game row, read against the pitcher's own season. */
export function gameChartPitches(mix: PitchMix[]): ChartPitch[] {
  return mix.map((m) => ({
    pitchType: m.pitchType,
    share: m.share,
    count: m.count,
    // A night has no run value: the figure is a season column off Savant's CSV,
    // and `RunValueChart` draws nothing when every pitch answers null — so the
    // outing page cannot accidentally grow a chart of dashes.
    runValue: null,
    velo: m.avgVelo,
    hBreak: m.hBreak,
    vBreak: m.vBreak,
    baseVelo: m.seasonVelo,
    baseHBreak: m.seasonHBreak,
    baseVBreak: m.seasonVBreak,
    baseHRange: m.seasonHRange,
    baseVRange: m.seasonVRange,
  }));
}

/**
 * What the hatched blob and the `vs` callouts are measured against, said in the
 * three places the chart has to say it.
 *
 * A season chart derives its own from the pitcher's hand — `RHP AVG`, because a
 * right-hander throws 0.9–2.0 mph harder at every pitch type and a blended
 * figure marks a lefty down for being left-handed. A game chart overrides it
 * with his season, which no hand can be read off.
 */
export interface ChartBaseline {
  /** The callouts' own upper case: `RHP AVG`, `SEASON AVG`. */
  label: string;
  /** The legend's sentence case, beside `Usage` and `MPH`: `RHP avg`, `Season`. */
  short: string;
  /** What the hatch swatch in the plot's own corner says the blobs are. Not
   *  `label`: that one names the population *for his hand* because the callout
   *  above it is a comparison against exactly that line, where the key stands
   *  over all five blobs at once and a season chart's have always read `MLB
   *  AVG`. */
  key: string;
  /** How the resting hint names it — `the league`, `his season` — in
   *  `Pick a pitch to compare it with …`. */
  against: string;
  /** How the info key names the blob. What the blob *is* is the whole of the
   *  difference between the two readings, so it is spelled out rather than
   *  described generically. */
  blob: ReactNode;
}

/**
 * The pitch selection the two charts share — **owned by whoever draws them
 * both**, because picking out the slider in one has to pick it out in the
 * other: they are two views of one arsenal, and a selection each would be two
 * answers to "which pitch am I looking at" on one screen.
 *
 * **Two pieces of state, not one**, which is what makes a press mean something a
 * hover does not: `preview` is where the pointer or the keyboard is, `picked` is
 * what was pressed, and what is lit is the first of those that exists. See
 * `PitchSelection` above for the whole of the rule and for the two faults a
 * single `hovered` produced.
 *
 * ### A tap anywhere else unpins, and a scroll does not
 *
 * That is the other half of a press meaning something: on touch there is no
 * pointer to move away, so without the first clause a tapped pitch would stay
 * lit until the reader remembered which one it was and tapped it again.
 *
 * **The second clause is what this used to get wrong.** It cleared on the
 * `pointerdown` itself, and on a touch device a *scroll* begins with a
 * `pointerdown` on whatever happens to be under the finger — so dragging the
 * page anywhere but on a pitch button unpinned the pitch, which is the one
 * gesture a reader makes constantly while reading a chart taller than a phone.
 * Reported as the arsenal page dropping its touch highlight on scroll.
 *
 * So the press only **arms** and the release decides: a gesture that stayed
 * within `TAP_SLOP` of where it started is a tap and clears the pin, and one
 * that travelled further is a drag and does not. A scroll the browser takes
 * over fires `pointercancel` and no `pointerup` at all, which disarms without
 * ever reaching the test.
 *
 * **`PairRow` in `PlayerDetails.tsx` already had all of this**, and its comment
 * is this bug stated one card over — *"the card is a list of rows inside a
 * scroller, and toggling on pointerdown meant every flick that happened to start
 * on a row flipped it"*. The percentile card was fixed and the arsenal pin was
 * written afterwards without it. Same constant, deliberately: two numbers for
 * one question is two numbers to keep true, which is why `TAP_SLOP` lives in
 * `hooks.ts` and not beside either reader.
 *
 * **Arming is judged on where the gesture started**, not where it ended: a drag
 * that begins on a pitch button and releases on the page is that button's
 * gesture, and a press that begins on the page and releases over a button is the
 * page's.
 *
 * Deliberately **not `useDismissable`**, though it is the same shape: that hook
 * also spends the press (`swallowNextClick`), because a popover is *in the
 * reader's way* and a press past it is aimed at getting rid of it. A lit pitch
 * covers nothing, so the press that clears it should also do what it was aimed
 * at — a first tap on the next tab must switch tabs, not be eaten. Nothing here
 * calls `preventDefault` or `stopPropagation`, so the click that follows a
 * clearing tap still lands on whatever it was aimed at.
 *
 * `[data-pitch]` rather than the two class names, so the test names the thing (a
 * pitch button) rather than either chart's markup.
 */
export function usePitchSelection(): PitchSelection {
  const [preview, setPreview] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // Turning a preview *off* only clears its own: focus can leave one button
  // while the pointer sits on another, and an unconditional clear takes the
  // wrong one down.
  const onPreview = useCallback(
    (pitchType: string, on: boolean) =>
      setPreview((cur) => (on ? pitchType : cur === pitchType ? null : cur)),
    [],
  );
  const onPick = useCallback(
    (pitchType: string) => setPicked((cur) => (cur === pitchType ? null : pitchType)),
    [],
  );

  useEffect(() => {
    if (picked === null) return;
    let armed: { x: number; y: number } | null = null;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Element | null;
      armed = t?.closest?.('[data-pitch]') ? null : { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: globalThis.PointerEvent) => {
      const start = armed;
      armed = null;
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_SLOP) setPicked(null);
    };
    const onCancel = () => {
      armed = null;
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [picked]);

  return useMemo(
    () => ({ selected: preview ?? picked, picked, onPreview, onPick }),
    [preview, picked, onPreview, onPick],
  );
}

/**
 * Black or white on a pitch's own color, whichever a reader can actually see.
 *
 * The pitch palette is a fixed vocabulary spanning a crimson four-seamer and a
 * near-yellow slider, so one ink cannot serve it: white on `#c9b200` measures
 * 2.0:1, well under what an 11px bold badge owes anybody. WCAG relative
 * luminance, then whichever of the two ends contrasts more — the same test the
 * League table's rank badge settled its own ink with.
 */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const v = parseInt(m[1], 16);
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  // Contrast against white is (1.05)/(L+0.05); against black, (L+0.05)/0.05.
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#11161f';
}

/**
 * The same color, darker — what a movement dot is outlined in.
 *
 * A cloud is a hundred overlapping circles of one color, and without an edge a
 * dense cluster is a single blob whose shape says how *far* the pitches spread
 * and nothing about how many are stacked where. The outline is a darker version
 * of the dot's **own** color rather than a neutral: a gray or a black ring
 * would be a second thing to look at on a chart already carrying five colors,
 * and it reads as ink rather than as the edge of the mark.
 *
 * Multiplied rather than mixed toward black in CSS, because this is an SVG
 * `stroke` **attribute** — `color-mix()` is fine in a stylesheet and is not
 * something to rely on in a presentation attribute.
 */
function darken(hex: string, factor = 0.62): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = (shift: number) =>
    Math.round(((v >> shift) & 255) * factor)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** `--rank-hot` / `--rank-cold`, or nothing where "better" has no meaning. */
const toneClass = (tone: 'better' | 'worse' | null): string =>
  tone === null ? '' : ` tone-${tone}`;

/** How wide a usage capsule can get, as a share of its track. */
const TRACK_MAX = 1;

/** A rounded capsule whose length says how often the pitch is thrown.
 *
 *  **Scaled to the widest pitch on the chart, not to 100%.** A capsule at
 *  absolute scale would leave every arsenal but a one-pitch reliever's sitting
 *  in the left fifth of its track, and the comparison a reader actually makes
 *  here is between *these* pitches. The exact figure is printed beside it, so
 *  nothing is hidden by the relative scale. */
function UsageBar({
  share,
  max,
  color,
  align,
}: {
  share: number;
  max: number;
  color: string;
  align: 'left' | 'right';
}) {
  const frac = max > 0 ? Math.min(TRACK_MAX, share / max) : 0;
  return (
    <span className={`pu-track pu-track-${align}`}>
      <span
        className="pu-bar"
        style={{ width: `${(frac * 100).toFixed(2)}%`, background: color }}
      />
    </span>
  );
}

const pctText = (share: number | null): string => {
  if (share === null) return '—';
  const p = share * 100;
  if (p > 0 && p < 1) return '<1%';
  return `${Math.round(p)}%`;
};

/**
 * Pitch usage as a butterfly: the pitch down the middle, and how often he goes
 * to it against each side of the plate growing outward from it. The two hands
 * share one scale, so a bar reaching further really is a pitch thrown more.
 */
export function PitchUsageChart({
  season,
  pitches,
  vsRight,
  vsLeft,
  selection,
}: {
  /** Which season these are, printed before the title. Null on an outing's own
   *  chart, where the pitches are one night's and a year on the title would be
   *  the wrong span for them. */
  season: number | null;
  pitches: ChartPitch[];
  vsRight: ChartPitch[] | null;
  vsLeft: ChartPitch[] | null;
  selection: PitchSelection;
}) {
  const shareIn = (list: ChartPitch[] | null, type: string): number | null =>
    list ? (list.find((p) => p.pitchType === type)?.share ?? 0) : null;

  // One scale across all three columns — see UsageBar for why it is relative.
  const max = useMemo(() => {
    let m = 0;
    for (const list of [pitches, vsRight ?? [], vsLeft ?? []])
      for (const p of list) m = Math.max(m, p.share);
    return m;
  }, [pitches, vsRight, vsLeft]);

  if (!pitches.length) return null;
  const hasSplits = !!(vsRight || vsLeft);

  // No `onMouseLeave` on the figure: a leave belongs to the button the pointer
  // actually left, which is what `pitchButtonProps` carries. A figure-wide one
  // cannot tell "off the button" from "off the chart", and on the movement
  // chart next door that difference is the whole of the stuck highlight — the
  // plot is inside the figure.
  return (
    <figure className={`pu-chart${hasSplits ? '' : ' solo'}`}>
      <figcaption className="chart-title">
        {season != null && <span className="chart-title-year">{season}</span>} Pitch Usage
      </figcaption>
      {hasSplits && (
        <div className="pu-head" aria-hidden="true">
          <span className="pu-head-side">vs. LHH</span>
          <span className="pu-head-mid">Pitch</span>
          <span className="pu-head-side">vs. RHH</span>
        </div>
      )}
      <div className="pu-rows">
        {pitches.map((p) => {
          const { abbr, color } = pitchStyle(p.pitchType);
          const l = shareIn(vsLeft, p.pitchType);
          const r = shareIn(vsRight, p.pitchType);
          const on = selection.selected === p.pitchType;
          const dim = selection.selected !== null && !on;
          return (
            <button
              key={p.pitchType}
              type="button"
              className={`pu-row${on ? ' on' : ''}${dim ? ' dim' : ''}`}
              {...pitchButtonProps(p.pitchType, selection)}
              title={`${p.pitchType} — ${pctText(p.share)} of his season's pitches${
                l === null ? '' : `, ${pctText(l)} vs LHH`
              }${r === null ? '' : `, ${pctText(r)} vs RHH`}`}
            >
              {hasSplits && (
                <>
                  <span className="pu-pct pu-pct-side">{pctText(l)}</span>
                  <UsageBar share={l ?? 0} max={max} color={color} align="right" />
                </>
              )}
              <span className="pu-mid">
                <span className="pu-badge" style={{ background: color, color: inkOn(color) }}>
                  {/* The badge grows into the full name on the way in. It is
                      absolutely placed so the columns either side of it hold
                      still while it does — the name is much wider than `SL`. */}
                  <span className="pu-abbr">{abbr}</span>
                  <span className="pu-full">{p.pitchType}</span>
                </span>
                <span className="pu-pct pu-pct-main">{pctText(p.share)}</span>
              </span>
              {hasSplits && (
                <>
                  <UsageBar share={r ?? 0} max={max} color={color} align="left" />
                  <span className="pu-pct pu-pct-side">{pctText(r)}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Run Value
// ---------------------------------------------------------------------------

/**
 * Runs, **unsigned** — the side of the chart the bar is on is what says saved
 * or allowed, exactly as `vs. LHH` / `vs. RHH` says it on the butterfly one
 * figure up. A signed `-1` printed under a head already reading `Runs allowed`
 * is the same fact twice and, worse, invites reading it as a run saved back.
 *
 * **To the tenth of a run, where Savant's own table prints whole ones.** The
 * whole run was tried first and matched that table exactly — `8` against its
 * `8`, `9` against `9` — and it is wrong *here* for a reason the table does not
 * have: Savant drops a pitch thrown ten times a season and this chart draws
 * every pitch the other two draw, so three of this pitcher's eight rows round
 * to `0` and each one prints that nought **beside a visible bar**. A capsule
 * over a zero is a row contradicting itself. The tenth costs one character in a
 * column that has room for it (measured: `25.4` is 26px of a 35px cell at the
 * narrowest width the app draws) and every row then says what its bar says.
 */
const runsText = (rv: number): string => (Math.round(Math.abs(rv) * 10) / 10).toFixed(1);

/**
 * Runs per 100 pitches, signed — this one has no side to carry its sign, being
 * down the middle. `−` is U+2212 rather than a hyphen, the same minus the
 * movement chart's inch labels use.
 */
const per100Text = (rv: number | null, count: number): string => {
  if (rv === null || !count) return '—';
  const v = (rv / count) * 100;
  const a = Math.abs(v);
  // −0.04 rounds to 0.0, and `−0.0` is a sign on a number that has none.
  if (Math.round(a * 10) === 0) return '0.0';
  // **Four characters at the outside, sign included.** The figure rides in a
  // 7.6em column that a phone narrows to 6.4em, and it shares that column with
  // the badge and the badge's mirror; `−10.5` is 32px of a 90px cell once the
  // other two have taken theirs. Past ten runs a hundred the tenth is not the
  // reading anyway — a rate that size is three pitches, and this pitcher's
  // curveball is exactly that case.
  return `${v < 0 ? '−' : '+'}${a >= 10 ? Math.round(a) : (Math.round(a * 10) / 10).toFixed(1)}`;
};

/** One side of a run-value row: a bar, or the empty half of the track.
 *
 *  **The bar element exists only on the side the run value is on.** `.pu-bar`
 *  carries a `min-width: 4px` so a capsule of no length is still visible — which
 *  is right on the butterfly, where a pitch he never throws to lefties is a fact
 *  worth a nub, and wrong here, where it would put a mark for runs allowed
 *  beside a pitch that allowed none. */
function RunValueBar({
  rv,
  max,
  color,
  side,
}: {
  rv: number | null;
  max: number;
  color: string;
  side: 'allowed' | 'saved';
}) {
  const on = rv !== null && max > 0 && (side === 'saved' ? rv > 0 : rv < 0);
  return (
    <span className={`pu-track pu-track-${side === 'allowed' ? 'right' : 'left'}`}>
      {on && (
        <span
          className="pu-bar"
          style={{ width: `${Math.min(100, (Math.abs(rv) / max) * 100).toFixed(2)}%`, background: color }}
        />
      )}
    </span>
  );
}

/**
 * **What each pitch earned him**, as the third picture on the tab: runs saved
 * growing right of the pitch, runs allowed growing left of it.
 *
 * ### Why it is here at all
 *
 * The other two charts are about the *stuff* — what he throws and where it
 * moves — and neither of them says a word about what came of it. That was the
 * one thing the per-pitch rows underneath still carried that the pictures did
 * not (a season BA/SLG/wOBA strip), and it was carried as six numbers a row
 * across five rows, which is a table nobody reads a row of. Run value is the
 * single figure those six are trying to add up to: one number per pitch, in
 * runs, already accounting for the count and the base-out state the pitch was
 * thrown in. So it draws as a picture rather than a strip, and the strip goes.
 *
 * ### Folded onto the butterfly's own row, deliberately
 *
 * A run-value row **is** a usage row — five columns, a pressable pitch badge
 * down the middle, a bar growing outward from it — with one side used at a time
 * instead of two. It shares `.pu-head` / `.pu-row`'s single grid template for
 * the reason that template exists: two sets of column widths kept in step by
 * hand is the fault it was written to avoid, and a second copy of it one figure
 * down would be that fault again. It shares `usePitchSelection` for the reason
 * the first two do — picking the slider out has to pick it out in all three, or
 * a reader has two answers to "which pitch am I looking at" on one screen.
 *
 * What genuinely differs is **which figure is the headline**: on the butterfly
 * the middle number is the season share and the sides are its two halves, where
 * here the sides carry the runs the bar is drawn from and the middle carries the
 * rate. That is a swap of emphasis, and it is the whole of `.rv-chart`.
 *
 * ### The bar is the total, and the middle figure is why
 *
 * Scaled to the largest magnitude on the chart, like `UsageBar` and for the same
 * reason: the comparison a reader makes here is between *these* pitches. The
 * total is what the bar has to be — it is the runs, and a rate would draw a
 * pitch thrown eleven times the length of one thrown a thousand. RV/100 is
 * printed beside the badge precisely because the bar cannot say it: a slider
 * worth +1.4 per hundred and a four-seamer worth +0.8 are the two readings, and
 * the bars have the four-seamer ahead on the season.
 *
 * Absent where there is nothing to draw — a game's pitches, or a server old
 * enough not to send the column — rather than a chart of dashes.
 */
export function RunValueChart({
  season,
  pitches,
  selection,
}: {
  /** Which season these are, printed before the title, the way the other two
   *  do it. */
  season: number | null;
  pitches: ChartPitch[];
  selection: PitchSelection;
}) {
  const max = useMemo(
    () => pitches.reduce((m, p) => Math.max(m, Math.abs(p.runValue ?? 0)), 0),
    [pitches],
  );

  // Nothing to draw is nothing drawn. `runValue` is null on a game's pitches and
  // on anything a pre-v8 server answers with, and a five-row chart of dashes
  // reads as a pitcher who broke even on everything rather than as a figure we
  // do not have.
  if (!pitches.some((p) => p.runValue !== null)) return null;

  return (
    <figure className="pu-chart rv-chart">
      <figcaption className="chart-title">
        {season != null && <span className="chart-title-year">{season}</span>} Run Value
      </figcaption>
      <div className="pu-head" aria-hidden="true">
        <span className="pu-head-side">Runs allowed</span>
        <span className="pu-head-mid">RV/100</span>
        <span className="pu-head-side">Runs saved</span>
      </div>
      <div className="pu-rows">
        {pitches.map((p) => {
          const { abbr, color } = pitchStyle(p.pitchType);
          const rv = p.runValue;
          const on = selection.selected === p.pitchType;
          const dim = selection.selected !== null && !on;
          // A run value of exactly 0 sits on the saved side with no bar: it has
          // to print somewhere, and "cost him nothing" is the reading.
          const saved = rv !== null && rv >= 0;
          return (
            <button
              key={p.pitchType}
              type="button"
              className={`pu-row${on ? ' on' : ''}${dim ? ' dim' : ''}`}
              {...pitchButtonProps(p.pitchType, selection)}
              title={
                rv === null
                  ? `${p.pitchType} — no run value`
                  : `${p.pitchType} — ${runsText(rv)} runs ${
                      saved ? 'saved' : 'allowed'
                    } over ${p.count} pitches (${per100Text(rv, p.count)} per 100)`
              }
            >
              <span className="pu-pct pu-pct-side">{rv !== null && !saved ? runsText(rv) : ''}</span>
              <RunValueBar rv={rv} max={max} color={color} side="allowed" />
              <span className="pu-mid">
                {/* **The badge is this chart's zero, so it has to sit on the
                    column's center** — not on the center of badge-plus-figure,
                    which is what `.pu-mid`'s flex row gives and what put the
                    two bars 175px and 95px from it on a 900px page, measured.
                    The figure is therefore laid out a second time on the badge's
                    other side and made invisible, which balances the row at any
                    width and in any font rather than declaring an offset that
                    would be right at one of them. */}
                <span className="pu-pct rv-mirror" aria-hidden="true">
                  {per100Text(rv, p.count)}
                </span>
                <span className="pu-badge" style={{ background: color, color: inkOn(color) }}>
                  <span className="pu-abbr">{abbr}</span>
                  <span className="pu-full">{p.pitchType}</span>
                </span>
                <span className="pu-pct pu-pct-main">{per100Text(rv, p.count)}</span>
              </span>
              <RunValueBar rv={rv} max={max} color={color} side="saved" />
              <span className="pu-pct pu-pct-side">{rv !== null && saved ? runsText(rv) : ''}</span>
            </button>
          );
        })}
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Movement Profile
// ---------------------------------------------------------------------------

/** The plot's own coordinate space. The rings are inches of break, and the
 *  domain is fixed at 24" the way Savant's is rather than fitted to the pitcher
 *  — a fixed grid is what lets two pitchers' charts be read against each other,
 *  and it is wide enough that only a genuine outlier lands outside the last
 *  ring (checked on a real arsenal: the widest pitch was 21"). */
const DOMAIN_IN = 24;
const RINGS_IN = [6, 12, 18, 24];
/** The rings that carry a figure — the solid ones. */
const LABELLED_IN = [12, 24];
const VIEW = 400;
const CX = VIEW / 2;
const CY = 196;
const R_PX = 156;
/**
 * The drawn box, cropped to what is actually in it.
 *
 * A disc in a 400×400 square leaves ~33 units of nothing above it and ~40
 * below, which at the width this renders is about 70px of empty SVG between the
 * title and the top of the circle — space no margin can take back, because it
 * is inside the picture. **The crop is measured against the soft disc**, which
 * is the outermost thing drawn — y = 24.4…367.6, being `R_PX` plus 2.4" of
 * margin either side of center — so 22…370 keeps all of it with the ring
 * labels (y≈44 and y≈356) comfortably inside. A first pass cut at 26 and
 * clipped 1.6 units off the top of the disc; it took a check on the *painted*
 * pixels to see it, which is the only kind that can.
 */
const VIEW_TOP = 22;
const VIEW_H = 362;
const SCALE = R_PX / DOMAIN_IN; // px per inch

const px = (inches: number) => inches * SCALE;

/** Round-trip a break in inches to a printable figure. */
const inches1 = (n: number) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}"`;

/**
 * Where the two corner marks sit, in viewBox units — and they are **solved
 * rather than nudged**, because "in the corner" is not the same as "clear of the
 * circle" and the first pass was neither.
 *
 * A mark is clear when the corner of its box **nearest the center** is more than
 * the disc's radius away: the top-*inner* corner, since both marks sit low and
 * outboard. With the disc at (200, 196) r 171.6 that gives, for the arm at
 * `ARM_SY`, a shoulder no further in than x ≈ 319 — it was at 314, six units
 * inside — and for the key a box whose inner edge stops around x ≈ 98, where its
 * *text* had been running to 100 and 18 units in. (The first check measured the
 * key's anchor rather than the end of its text, which is why it passed.)
 *
 * Every one of these clears by at least 10 units, the tightest being the ball at
 * a 70° slot, the highest the leaderboard carries.
 */
const ARM_SY = 352;
const ARM_SX = 322; // mirrored to 400 − this for a left-hander
const ARM_LEN = 34;
const CORNER_LABEL_Y = 366;
const KEY_Y = 362;

/**
 * The two figures the mark's own hit area covers, in viewBox units.
 *
 * A **thick transparent line along the arm** and a **box over the two labels**,
 * rather than one rect over the lot — and that is forced rather than fussy. A
 * single box containing both the shoulder (low and inboard) and the ball at the
 * steepest slot the leaderboard carries (70°, high and outboard) has a
 * top-*inner* corner at (316, 314), which is **165.5 units from the disc's
 * center against its 171.6 radius** — inside it. Two elements each clear it: the
 * line's closest approach is its own shoulder at 198 less 8 of half-width, and
 * the label box's inner corner (320, 354) is at 198.4.
 *
 * `pointer-events: all` in the stylesheet is what makes them hit-test at all,
 * being transparent — and it is why the strokes are 16 units wide: the drawn arm
 * is 2.5, which is a target nothing but a mouse can aim at.
 */
const ARM_HIT_W = 16;
const ARM_LABEL_W = 66;
const ARM_LABEL_Y = 354;
const ARM_LABEL_H = 28;

/**
 * The four printable figures, read once for both the mark and the panel it opens.
 *
 * Shared rather than derived twice, which is the only way the corner label and the
 * panel cannot come to state different numbers — the drift this file's comments
 * spend their time avoiding. Two rules are in here:
 *
 * **Whole degrees**, which is what Savant's own page prints and all the corner has
 * room for; a panel carrying a decimal would be the same fact reading two ways an
 * inch apart.
 *
 * **A missing release figure is 0 or absent, and either way there is none.** The
 * server writes 0 where the leaderboard's column would not parse, and a build
 * older than the field sends nothing at all — and nobody releases a ball at ground
 * level, so the line is dropped rather than printed as `0.0`.
 */
function armFigures(info: ArmAngleInfo) {
  const height = Number.isFinite(info.releaseHeight) ? info.releaseHeight : 0;
  const side = Number.isFinite(info.releaseSide) ? info.releaseSide : 0;
  return {
    deg: Math.round(info.angle),
    league: info.league === null ? null : Math.round(info.league),
    height: height > 0 ? height : null,
    side: side > 0 ? side : null,
  };
}

/**
 * His arm slot, drawn as the arm — and pressable, because the drawing is half of
 * what the leaderboard publishes about it.
 *
 * A horizontal reference from the shoulder, the arm itself at the measured
 * angle, and the ball at the end of it — so the picture *is* the number rather
 * than an illustration beside it. Savant's own figure is the angle between
 * exactly those two lines (checked: `atan2` over the shoulder and release points
 * their leaderboard publishes reproduces the printed `ball_angle` to the
 * decimal), so a drawn arm and the degrees under it cannot disagree.
 *
 * **It goes on his own side.** A right-hander's arm is toward third base, which
 * is the right of this chart, and the arm points outward from the plate — which
 * is also the direction that keeps it clear of the disc.
 *
 * ### Why it opens a panel where it used to carry a `title`
 *
 * The mark's whole affordance was an SVG `<title>` on the group, which is the
 * two failures this app has already written down once: a native tooltip is
 * **invisible on a phone**, where roughly half the traffic is, and it wants the
 * pointer to be **on the painted stroke** — 2.5 units of it, over an arm 34 long.
 * So there was nothing to see on touch and next to nothing to hit with a mouse.
 *
 * And what it said was the smaller half of what is in hand: the leaderboard
 * publishes the **release point** beside the angle and `ArmAngleInfo` has
 * carried both since it was written, read by nothing. The angle is where his arm
 * is; the release point is where the ball actually leaves it, which is the fact
 * a reader is chasing when they reach for this corner at all.
 *
 * So the group is a real target — `role="button"` with a `tabIndex`, the rule
 * the Game Log's rows and a scoreboard card already follow for an element that
 * cannot hold a `<button>` — and the reveal is the app's own **popover**
 * (`.settings-popover`, literally the box `InfoKey` and the settings gear open)
 * rather than a second thing that resembles one. A pointer opens it by hovering
 * and closes it by leaving; a finger presses it; the keyboard opens it on focus;
 * and an outside press or Escape closes it through `useDismissable`, which is
 * also what stops the dismissing press pressing whatever was under it.
 *
 * ### Two things about the handlers, both measured rather than reasoned
 *
 * **Hover is filtered on `pointerType`** rather than bound as `onMouseEnter`,
 * because Chrome dispatches the compatibility mouse events *after* a tap — so an
 * `onMouseEnter` would open on a tap's own `mouseenter` and give the press
 * something to undo a hundredth of a second later.
 *
 * **And the press only ever opens.** Filtering the hover is not enough on its
 * own: a tap's real event order is `pointerenter:touch → … → mouseenter →
 * mousedown → **focus** → mouseup → click`, so opening on focus and *toggling* on
 * the click cancel out — measured, the first tap on the mark did nothing at all
 * and the second opened it, because by then the element was already focused and
 * only the click fired. Both handlers now agree (`onOpen(true)`), which cannot
 * depend on their order. What that gives up is closing by pressing the mark a
 * second time; closing is the popover contract instead — an outside press or
 * Escape through `useDismissable`, a mouse leaving, or a blur — which is how
 * every other popover in this app closes and is one gesture either way.
 */
function ArmAngleMark({
  info,
  hand,
  open,
  onOpen,
  panelId,
}: {
  info: ArmAngleInfo;
  hand: 'R' | 'L' | null;
  open: boolean;
  onOpen: (open: boolean) => void;
  panelId: string;
}) {
  const right = hand !== 'L';
  const dir = right ? 1 : -1;
  const sx = right ? ARM_SX : VIEW - ARM_SX;
  const sy = ARM_SY;
  const rad = (info.angle * Math.PI) / 180;
  const ex = sx + dir * ARM_LEN * Math.cos(rad);
  const ey = sy - ARM_LEN * Math.sin(rad);
  const { deg, league, height, side } = armFigures(info);
  // The whole fact in words, so a screen reader gets it from the label alone and
  // nothing rides on the panel being reachable.
  const label =
    `Arm angle ${deg}° above horizontal` +
    (league === null ? '' : `, against an MLB average of ${league}°`) +
    (height === null
      ? ''
      : `. Released ${height.toFixed(1)} feet off the ground` +
        (side === null ? '' : `, ${side.toFixed(1)} feet to his arm side of the shoulder`));
  return (
    <g
      className={`mv-arm${open ? ' on' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={label}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') onOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') onOpen(false);
      }}
      onFocus={() => onOpen(true)}
      onBlur={() => onOpen(false)}
      onClick={() => onOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          // Space would scroll the tab under the reader otherwise, which is the
          // same reason the Game Log's rows swallow it. A toggle here rather than
          // an open, since focus has already opened it by the time a key can be
          // pressed — this is the keyboard's way back out, beside Escape.
          e.preventDefault();
          onOpen(!open);
        }
      }}
    >
      <line className="mv-arm-ref" x1={sx} y1={sy} x2={sx + dir * ARM_LEN} y2={sy} />
      <line className="mv-arm-line" x1={sx} y1={sy} x2={ex} y2={ey} />
      <circle className="mv-arm-ball" cx={ex} cy={ey} r="4" />
      {/* Both labels sit *below* the horizontal reference. Above it is the
          opening the arm sweeps through, and at a low slot the arm passes
          straight through where a number would go — measured at 30°, the
          degrees and the arm line were touching. */}
      <text
        className="mv-arm-deg"
        x={sx + dir * 3}
        y={CORNER_LABEL_Y}
        textAnchor={right ? 'start' : 'end'}
      >
        {`${deg}°`}
      </text>
      <text
        className="mv-arm-label"
        x={sx + dir * 3}
        y={CORNER_LABEL_Y + 12}
        textAnchor={right ? 'start' : 'end'}
      >
        ARM ANGLE
      </text>
      {/* Last, so the target is over the mark rather than under it. */}
      <line
        className="mv-arm-hit"
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        strokeWidth={ARM_HIT_W}
      />
      <rect
        className="mv-arm-hit"
        x={right ? sx - 2 : sx + 2 - ARM_LABEL_W}
        y={ARM_LABEL_Y}
        width={ARM_LABEL_W}
        height={ARM_LABEL_H}
      />
    </g>
  );
}

/**
 * What the mark says once it is opened: the slot in words, and the release point,
 * which is the half of the leaderboard's answer nothing drew before.
 *
 * It is `.settings-popover` — the app's own popover, the box `InfoKey` opens —
 * anchored to the arm's own bottom corner of the plot and sitting **above the
 * highest the ball can reach**, so it never covers the mark it belongs to. Its
 * side is the arm's side for the same reason the mark's is.
 */
function ArmAnglePanel({
  info,
  hand,
  panelId,
}: {
  info: ArmAngleInfo;
  hand: 'R' | 'L' | null;
  panelId: string;
}) {
  const right = hand !== 'L';
  const { deg, league, height, side } = armFigures(info);
  return (
    <div
      className={`settings-popover mv-arm-panel mv-arm-panel-${right ? 'right' : 'left'}`}
      id={panelId}
    >
      {/* **The figures and nothing else.** What 0° and 90° *mean* is a key —
          needed once and in the way ever after — so it lives in the chart's own
          ⓘ, which is where this app puts every other sentence of that kind. Two
          short lines here rather than four: the panel sits over a corner of the
          cloud while it is open, and every line of it is a dot the reader cannot
          see. */}
      <p>
        <strong>{`${deg}° above horizontal`}</strong>
        {league === null ? '.' : `, against an MLB average of ${league}°.`}
      </p>
      {height !== null && (
        <p>
          <strong>{`Released ${height.toFixed(1)} ft`}</strong> off the ground
          {side !== null && `, ${side.toFixed(1)} ft to his arm side of the shoulder`}.
        </p>
      )}
    </div>
  );
}

/** The hatched swatch that says what the blobs behind the clouds are, in the
 *  bottom corner the arm does not want.
 *
 *  **It says what the blobs actually are**, which is the baseline's own label
 *  rather than the word `MLB` — that was the one place the chart named the
 *  league in markup instead of reading it, and on an outing's copy it stood over
 *  blobs drawn from the pitcher's own season. */
function HatchKey({ side, label }: { side: 'left' | 'right'; label: string }) {
  const left = side === 'left';
  const cx = left ? 18 : VIEW - 18;
  return (
    <g className="mv-hatchkey" aria-hidden="true">
      <circle className="mv-hatchkey-dot" cx={cx} cy={KEY_Y} r="7" />
      <text
        className="mv-hatchkey-text"
        x={left ? cx + 12 : cx - 12}
        y={KEY_Y + 3.5}
        textAnchor={left ? 'start' : 'end'}
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Where each pitch breaks, drawn as the pitches themselves.
 *
 * **The axes need no handedness case.** `hBreak` is positive toward third base
 * and `vBreak` is positive upward for a pitcher of either hand, so a
 * right-hander's four-seam (arm-side run, +11") sits up and to the right and a
 * left-hander's sits up and to the left, which is exactly where each belongs.
 * Verified against Savant's own rendering of the same pitcher.
 *
 * **The league is a blob, not a point.** Each pitch type's MLB average is drawn
 * as a hatched ellipse the width of the league's own spread (`leagueHRange` /
 * `leagueVRange`), because "average" is a cloud too — a bare dot would invite a
 * reader to treat half an inch of daylight as a difference.
 */
export function MovementChart({
  season,
  hand,
  armAngle,
  baseline,
  pitches,
  samples,
  selection,
}: {
  /** Which season these are, printed before the title. Null on an outing's own
   *  chart — see `PitchUsageChart`. */
  season: number | null;
  /** His throwing arm. It names the league line a season chart is measured
   *  against, and on either chart it decides whether a pitch moving to his
   *  throwing side is a tail or a break. */
  hand: 'R' | 'L' | null;
  /** His arm slot, drawn in the corner. Null draws nothing. */
  armAngle: ArmAngleInfo | null;
  /** What the blob and the callouts compare against. Defaults to the league
   *  line for his hand, which is what a season chart wants; an outing overrides
   *  it with his own season. */
  baseline?: ChartBaseline;
  pitches: ChartPitch[];
  samples: MovementSample[];
  selection: PitchSelection;
}) {
  // Patterns are document-global by id, and this chart can be on screen twice
  // (a player page over a matchup team page), so the ids carry a per-instance
  // prefix rather than the pitch name alone.
  const uid = useId().replace(/:/g, '');

  // The arm mark's own reveal. Independent of the pitch selection — one state
  // for two different kinds of thing would be one of them clearing the other
  // for no reason a reader could see.
  const [armOpen, setArmOpen] = useState(false);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const closeArm = useCallback(() => setArmOpen(false), []);
  // The plot wrap is what counts as "inside", rather than the mark: the panel is
  // an HTML sibling of the SVG and the trigger is a `<g>` within it, so they are
  // two disjoint nodes and only their common parent can answer for both. It is
  // loose by exactly the width of a plot with nothing else pressable in it.
  useDismissable(armOpen, plotRef, closeArm);
  const armPanelId = `arm-${uid}`;

  const shown = useMemo(
    () => pitches.filter((p) => p.hBreak !== null && p.vBreak !== null),
    [pitches],
  );
  const types = useMemo(() => new Set(shown.map((p) => p.pitchType)), [shown]);
  // Guarded here as well as at the call site: this is exported, and a chart that
  // blanks the app rather than a cloud is too sharp an edge to leave on one
  // caller's discipline.
  const dots = useMemo(
    () => (samples ?? []).filter((s) => types.has(s.pitchType)),
    [samples, types],
  );

  if (!shown.length) return null;

  // What the baseline is called on this page. Defaulted rather than required,
  // because the season chart's own answer is a function of a prop it already
  // has: `pitchLeague.ts` is split by the pitcher's hand, so where the server
  // knows it the label names the population the figures actually come from;
  // where it doesn't, the blended table is what is being shown and the label
  // says so.
  const base: ChartBaseline = baseline ?? {
    label: hand === 'R' ? 'RHP AVG' : hand === 'L' ? 'LHP AVG' : 'LEAGUE AVG',
    short: hand === 'R' ? 'RHP avg' : hand === 'L' ? 'LHP avg' : 'Lg avg',
    key: 'MLB AVG',
    against: 'the league',
    blob: (
      <>
        The hatched blob behind each color is where the average of that pitch sits for
        pitchers of <b>his own hand</b>, drawn as wide as the league's own spread —
        average is a cloud too, so daylight narrower than the blob is not a difference.
        (A right-hander throws about two miles an hour harder than a left-hander at
        every pitch type, which is why the comparison is split.)
      </>
    ),
  };
  const avgLabel = base.label;
  const rowAvgLabel = base.short;
  // What the *cloud* can honor. A pitch with no measured break is on the usage
  // butterfly and on no part of this chart, so it lights nothing here rather
  // than dimming everything against a blob that is not drawn.
  const sel = selection.selected;
  const hot = sel !== null && types.has(sel) ? sel : null;
  const focus = hot ? (shown.find((p) => p.pitchType === hot) ?? null) : null;

  // The two callouts: how his pitch differs from the baseline behind it — the
  // league's own pitch on a season chart, his own season's on an outing's.
  // Horizontal
  // break is compared as a MAGNITUDE (its sign is only which way his arm goes),
  // where rise is signed — a lower induced break literally is more drop.
  const hDiff =
    focus && focus.baseHBreak !== null && focus.hBreak !== null
      ? Math.abs(focus.hBreak) - Math.abs(focus.baseHBreak)
      : null;
  const vDiff =
    focus && focus.baseVBreak !== null && focus.vBreak !== null
      ? focus.vBreak - focus.baseVBreak
      : null;

  // **Tail or break**, which is a fact about his arm rather than about the
  // number: a pitch moving to his throwing side tails, one moving to his glove
  // side breaks. Arm side is toward third base for a right-hander (positive
  // `hBreak`) and toward first for a left-hander. With no hand on the wire
  // there is no way to tell, and "break" is the word that is true either way.
  const armSide =
    focus === null || focus.hBreak === null || hand === null
      ? null
      : hand === 'R'
        ? focus.hBreak > 0
        : focus.hBreak < 0;
  const hWord = armSide ? 'tail' : 'break';

  // **Red is better and blue is worse**, which is the diverging scale the
  // League table's rank badge already uses (`--rank-hot` / `--rank-cold`) and
  // the one Savant's own percentile card reads in. Which *way* is better is not
  // ours to assume: a four-seamer wants more ride and a curveball wants more
  // drop, so it comes off `pitchDirections` — the same per-pitch table the
  // arsenal rows color their ▲▼ with, rather than a second opinion beside it.
  // A metric that table calls `none` (a slider's induced break sits near zero
  // by design) takes no color at all.
  const better = focus ? pitchDirections(focus.pitchType) : null;

  // **The word the vertical reading is spoken in is a fact about the pitch
  // type, not about the sign of its induced break.** A splitter's iVB is
  // usually a small *positive* number — it is thrown to fall off a fastball's
  // plane and still rises a little against a spinless path — so read off the
  // sign alone, a splitter an inch under the league's own splitter said
  // `1.0" less rise` with the color beside it saying better. Both halves were
  // right and the sentence was unreadable: nobody who throws a splitter is
  // trying to rise less, and a splitter that stays up is a splitter that hangs.
  //
  // So it comes off `pitchDirections` — the table `vTone` directly below
  // already reads, rather than a second opinion beside it. A pitch that table
  // calls `down` is spoken of in **drop** (the sinker, the curve and its
  // cousins, the changeup, the splitter, the forkball); one it calls `up` in
  // **rise** (the four-seamer). Where it calls the metric `none` — the cutter,
  // the slider, the sweeper, which sit near zero by design — there is no intent
  // to speak in and the sign genuinely is the reading, so those keep it.
  const vWord =
    better === null || better.ivb === 'none'
      ? focus !== null && focus.vBreak !== null && focus.vBreak < 0
        ? 'drop'
        : 'rise'
      : better.ivb === 'down'
        ? 'drop'
        : 'rise';
  const vTone =
    better === null || vDiff === null || better.ivb === 'none'
      ? null
      : (better.ivb === 'up') === vDiff >= 0
        ? 'better'
        : 'worse';
  // Horizontal is judged on magnitude — its sign is only which way the arm
  // goes — and more movement is the better way for every type that reads it.
  const hTone =
    better === null || hDiff === null || better.hb === 'none'
      ? null
      : hDiff >= 0
        ? 'better'
        : 'worse';

  const fx = focus?.hBreak !== null && focus?.hBreak !== undefined ? CX + px(focus.hBreak) : 0;
  const fy = focus?.vBreak !== null && focus?.vBreak !== undefined ? CY - px(focus.vBreak) : 0;

  return (
    <figure className="mv-chart">
      <figcaption className="chart-title">
        {season != null && <span className="chart-title-year">{season}</span>} Movement Profile{' '}
        <span className="chart-title-sub">(Induced Break)</span>
        <InfoKey label="How to read the movement profile" className="mv-key">
          <p>
            Every dot is a pitch he actually threw, placed by how far it broke from a
            spinless path — left and right toward the bases, up and down as{' '}
            <b>induced</b> break, which is the movement his spin creates rather than the
            drop gravity gives every pitch. The rings are inches; the solid ones are
            labeled and the dashed ones halve them.
          </p>
          {/* The one paragraph the two readings do not share: what the blob
              behind each color *is* is the whole of the difference between a
              season chart and an outing's. See `ChartBaseline`. */}
          <p>{base.blob}</p>
          {/* Gated on the mark being drawn. An outing's chart has no arm — the
              slot is a season-long figure off Savant's own leaderboard, and a
              key that explains a corner the reader is looking at and cannot see
              is worse than one paragraph shorter. */}
          {armAngle && (
            <p>
              The arm in the bottom corner is <b>his own slot</b> — how far above
              horizontal his arm is at release, where 0° is a true sidearm and 90° would
              be straight over the top. It is drawn on the side he throws from, and it
              opens onto where the ball actually leaves his hand.
            </p>
          )}
          <p>Pick a pitch below to single it out and see how it compares.</p>
        </InfoKey>
      </figcaption>

      {/* **Two blocks, and they answer two different questions.** On the left,
          what the pitch actually does — its rise or drop, its tail or break.
          On the right, how that compares with the baseline the chart is drawn
          against (the rest of his own hand on a season chart; his own season on
          an outing's). They were one run of chips saying both at once
          (`Break 3.5" · 3.0" less than league`), which reads as one fact and is
          two.

          The row holds its own height with a hidden copy of a real pitch's
          chips rather than a declared `min-height`: they wrap differently on a
          phone and a desktop, so any fixed number would be wrong at one of
          those widths and would shift the plot under the reader's finger the
          moment they picked a pitch. The ghost and the live text share **one
          grid cell** — the Columns dialog's own hint-line trick — so at rest
          the space carries the sentence that says how to fill it. */}
      <div className="mv-callouts">
        <span className="mv-callouts-ghost" aria-hidden="true">
          <span className="mv-cal-group">
            <span className="mv-cal">
              <b>0.0"</b> break
            </span>
            <span className="mv-cal">
              <b>0.0"</b> rise
            </span>
          </span>
          <span className="mv-cal-group mv-cal-vs">
            <span className="mv-cal-tag">vs {avgLabel}</span>
            <span className="mv-cal">
              <b>0.0"</b> less break
            </span>
            <span className="mv-cal">
              <b>0.0"</b> less rise
            </span>
          </span>
        </span>
        <span className="mv-callouts-live">
          {focus === null ? (
            <span className="mv-hint">Pick a pitch to compare it with {base.against}</span>
          ) : (
            <>
              <span className="mv-cal-group">
                {focus.hBreak !== null && (
                  <span className="mv-cal">
                    <b>{Math.abs(focus.hBreak).toFixed(1)}"</b> {hWord}
                  </span>
                )}
                {focus.vBreak !== null && (
                  <span className="mv-cal">
                    <b>{Math.abs(focus.vBreak).toFixed(1)}"</b>{' '}
                    {/* **This half stays on the sign, where the half beside it
                        stays on the pitch.** It is the measurement — what the
                        ball did against a spinless path — and a splitter with
                        +2.0" of induced break does not drop two inches,
                        whatever it is thrown for. Saying `2.0" drop` here to
                        agree with `1.5" more drop` next door would buy the
                        agreement with a false reading, and this app's rule is
                        that the number and the word have to be the same claim.
                        The pair reads as what it is: it rises two inches, and
                        that is an inch and a half more drop than the league's
                        own splitter. */}
                    {focus.vBreak >= 0 ? 'rise' : 'drop'}
                  </span>
                )}
              </span>
              <span className="mv-cal-group mv-cal-vs">
                <span className="mv-cal-tag">vs {avgLabel}</span>
                {hDiff !== null && (
                  <span className={`mv-cal${toneClass(hTone)}`}>
                    <b>{Math.abs(hDiff).toFixed(1)}"</b> {hDiff >= 0 ? 'more' : 'less'} {hWord}
                  </span>
                )}
                {vDiff !== null && focus.vBreak !== null && (
                  <span className={`mv-cal${toneClass(vTone)}`}>
                    <b>{Math.abs(vDiff).toFixed(1)}"</b>{' '}
                    {/* "more" and "less" are said of the quantity `vWord` just
                        named, which flips with it: a curveball above the
                        league's induced break has LESS drop, not more rise. */}
                    {(vWord === 'rise' ? vDiff >= 0 : vDiff < 0) ? 'more' : 'less'} {vWord}
                  </span>
                )}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="mv-plot-wrap" ref={plotRef}>
        {/* **The arrow is outboard of its label, in the direction it means** —
            above `More rise` and below `More drop`. It reads as one word with
            the label and it was drawn as one: `More rise ▲` in a 4.4em box
            wraps, so the ▲ fell onto a second line *under* the words, and
            `▼ More drop` put its ▼ on a first line *above* them. Both arrows
            pointed away from the half of the plot they name. Its own block is
            what fixes it rather than the source order alone: a wrapped inline
            arrow lands wherever the line break puts it. */}
        <span className="mv-axis-side mv-axis-rise" aria-hidden="true">
          <span className="mv-axis-arrow">▲</span>
          More rise
        </span>
        <span className="mv-axis-side mv-axis-drop" aria-hidden="true">
          More drop
          <span className="mv-axis-arrow">▼</span>
        </span>

        <svg
          className="mv-svg"
          viewBox={`0 ${VIEW_TOP} ${VIEW} ${VIEW_H}`}
          role="img"
          aria-label={`Movement profile: ${shown
            .map((p) => `${p.pitchType} breaks ${inches1(p.hBreak ?? 0)} horizontally and ${inches1(p.vBreak ?? 0)} vertically`)
            .join('; ')}`}
        >
          <defs>
            {/* The key's own swatch: the same 45° hatch the blobs carry, but in
                the neutral, since it stands for all five rather than for one. */}
            <pattern
              id="mv-hatch-key"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--muted)" strokeWidth="2" opacity="0.6" />
            </pattern>
            {shown.map((p) => {
              const { color } = pitchStyle(p.pitchType);
              return (
                <pattern
                  key={p.pitchType}
                  id={`hatch-${uid}-${p.pitchType.replace(/\W/g, '')}`}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2.4" opacity="0.5" />
                </pattern>
              );
            })}
          </defs>

          {/* The field: a soft disc a little past the last ring, so a pitch that
              breaks more than 24" still lands on something. */}
          <circle className="mv-field" cx={CX} cy={CY} r={R_PX + px(2.4)} />

          {RINGS_IN.map((n) => (
            <circle
              key={n}
              className={`mv-ring${n % 12 === 0 ? '' : ' mv-ring-half'}`}
              cx={CX}
              cy={CY}
              r={px(n)}
            />
          ))}
          <line className="mv-axis" x1={CX - R_PX} y1={CY} x2={CX + R_PX} y2={CY} />
          <line className="mv-axis" x1={CX} y1={CY - R_PX} x2={CX} y2={CY + R_PX} />

          {/* Only the solid rings are labeled — the dashed ones halve them, so
              the scale reads without eight figures crowding the middle, which is
              exactly where the pitches are. Savant labels the inner rings on one
              side only; symmetric is the better answer here, since which side is
              crowded depends on the pitcher's hand. */}
          {LABELLED_IN.map((n) => (
            <g key={`lbl-${n}`} className="mv-ring-label">
              <text x={CX - px(n)} y={CY - 6} textAnchor="middle">{`${n}"`}</text>
              <text x={CX + px(n)} y={CY - 6} textAnchor="middle">{`${n}"`}</text>
              <text x={CX - 6} y={CY - px(n) + 4} textAnchor="end">{`${n}"`}</text>
              <text x={CX - 6} y={CY + px(n) + 4} textAnchor="end">{`${n}"`}</text>
            </g>
          ))}

          {/* League averages, behind the pitcher's own dots. */}
          {shown.map((p) => {
            if (p.baseHBreak === null || p.baseVBreak === null) return null;
            // The spread is always filled by the current server (there is a
            // default behind it), so this only bites in the window where a new
            // client is talking to an older build. A blob whose width we cannot
            // state is not drawn at all — `rx="NaN"` is an invalid attribute
            // that silently paints nothing anyway, and "we don't know how wide
            // the league is here" is the honest reading of a missing field.
            if (p.baseHRange === null || p.baseVRange === null) return null;
            const dim = hot !== null && hot !== p.pitchType;
            return (
              <ellipse
                key={`lg-${p.pitchType}`}
                className={`mv-league${dim ? ' dim' : ''}`}
                cx={CX + px(p.baseHBreak)}
                cy={CY - px(p.baseVBreak)}
                rx={px(p.baseHRange)}
                ry={px(p.baseVRange)}
                fill={`url(#hatch-${uid}-${p.pitchType.replace(/\W/g, '')})`}
              />
            );
          })}

          {/* The cloud. Sorted so the highlighted type paints last and no other
              type's dot can sit on top of the one being read. */}
          {[...dots]
            .sort((a, b) => Number(a.pitchType === hot) - Number(b.pitchType === hot))
            .map((s, i) => {
              const { color } = pitchStyle(s.pitchType);
              const dim = hot !== null && hot !== s.pitchType;
              return (
                <circle
                  key={i}
                  className={`mv-dot${dim ? ' dim' : ''}`}
                  cx={CX + px(s.hBreak)}
                  cy={CY - px(s.vBreak)}
                  r="5.5"
                  fill={color}
                  stroke={darken(color)}
                />
              );
            })}

          {/* The selected pitch's own average. The two dashed legs to the axes
              went with the figures they were measuring: those read in the
              callout row above, so the legs were decorating a decomposition
              nobody had to do on the plot — and near the origin they collapsed
              into two specks behind the marker. */}
          {focus && focus.hBreak !== null && focus.vBreak !== null && (
            <g className="mv-focus">
              <circle
                className="mv-avg"
                cx={fx}
                cy={fy}
                r="15"
                stroke={pitchStyle(focus.pitchType).color}
              />
              <text className="mv-avg-text" x={fx} y={fy + 4} textAnchor="middle">
                AVG
              </text>
            </g>
          )}

          {/* **The two corners the circle leaves empty.** The plot is a disc in a
              box, so below the widest point each bottom corner opens up — about
              100 viewBox units of clear space at the level these sit at. The arm
              goes on his own side (a right-hander's arm is toward third base,
              which is the right of this chart) and the hatch key opposite it. */}
          {armAngle && (
            <ArmAngleMark
              info={armAngle}
              hand={hand}
              open={armOpen}
              onOpen={setArmOpen}
              panelId={armPanelId}
            />
          )}
          <HatchKey side={hand === 'L' ? 'right' : 'left'} label={base.key} />
        </svg>

        {armAngle && armOpen && (
          <ArmAnglePanel info={armAngle} hand={hand} panelId={armPanelId} />
        )}
      </div>

      {/* Under the plot rather than over it: it names the horizontal axis, and
          the axis is at the bottom of the reader's eye by the time they want
          it — where above the circle it was a line of chrome between the title
          and the thing the title names. */}
      <div className="mv-axis-foot" aria-hidden="true">
        <span>1B ◀</span> MOVES TOWARD <span>▶ 3B</span>
      </div>

      <div className="mv-legend">
        <div className="mv-legend-labels" aria-hidden="true">
          <span>Usage</span>
          <span>MPH</span>
          <span>{rowAvgLabel}</span>
        </div>
        <div className="mv-legend-cols">
          {shown.map((p) => {
            const { abbr, color } = pitchStyle(p.pitchType); // color: the swatch
            const on = hot === p.pitchType;
            const dim = hot !== null && !on;
            return (
              <button
                key={p.pitchType}
                type="button"
                className={`mv-legend-col${on ? ' on' : ''}${dim ? ' dim' : ''}`}
                aria-label={p.pitchType}
                {...pitchButtonProps(p.pitchType, selection)}
              >
                {/* The abbreviation at rest and the whole name when it is the
                    one being read — five full pitch names across a 470px chart
                    is a legend that wraps `4-Seam Fastball` onto two lines and
                    pushes the numbers under it apart, and only one column is
                    ever the answer to a question. The full name is absolutely
                    placed so the grid holds still while it appears, and it may
                    overhang its neighbors, which are dimmed at that moment
                    anyway. Same move the usage badge makes. */}
                <span className="mv-legend-name">
                  {/* Not in the pitch's own color: this palette is built to
                      be a *fill* with computed ink over it (see `inkOn`), and as
                      text several of its members fail outright — measured
                      against the two themes' card grounds, 4 of the 15 land
                      under 3:1 somewhere (FC 2.28/2.06, KC 2.23/2.02, FF and KN
                      3.21/2.91 on Midnight/Lavender). Coloring the label would
                      leave a cutter and a knuckle curve unreadable to buy the
                      others nothing the swatch below does not already say —
                      which is where the color belongs. (Measured again when
                      Lavender went from a light theme to graphite: on the pale
                      page it was 6 of 9 in a real arsenal, and the conclusion
                      is the one that survived.) */}
                  <span className="mv-legend-abbr">{abbr}</span>
                  <span className="mv-legend-full">{p.pitchType}</span>
                </span>
                <span className="mv-legend-swatch" style={{ background: color }} />
                <span className="mv-legend-val">{pctText(p.share)}</span>
                <span className="mv-legend-val">{p.velo === null ? '—' : p.velo.toFixed(1)}</span>
                <span className="mv-legend-val mv-legend-lg">
                  {p.baseVelo === null ? '—' : p.baseVelo.toFixed(1)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// One outing, read against his season
// ---------------------------------------------------------------------------

/**
 * The **same two pictures for one night's work** — what he threw in this game,
 * and where it moved, with his own season in the place the league occupies on
 * his player page.
 *
 * ### Why the baseline moves and nothing else does
 *
 * A season chart answers *what kind of pitcher is this*, and the population
 * worth answering it against is the rest of the league. An outing answers a
 * different question with the same shapes — *was tonight his usual stuff* — and
 * the only baseline that can answer it is the pitcher himself. Against the
 * league, a night on which a good pitcher's slider lost three inches still reads
 * as an above-average slider, which is the fact and not the question. So the
 * charts are handed his season as the baseline (`gameChartPitches`) and told
 * what to call it (`GAME_BASELINE`); every other rule — the butterfly's one
 * scale, the cloud's outlines, the shared selection, what is lit and what a
 * press means — is the same code and cannot drift from the page next door.
 *
 * ### The cloud is every pitch, not a sample
 *
 * The season plot draws **one dot per percent** of his pitches, because a
 * starter throws 2,000+ a season and past a few hundred dots a cloud says less
 * rather than more. A game is already bounded by a pitch count — 95 on a long
 * start, a dozen for a reliever — so there is nothing to sample: every pitch he
 * threw is a dot, and the densities are the usage for free.
 *
 * That is also why the pitches have to arrive per pitch rather than per type.
 * `PitchMix` has carried a game's mean break since it was written and a mean
 * cannot say how *tight* tonight's sliders were, which on a one-game chart is
 * most of the reading — so `Pitch` carries `hBreak`/`vBreak` and the cloud is
 * built from the batters he faced.
 *
 * ### No arm, and no year on the titles
 *
 * The arm slot is a **season** figure off Savant's own arm-angle leaderboard —
 * there is no such thing as tonight's slot — so drawing it here would be a
 * season fact in the corner of a chart whose whole claim is that it is about one
 * game, and it would cost the outing page a Savant read for a corner. The corner
 * is left to the hatch key alone, which is what a chart with no arm angle
 * already does. The titles drop their year for the same reason: `2026 Pitch
 * Usage` over one afternoon's pitches names the wrong span.
 */
const GAME_BASELINE: ChartBaseline = {
  label: 'SEASON AVG',
  short: 'Season',
  key: 'SEASON AVG',
  against: 'his season',
  blob: (
    <>
      The hatched blob behind each color is where that pitch usually sits{' '}
      <b>for him</b>, over his whole season, drawn as wide as his own pitch-to-pitch
      spread — his slider is a cloud over a season too, so a single dot outside the
      blob is an ordinary miss. What says something is the shape of the night: a
      cloud sitting off its blob, or spread much wider than it.
    </>
  ),
};

/**
 * A game's pitches as movement points, one per pitch.
 *
 * Off `facedBatters` rather than a list of its own: those are the same pitches
 * the game's `PitchMix` is aggregated from, and a second array beside them would
 * be two answers to what he threw. A pitch with no type or no measured break is
 * dropped — Statcast misses one now and then, and a dot at the origin is a claim
 * that a pitch did not move.
 */
export function gameMovementSamples(pg: PitcherGame): MovementSample[] {
  const out: MovementSample[] = [];
  for (const fb of pg.facedBatters) {
    for (const p of fb.pitches) {
      if (!p.pitchType || p.hBreak === null || p.vBreak === null) continue;
      out.push({ pitchType: p.pitchType, hBreak: p.hBreak, vBreak: p.vBreak });
    }
  }
  return out;
}

/** The outing's Arsenal tab: the usage butterfly and the movement cloud, both
 *  for this game and both read against his season. See `GAME_BASELINE`. */
export function GameArsenalCharts({
  pg,
  hand,
}: {
  pg: PitcherGame;
  /** Which arm he throws with, off his report — MLB's own code, so it is a bare
   *  `string` and is narrowed here rather than at the call site. It decides
   *  whether a pitch moving to his throwing side is called a tail or a break;
   *  the baseline labels are his season's either way. */
  hand: string | null;
}) {
  const selection = usePitchSelection();
  const arm = hand === 'R' || hand === 'L' ? hand : null;
  const pitches = useMemo(() => gameChartPitches(pg.pitchMix), [pg.pitchMix]);
  const vsRight = useMemo(
    () => (pg.vsRight ? gameChartPitches(pg.vsRight.pitchMix) : null),
    [pg.vsRight],
  );
  const vsLeft = useMemo(
    () => (pg.vsLeft ? gameChartPitches(pg.vsLeft.pitchMix) : null),
    [pg.vsLeft],
  );
  const samples = useMemo(() => gameMovementSamples(pg), [pg]);
  if (!pg.pitchMix.length) return null;
  return (
    <div className="arsenal-charts">
      <PitchUsageChart
        season={null}
        pitches={pitches}
        vsRight={vsRight}
        vsLeft={vsLeft}
        selection={selection}
      />
      <MovementChart
        season={null}
        hand={arm}
        armAngle={null}
        baseline={GAME_BASELINE}
        pitches={pitches}
        samples={samples}
        selection={selection}
      />
    </div>
  );
}
