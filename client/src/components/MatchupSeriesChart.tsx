import { useLayoutEffect, useMemo, useState } from 'react';
import { ScrubCross, ScrubTip, useChartScrub } from './chartScrub';
import type { EspnCategory, EspnMatchupSeries, EspnStandingsTeam } from '../types';

/**
 * **How one category moved through a matchup period, both sides, day by day.**
 *
 * A scoreboard cell is one number and the week that produced it is not: `R
 * 31–23` says who is ahead and nothing about how, and a lead built on the
 * Monday reads identically to one taken on the Saturday. Only the second is
 * still worth doing something about.
 *
 * Every figure here is a **running total after that day**, which is the only
 * reading that ends where the card above it does. It ends *near* it rather than
 * on it once a week has been played through: measured on the live league,
 * 101 of a week's 120 cells reproduce the card exactly and the other 19 are a
 * unit or two under it, ESPN's per-player accrual counting a day our snapshot of
 * that day has the player benched on. That is the server's to answer for and it
 * cannot — see *ESPN scoreboard*, **And it stops reproducing the card as a week
 * wears on**.
 *
 * ## The house style, which is `RollingXwoba`'s
 *
 * **Labels are sized in rendered pixels, not viewBox units.** A viewBox unit is
 * a different number of pixels in every box this is drawn in — the dialog is
 * 800px wide on a desktop and 358 on a phone — so an axis label declared in
 * units renders at two sizes and is unreadable at one of them. `--mser-font`
 * carries the unit count that renders at `LABEL_PX` whatever the width,
 * published from a `ResizeObserver` exactly as `--roll-font` is.
 *
 * **`touch-action: pan-y` on the plot** (in the stylesheet), so a thumb landing
 * on the chart still scrolls the dialog under it. That was a real reported bug
 * on the rolling chart and is not repeated here — and it is what lets a finger
 * *scrub* the chart at all, the drag and the scroll differing in axis.
 *
 * **The scrub itself is `chartScrub`'s**, shared with the rolling chart rather
 * than written twice: the hit test, the crosshair and the readout box are one
 * object now and what is this chart's own is what a matchup day *says* — both
 * sides' running totals at that day, in the two colors the lines already carry,
 * over the date they belong to.
 *
 * **A legend under the chart rather than labels inside the plot**, for the
 * reason that one records: a label painted at the end of a line sits exactly
 * where the *other* line is most likely to be.
 *
 * ## Color
 *
 * The app's rule is that color marks **state**, and the scoreboard's own state
 * is who is winning the category: `--win` for the side ahead at the end,
 * `--muted` for the other. So the two series are the two colors the card's
 * own cells already use, and the reader does not have to learn a second key.
 * A tie is two muted lines, which is what a tie looks like.
 */

/** The viewBox. Everything below is in these units; the labels are not. */
const VBW = 720;
const VBH = 300;
/** What an axis label renders at, in CSS pixels, at any width. */
const LABEL_PX = 12;
/** How far below the plot an x tick's baseline sits, in ems of its own size —
 *  enough to clear the y labels' own descent under the bottom gridline. */
const X_TICK_BASELINE_EM = 1.6;
/** The clear space two neighboring x tick labels must keep, in ems of their own
 *  size. Three quarters of a character-height reads as a gap at every width
 *  this is drawn at; see the tick-density note below for what it replaces. */
const X_LABEL_GAP_EM = 0.75;

function padFor(fontU: number) {
  return {
    // The widest y label this can print, with slack — `12.60` and `.941` are
    // both four or five tabular characters.
    left: fontU * 3 + 10,
    right: Math.max(22, fontU),
    top: 16,
    bottom: fontU * X_TICK_BASELINE_EM + 8,
  };
}

/** A category's own notation, which is the card's — see `fmtValue` there. This
 *  one has to round to something an axis can hold, so it is the same rule with
 *  the count case left alone. */
function fmtAxis(v: number, cat: EspnCategory): string {
  if (cat.format === 'avg') {
    const s = v.toFixed(3);
    return v < 1 && v >= 0 ? s.replace(/^0/, '') : s;
  }
  if (cat.format === 'rate') return v.toFixed(2);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** `Aug 12` — the axis wants the day, and the year is the season's. */
function shortDate(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

interface Line {
  teamId: number;
  label: string;
  /** Index-aligned with the days, null where the series does not know. */
  values: (number | null)[];
  leading: boolean;
}

export function MatchupSeriesChart({
  series,
  category,
  teamIds,
  teams,
}: {
  series: EspnMatchupSeries;
  category: EspnCategory;
  /** The sides of this matchup, in the order the card draws them. A **bye** is
   *  one of them, which is a real shape rather than a failure — the chart is
   *  then one line and says so in its legend. */
  teamIds: number[];
  teams: Map<number, EspnStandingsTeam>;
}) {
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  // Measured in a layout effect so the first paint already has it, and kept
  // true by a `ResizeObserver`. It cannot loop: the box is `width: 100%` of a
  // column this value does not touch.
  useLayoutEffect(() => {
    if (!wrapEl) return;
    const read = () => setScale(wrapEl.clientWidth / VBW);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, [wrapEl]);
  const fontU = scale > 0 ? LABEL_PX / scale : 11;
  /**
   * **The widest x tick label this chart will print, in viewBox units.**
   *
   * How many days the axis can name is a function of how wide one of their
   * names is, and that is not a number this file gets to declare: the face is
   * the app's, the month is the season's (`Sep 1` and `Aug 31` are not the same
   * width even with `tabular-nums`, which only evens up the digits), and the
   * unit is a different number of pixels in every box this is drawn in. So
   * every day's label is laid out once in a hidden group and the widest one is
   * measured off it — the same rule `--roll-font`, `--clip-w` and
   * `--chart-tip-nudge` already follow.
   *
   * **It cannot loop**, which is the test a measure-then-lay-out pass has to
   * pass: the probe draws *every* day unconditionally, so what it measures does
   * not depend on the `dayStep` it feeds. 0 until the first measurement, which
   * is the one paint the old constant still serves.
   */
  const [probeEl, setProbeEl] = useState<SVGGElement | null>(null);
  const [labelW, setLabelW] = useState(0);
  const PAD = padFor(fontU);
  const PLOT_W = VBW - PAD.left - PAD.right;
  const PLOT_H = VBH - PAD.top - PAD.bottom;

  const lines = useMemo<Line[]>(() => {
    // Whoever is ahead **at the last day both sides are known for**, which is
    // the same comparison the card makes and so the same color.
    const raw = teamIds.map((teamId) => ({
      teamId,
      // **The full name, not the abbreviation.** The legend is the one place
      // this chart says whose line is whose, and it sits *under* the plot with
      // a whole row to itself — so there is room for the name a manager
      // actually knows his leaguemates by, where `B&T` is a thing you have to
      // decode. The row wraps (`flex-wrap` on `.mser-legend`, `nowrap` inside
      // each item), so two long names stack rather than overflowing. The
      // abbreviation stays as the fallback for a team with no name at all.
      label: teams.get(teamId)?.name || teams.get(teamId)?.abbrev || `Team ${teamId}`,
      values: series.teams[teamId]?.[category.statId] ?? [],
    }));
    let leader: number | null = null;
    if (raw.length === 2) {
      for (let i = Math.min(raw[0].values.length, raw[1].values.length) - 1; i >= 0; i--) {
        const a = raw[0].values[i];
        const b = raw[1].values[i];
        if (typeof a !== 'number' || typeof b !== 'number' || a === b) continue;
        leader = (category.lowerBetter ? a < b : a > b) ? raw[0].teamId : raw[1].teamId;
        break;
      }
    }
    return raw.map((r) => ({ ...r, leading: leader === r.teamId }));
  }, [series, category, teamIds, teams]);

  const days = series.days;
  const known = days.filter((d) => d.ok).length;

  useLayoutEffect(() => {
    if (!probeEl) return;
    let w = 0;
    for (const t of probeEl.querySelectorAll('text')) w = Math.max(w, t.getBBox().width);
    setLabelW(w);
  }, [probeEl, fontU, days]);

  /**
   * The axis, in **round numbers**.
   *
   * Three intervals over a `nice` step, so the four gridlines land on figures a
   * reader recognizes — `0 · 12 · 24 · 36` rather than the `0 · 11.9 · 23.8 ·
   * 35.6` a bare min-to-max range produces. A counting category is anchored at
   * **zero** besides, which is what makes the shape of a week readable: a run
   * of home runs from 9 to 13 drawn on its own range is a cliff, and on a zero
   * axis it is four home runs.
   */
  const { yMin, step } = useMemo(() => {
    const vs: number[] = [];
    for (const l of lines) for (const v of l.values) if (typeof v === 'number') vs.push(v);
    if (vs.length === 0) return { yMin: 0, step: 1 };
    let lo = Math.min(...vs);
    let hi = Math.max(...vs);
    if (category.format === 'count') lo = Math.min(0, lo);
    if (hi === lo) hi = lo + (category.format === 'count' ? 1 : 0.1);
    // A counting category is whole numbers, so its step is one at the least.
    const min = category.format === 'count' ? 1 : 0;
    const raw = Math.max((hi - lo) / 3, min, 1e-9);
    const mag = 10 ** Math.floor(Math.log10(raw));
    // **The step has to *cover* the range as well as be round**, and the
    // rounding is what can leave it short: the bottom line is snapped down to a
    // multiple of the step, so three intervals from there need not reach the
    // top. Walking the ladder until it does is one line and makes clipping a
    // point off the plot impossible rather than unlikely.
    const ladder = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 15, 20];
    let st = Math.max(min, mag);
    let base = Math.floor(lo / st) * st;
    for (const m of ladder) {
      st = Math.max(min, m * mag);
      base = Math.floor(lo / st) * st;
      if (st >= raw && base + st * 3 >= hi) break;
    }
    return { yMin: base, step: st };
  }, [lines, category]);
  const yMax = yMin + step * 3;

  const sx = (i: number) =>
    PAD.left + (days.length <= 1 ? PLOT_W / 2 : (i / (days.length - 1)) * PLOT_W);
  const sy = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H;

  /**
   * **Which days each line is actually drawn on.**
   *
   * Two different things read as a null here and only one of them poisons what
   * comes after it:
   *
   *  - **A day ESPN would not answer for** is a hole in the running total, so
   *    every day past it is not a missing point but a wrong one. The server
   *    already marks those `ok: false` from the first failure on, so the
   *    drawable window is the `ok` days — `known`, which is a prefix by
   *    construction.
   *  - **A rate with no denominator yet** is not a hole at all. A team whose
   *    pitchers recorded no outs on the Monday has no ERA *on the Monday* and a
   *    perfectly good one from the Tuesday, the running components being
   *    cumulative — so the null is a **leading** gap, and the line starts where
   *    the category starts existing.
   *
   * Conflating the two cost a whole team its line: measured on the live league,
   * week 19's `Earned run average` and `Walks and hits per inning` for
   * WAXM vs GREG drew **one path and one legend figure** — Cochabamba Crushers'
   * `values[0]` was null (no outs on Aug 10), the old walk stopped at zero, and
   * a chart whose whole job is to set two sides against each other showed one.
   *
   * So this is the list of days the plot stands behind rather than a count, and
   * the path breaks at any gap inside it rather than jumping one. The scrub and
   * the legend read the same list, because a readout printing a figure the plot
   * has declined to draw says in words what the line refuses to.
   */
  const drawn = lines.map((l) => {
    const idx: number[] = [];
    for (let i = 0; i < known; i++) if (typeof l.values[i] === 'number') idx.push(i);
    return idx;
  });
  const pathOf = (l: Line, idx: number[]) => {
    const pts: string[] = [];
    let prev = -2;
    for (const i of idx) {
      pts.push(
        `${i === prev + 1 ? 'L' : 'M'}${sx(i).toFixed(2)} ${sy(l.values[i] as number).toFixed(2)}`,
      );
      prev = i;
    }
    return pts.join(' ');
  };

  // Four gridlines, at the ends and two between, labeled in the category's own
  // notation.
  const ticks = [0, 1, 2, 3].map((k) => yMin + step * k);
  /**
   * Which days get a label — **and how many fit is measured, not declared.**
   *
   * This was `ceil(days.length / 7)` on the reasoning that "the axis has room
   * for about seven at the narrow end", and seven is a desktop number: it is a
   * count of labels asked of a plot whose *width* is not in the arithmetic at
   * all. Measured on the live league's fortnight, week 19, before the change —
   * seven `Aug NN` labels at every width, and at **390** the six gaps between
   * them were `4.8 · 4.8 · 4.7 · 4.7 · 4.8 · −14.3px`, the last pair genuinely
   * overlapping; at **320** the tightest was **−24.9px**. Only 1200, where the
   * gaps ran 35.9–56.1px, was ever the case the constant described.
   *
   * So the step is the one that satisfies the collision the axis can actually
   * have. Labels are drawn at `dayStep` apart in days, which is
   * `dayStep · PLOT_W / (days.length − 1)` in viewBox units; the tightest pair
   * on the axis is the **last** one, where an end-anchored label sits beside a
   * centered one and so needs one and a half label widths plus a gap. The label
   * width is `--mser-font`'s own problem — a font this app does not choose,
   * printing a month name whose width is not a function of anything here — so
   * it is read off the rendered text (`labelW`, below) rather than declared,
   * which is `--roll-font`'s and `--chart-tip-nudge`'s rule.
   *
   * Walked **back from the last day** rather than forward from the first, which
   * is what keeps the spacing even *and* always labels the day the reader cares
   * most about. Forward, an eight-day week labeled 10 · 12 · 14 · 16 and then
   * forced the 17th on as well, so the two ran together at the right edge of a
   * phone.
   */
  const spanU = days.length > 1 ? PLOT_W / (days.length - 1) : PLOT_W;
  const dayStep =
    labelW > 0 && days.length > 1
      ? Math.min(
          days.length - 1,
          Math.max(1, Math.ceil((labelW * 1.5 + fontU * X_LABEL_GAP_EM) / spanU)),
        )
      : // The first paint, before the probe below has been measured. The old
        // constant, which is right at the width this is usually opened at.
        Math.ceil(days.length / 7);
  const tickIdx: number[] = [];
  for (let i = days.length - 1; i >= 0; i -= dayStep) tickIdx.unshift(i);

  /**
   * **The day under the pointer, and what both sides had after it.**
   *
   * The x axis is about seven labels wide on a fortnight, so most of the days
   * on this plot are drawn and never named — which is the whole of the reading
   * a manager comes here for ("when did that lead go?"). The scrub names every
   * one of them.
   *
   * The readout anchors on the **higher** of the two points, so the box sits
   * above both lines rather than over the one it is describing; where neither
   * side is known for that day it anchors at the top of the plot, which is
   * where a box saying `—` belongs.
   */
  const { svgRef, idx: at, scrubProps } = useChartScrub(days.length, {
    left: PAD.left,
    plotW: PLOT_W,
    vbw: VBW,
  });
  const marks =
    at === null
      ? []
      : lines.map((l, k) => (drawn[k].includes(at) ? (l.values[at] as number) : null));
  const markYs = marks.filter((v): v is number => v !== null).map(sy);

  if (days.length === 0) {
    return (
      <p className="mser-none">
        ESPN has no days for this matchup period yet, so there is nothing to
        chart.
      </p>
    );
  }

  return (
    <>
      <div className="mser-chart-wrap" ref={setWrapEl}>
        <svg
          ref={svgRef}
          className="mser-chart"
          style={{ '--mser-font': `${fontU.toFixed(2)}px` } as React.CSSProperties}
          viewBox={`0 0 ${VBW} ${VBH}`}
          role="img"
          aria-label={`${category.name} through the matchup, day by day`}
          {...scrubProps}
        >
          {/* Every day's label, laid out and never painted, so `labelW` can be
              read off the widest of them — see the note on `labelW`. `getBBox`
              answers for a `visibility: hidden` box, which `display: none`
              would not. */}
          <g className="mser-axis-label mser-probe" ref={setProbeEl} aria-hidden="true">
            {days.map((d, i) => (
              <text key={d.scoringPeriod} x={0} y={0}>
                {shortDate(d.date, `Day ${i + 1}`)}
              </text>
            ))}
          </g>
          {ticks.map((t, k) => (
            <g key={k}>
              <line
                className="mser-grid"
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={sy(t)}
                y2={sy(t)}
              />
              <text
                className="mser-axis-label"
                x={PAD.left - 8}
                y={sy(t)}
                textAnchor="end"
                dy="0.32em"
              >
                {fmtAxis(t, category)}
              </text>
            </g>
          ))}
          {tickIdx.map((i) => (
            <text
              key={days[i].scoringPeriod}
              className="mser-axis-label"
              x={sx(i)}
              y={PAD.top + PLOT_H + fontU * X_TICK_BASELINE_EM}
              textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
            >
              {shortDate(days[i].date, `Day ${i + 1}`)}
            </text>
          ))}
          {lines.map((l, k) => (
            <g key={l.teamId}>
              <path className={`mser-line${l.leading ? ' mser-win' : ''}`} d={pathOf(l, drawn[k])} />
              {drawn[k].map((i) => (
                <circle
                  key={days[i].scoringPeriod}
                  className={`mser-dot${l.leading ? ' mser-win' : ''}`}
                  cx={sx(i)}
                  cy={sy(l.values[i] as number)}
                  r={3}
                />
              ))}
            </g>
          ))}
          {at !== null && (
            <>
              <ScrubCross x={sx(at)} top={PAD.top} bottom={PAD.top + PLOT_H} />
              {/* The marker is each line's own dot a size up and ringed in the
                  panel's ground, so it reads as *that* team's point picked out
                  rather than as a third mark — the rolling chart's `.roll-dot`
                  does the same against its one accent line. */}
              {marks.map((v, k) =>
                v === null ? null : (
                  <circle
                    key={lines[k].teamId}
                    className={`mser-dot mser-mark${lines[k].leading ? ' mser-win' : ''}`}
                    cx={sx(at)}
                    cy={sy(v)}
                    r={5}
                  />
                ),
              )}
            </>
          )}
        </svg>
        {at !== null && (
          <ScrubTip
            x={sx(at)}
            y={markYs.length ? Math.min(...markYs) : PAD.top}
            vbw={VBW}
            vbh={VBH}
          >
            {/* **Both sides on one line, in the order the card draws them and in
                the colors the plot already gave them** — the same shape the
                scoreboard cell this chart opened from has (`R 31–23`), so the
                readout is that cell for one day rather than a second notation
                to learn. A side the series cannot answer for draws the dash it
                draws everywhere else. */}
            <span className="chart-tip-val">
              {lines.map((l, k) => (
                <span key={l.teamId}>
                  {k > 0 && <span className="mser-tip-sep">–</span>}
                  <span className={`mser-tip-side${l.leading ? ' mser-win' : ''}`}>
                    {marks[k] === null ? '—' : fmtAxis(marks[k] as number, category)}
                  </span>
                </span>
              ))}
            </span>
            <span className="chart-tip-sub">{shortDate(days[at].date, `Day ${at + 1}`)}</span>
          </ScrubTip>
        )}
      </div>
      {/* A legend under the chart, never a label inside the plot — the one
          place a label is guaranteed to sit over the other line. */}
      <div className="mser-legend">
        {lines.map((l, k) => {
          // **The last figure the *plot* stands behind**, which is the same
          // `drawn` the path and the readout are drawn from rather than the
          // last number anywhere in the array. On the real shape of a gap the
          // two agree — ESPN's unreadable day carries no value either — but
          // reading the array directly is a way for the legend to print a total
          // the lines have already stopped short of, and now that `drawn` is
          // computed once there is no reason to leave it open.
          const end = drawn[k];
          const last = end.length > 0 ? (l.values[end[end.length - 1]] as number) : undefined;
          return (
            <span className="mser-legend-item" key={l.teamId}>
              <svg
                className={`mser-legend-swatch${l.leading ? ' mser-win' : ''}`}
                viewBox="0 0 24 2"
                width="24"
                height="2"
                aria-hidden="true"
              >
                <line
                  className={`mser-line${l.leading ? ' mser-win' : ''}`}
                  x1="0"
                  y1="1"
                  x2="24"
                  y2="1"
                />
              </svg>
              {l.label}
              {typeof last === 'number' ? ` ${fmtAxis(last, category)}` : ''}
            </span>
          );
        })}
      </div>
      {/* What the chart cannot say for itself, and only where it applies —
          which is now a *gap* in the data alone. The note that used to sit
          beside it ("The last point is today so far") is gone: the header
          already prints the week and its Live tag, the chart's own x axis ends
          on today, and a running total that stops at the current day is what a
          live week *is* — so it was restating the page rather than qualifying
          the chart. A missing day is a different matter and still says so. */}
      {known < days.length && (
        <p className="mser-note">
          ESPN would not answer for {days.length - known === 1 ? 'the last day' : `the last ${days.length - known} days`} of
          this period, so the lines stop where the totals stop being knowable.
        </p>
      )}
    </>
  );
}
