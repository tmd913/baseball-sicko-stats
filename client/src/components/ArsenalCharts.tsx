import { useId, useMemo } from 'react';
import type { ArmAngleInfo, MovementSample, SeasonArsenalPitch } from '../types';
import { pitchStyle } from '../lib';
import { InfoKey } from './InfoKey';
import { pitchDirections } from './Arsenal';

/**
 * The Arsenal tab's two pictures: **Pitch Usage** (how often he throws each
 * pitch, and how that changes by the batter's side) and **Movement Profile**
 * (where each pitch breaks, as a cloud of real pitches rather than one bubble
 * per type). Both are recreations of the charts on a Baseball Savant player
 * page, and both read the data the tab already has.
 *
 * **They share one hover.** The tab owns `hovered` and hands it to both, so
 * picking out the slider in one picks it out in the other — they are two views
 * of one arsenal, and letting each keep its own selection would be two answers
 * to "which pitch am I looking at" on one screen.
 *
 * **Hover is for pointers; the press is for everyone.** Every highlightable
 * thing here is a real `<button>` (the usage rows, the legend columns), so a
 * touch reader taps to select and taps again to clear, and the `:hover` tints
 * are scoped to `(hover: hover)` in the stylesheet — the app-wide rule, argued
 * under *A card doesn't highlight when you scroll past it*.
 */

/**
 * Black or white on a pitch's own colour, whichever a reader can actually see.
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
 * The same colour, darker — what a movement dot is outlined in.
 *
 * A cloud is a hundred overlapping circles of one colour, and without an edge a
 * dense cluster is a single blob whose shape says how *far* the pitches spread
 * and nothing about how many are stacked where. The outline is a darker version
 * of the dot's **own** colour rather than a neutral: a grey or a black ring
 * would be a second thing to look at on a chart already carrying five colours,
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
  hovered,
  onHover,
}: {
  season: number | null;
  pitches: SeasonArsenalPitch[];
  vsRight: SeasonArsenalPitch[] | null;
  vsLeft: SeasonArsenalPitch[] | null;
  hovered: string | null;
  onHover: (pitchType: string | null) => void;
}) {
  const shareIn = (list: SeasonArsenalPitch[] | null, type: string): number | null =>
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

  return (
    <figure
      className={`pu-chart${hasSplits ? '' : ' solo'}`}
      onMouseLeave={() => onHover(null)}
    >
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
          const on = hovered === p.pitchType;
          const dim = hovered !== null && !on;
          return (
            <button
              key={p.pitchType}
              type="button"
              className={`pu-row${on ? ' on' : ''}${dim ? ' dim' : ''}`}
              aria-pressed={on}
              onMouseEnter={() => onHover(p.pitchType)}
              onFocus={() => onHover(p.pitchType)}
              onClick={() => onHover(on ? null : p.pitchType)}
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
 * margin either side of centre — so 22…370 keeps all of it with the ring
 * labels (y≈44 and y≈356) comfortably inside. A first pass cut at 26 and
 * clipped 1.6 units off the top of the disc; it took a check on the *painted*
 * pixels to see it, which is the only kind that can.
 */
const VIEW_TOP = 22;
const VIEW_H = 348;
const SCALE = R_PX / DOMAIN_IN; // px per inch

const px = (inches: number) => inches * SCALE;

/** Round-trip a break in inches to a printable figure. */
const inches1 = (n: number) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}"`;

/** Where the two corner marks sit, in viewBox units. Below the disc's widest
 *  point each bottom corner opens up; at this height it is clear by ~100 units
 *  either side, which is what these are drawn to fit. */
const CORNER_Y = 300;
const CORNER_INSET = 12;

/**
 * His arm slot, drawn as the arm.
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
 */
function ArmAngleMark({
  angle,
  hand,
  league,
}: {
  angle: number;
  hand: 'R' | 'L' | null;
  league: number | null;
}) {
  const right = hand !== 'L';
  const dir = right ? 1 : -1;
  // The shoulder end sits nearest the middle of the chart; the arm reaches out
  // into the corner, which is the empty part.
  const sx = right ? VIEW - CORNER_INSET - 74 : CORNER_INSET + 74;
  const sy = CORNER_Y + 16;
  const L = 46;
  const rad = (angle * Math.PI) / 180;
  const ex = sx + dir * L * Math.cos(rad);
  const ey = sy - L * Math.sin(rad);
  return (
    <g
      className="mv-arm"
      // A `<title>` rather than a printed sentence: the corner has room for the
      // figure and not for the gloss.
    >
      <title>
        {`Arm angle ${angle.toFixed(0)}° above horizontal at release` +
          (league === null ? '' : ` — the MLB average is ${league.toFixed(0)}°`)}
      </title>
      <line className="mv-arm-ref" x1={sx} y1={sy} x2={sx + dir * L} y2={sy} />
      <line className="mv-arm-line" x1={sx} y1={sy} x2={ex} y2={ey} />
      <circle className="mv-arm-ball" cx={ex} cy={ey} r="4.5" />
      {/* Both labels go *below* the horizontal reference. Above it is the
          opening the arm sweeps through, and at a low slot the arm passes
          straight through where a number would sit — measured at 30°, the
          degrees and the arm line were touching. Below the reference is free at
          every angle the leaderboard can produce. */}
      <text
        className="mv-arm-deg"
        x={sx + dir * 4}
        y={sy + 16}
        textAnchor={right ? 'start' : 'end'}
      >
        {`${angle.toFixed(0)}°`}
      </text>
      <text
        className="mv-arm-label"
        x={sx + dir * 4}
        y={sy + 29}
        textAnchor={right ? 'start' : 'end'}
      >
        ARM ANGLE
      </text>
    </g>
  );
}

/** The hatched swatch that says what the blobs behind the clouds are, in the
 *  bottom corner the arm does not want. */
function HatchKey({ side }: { side: 'left' | 'right' }) {
  const x = side === 'right' ? VIEW - CORNER_INSET - 74 : CORNER_INSET + 20;
  const y = CORNER_Y + 12;
  return (
    <g className="mv-hatchkey" aria-hidden="true">
      <circle className="mv-hatchkey-dot" cx={x} cy={y} r="8" />
      <text className="mv-hatchkey-text" x={x + 13} y={y + 4} textAnchor="start">
        MLB AVG
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
  pitches,
  samples,
  hovered,
  onHover,
}: {
  season: number | null;
  /** His throwing arm, which names the league line he is measured against. */
  hand: 'R' | 'L' | null;
  /** His arm slot, drawn in the corner. Null draws nothing. */
  armAngle: ArmAngleInfo | null;
  pitches: SeasonArsenalPitch[];
  samples: MovementSample[];
  hovered: string | null;
  onHover: (pitchType: string | null) => void;
}) {
  // Patterns are document-global by id, and this chart can be on screen twice
  // (a player page over a matchup team page), so the ids carry a per-instance
  // prefix rather than the pitch name alone.
  const uid = useId().replace(/:/g, '');

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

  // What the league line is called on this page. `pitchLeague.ts` is split by
  // the pitcher's hand, so where the server knows it the label names the
  // population the figures actually come from; where it doesn't, the blended
  // table is what is being shown and the label says so.
  const avgLabel = hand === 'R' ? 'RHP AVG' : hand === 'L' ? 'LHP AVG' : 'LEAGUE AVG';
  // The same fact in the legend's own sentence case, beside `Usage` and `MPH`.
  const rowAvgLabel = hand === 'R' ? 'RHP avg' : hand === 'L' ? 'LHP avg' : 'Lg avg';
  const hot = hovered !== null && types.has(hovered) ? hovered : null;
  const focus = hot ? (shown.find((p) => p.pitchType === hot) ?? null) : null;

  // The two callouts: how his pitch differs from the league's own. Horizontal
  // break is compared as a MAGNITUDE (its sign is only which way his arm goes),
  // where rise is signed — a lower induced break literally is more drop.
  const hDiff =
    focus && focus.leagueHBreak !== null && focus.hBreak !== null
      ? Math.abs(focus.hBreak) - Math.abs(focus.leagueHBreak)
      : null;
  const vDiff =
    focus && focus.leagueVBreak !== null && focus.vBreak !== null
      ? focus.vBreak - focus.leagueVBreak
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
  // arsenal rows colour their ▲▼ with, rather than a second opinion beside it.
  // A metric that table calls `none` (a slider's induced break sits near zero
  // by design) takes no colour at all.
  const better = focus ? pitchDirections(focus.pitchType) : null;
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
    <figure className="mv-chart" onMouseLeave={() => onHover(null)}>
      <figcaption className="chart-title">
        {season != null && <span className="chart-title-year">{season}</span>} Movement Profile{' '}
        <span className="chart-title-sub">(Induced Break)</span>
        <InfoKey label="How to read the movement profile" className="mv-key">
          <p>
            Every dot is a pitch he actually threw, placed by how far it broke from a
            spinless path — left and right toward the bases, up and down as{' '}
            <b>induced</b> break, which is the movement his spin creates rather than the
            drop gravity gives every pitch. The rings are inches; the solid ones are
            labelled and the dashed ones halve them.
          </p>
          <p>
            The hatched blob behind each colour is where the average of that pitch
            sits for pitchers of <b>his own hand</b>, drawn as wide as the league's own
            spread — average is a cloud too, so daylight narrower than the blob is not a
            difference. (A right-hander throws about two miles an hour harder than a
            left-hander at every pitch type, which is why the comparison is split.)
          </p>
          <p>Pick a pitch below to single it out and see how it compares.</p>
        </InfoKey>
      </figcaption>

      {/* **Two blocks, and they answer two different questions.** On the left,
          what the pitch actually does — its rise or drop, its tail or break.
          On the right, how that compares with the same pitch thrown by the rest
          of his own hand. They were one run of chips saying both at once
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
            <span className="mv-hint">Pick a pitch to compare it with the league</span>
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
                    {/* "more" and "less" are said of the quantity just named,
                        which flips with the pitch: a curveball above the
                        league's induced break has LESS drop, not more rise. */}
                    {(focus.vBreak >= 0 ? vDiff >= 0 : vDiff < 0) ? 'more' : 'less'}{' '}
                    {focus.vBreak >= 0 ? 'rise' : 'drop'}
                  </span>
                )}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="mv-plot-wrap">
        <span className="mv-axis-side mv-axis-rise" aria-hidden="true">
          More rise ▲
        </span>
        <span className="mv-axis-side mv-axis-drop" aria-hidden="true">
          ▼ More drop
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

          {/* Only the solid rings are labelled — the dashed ones halve them, so
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
            if (p.leagueHBreak === null || p.leagueVBreak === null) return null;
            // The spread is always filled by the current server (there is a
            // default behind it), so this only bites in the window where a new
            // client is talking to an older build. A blob whose width we cannot
            // state is not drawn at all — `rx="NaN"` is an invalid attribute
            // that silently paints nothing anyway, and "we don't know how wide
            // the league is here" is the honest reading of a missing field.
            if (!Number.isFinite(p.leagueHRange) || !Number.isFinite(p.leagueVRange)) return null;
            const dim = hot !== null && hot !== p.pitchType;
            return (
              <ellipse
                key={`lg-${p.pitchType}`}
                className={`mv-league${dim ? ' dim' : ''}`}
                cx={CX + px(p.leagueHBreak)}
                cy={CY - px(p.leagueVBreak)}
                rx={px(p.leagueHRange)}
                ry={px(p.leagueVRange)}
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
            <ArmAngleMark angle={armAngle.angle} hand={hand} league={armAngle.league} />
          )}
          <HatchKey side={hand === 'L' ? 'right' : 'left'} />
        </svg>
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
                aria-pressed={on}
                aria-label={p.pitchType}
                onMouseEnter={() => onHover(p.pitchType)}
                onFocus={() => onHover(p.pitchType)}
                onClick={() => onHover(on ? null : p.pitchType)}
              >
                {/* The abbreviation at rest and the whole name when it is the
                    one being read — five full pitch names across a 470px chart
                    is a legend that wraps `4-Seam Fastball` onto two lines and
                    pushes the numbers under it apart, and only one column is
                    ever the answer to a question. The full name is absolutely
                    placed so the grid holds still while it appears, and it may
                    overhang its neighbours, which are dimmed at that moment
                    anyway. Same move the usage badge makes. */}
                <span className="mv-legend-name">
                  {/* Not in the pitch's own colour: this palette is built to
                      be a *fill* with computed ink over it (see `inkOn`), and as
                      text it fails on one scheme or the other for nearly every
                      pitch — measured against the two page grounds, 6 of 9 land
                      under 3:1 on Lavender and FC/KC under 3:1 on Midnight, with
                      no value working in both. The swatch directly below is
                      where the colour belongs. */}
                  <span className="mv-legend-abbr">{abbr}</span>
                  <span className="mv-legend-full">{p.pitchType}</span>
                </span>
                <span className="mv-legend-swatch" style={{ background: color }} />
                <span className="mv-legend-val">{pctText(p.share)}</span>
                <span className="mv-legend-val">{p.velo === null ? '—' : p.velo.toFixed(1)}</span>
                <span className="mv-legend-val mv-legend-lg">
                  {p.leagueVelo === null ? '—' : p.leagueVelo.toFixed(1)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </figure>
  );
}
