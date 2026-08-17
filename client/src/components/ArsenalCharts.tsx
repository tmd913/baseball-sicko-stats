import { useId, useMemo } from 'react';
import type { MovementSample, SeasonArsenalPitch } from '../types';
import { pitchStyle } from '../lib';
import { InfoKey } from './InfoKey';

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
/** Past the AVG bubble's own radius, with clearance. */
const LEG_MIN = 26;
/** The rings that carry a figure — the solid ones. */
const LABELLED_IN = [12, 24];
const VIEW = 400;
const CX = VIEW / 2;
const CY = 196;
const R_PX = 156;
const SCALE = R_PX / DOMAIN_IN; // px per inch

const px = (inches: number) => inches * SCALE;

/** Round-trip a break in inches to a printable figure. */
const inches1 = (n: number) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}"`;

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
  pitches,
  samples,
  hovered,
  onHover,
}: {
  season: number | null;
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
            The hatched blob behind each colour is where the <b>MLB average</b> of that
            pitch sits, drawn as wide as the league's own spread — average is a cloud too,
            so daylight narrower than the blob is not a difference.
          </p>
          <p>Pick a pitch below to single it out and see how it compares.</p>
        </InfoKey>
      </figcaption>

      {/* The row holds its own height with a hidden copy of a real pitch's chips
          rather than a declared `min-height`: they wrap to two rows on a phone
          and one on a desktop, so any fixed number would be wrong at one of
          those widths and would shift the plot under the reader's finger the
          moment they picked a pitch.

          The ghost and the live text share **one grid cell** — the trick the
          Columns dialog's hint line uses for exactly this — so at rest the space
          the chips will need carries the sentence that says how to get them,
          rather than sitting empty. */}
      <div className="mv-callouts">
        <span className="mv-callouts-ghost" aria-hidden="true">
          <span className="mv-callout">
            Break <b>0.0"</b>
            <em> · 0.0" more than league</em>
          </span>
          <span className="mv-callout">
            Rise <b>0.0"</b>
            <em> · 0.0" more than league</em>
          </span>
        </span>
        <span className="mv-callouts-live">
          {focus === null ? (
            <span className="mv-hint">Pick a pitch to compare it with the league</span>
          ) : (
            <>
              {focus.hBreak !== null && (
                <span className="mv-callout">
                  Break <b>{Math.abs(focus.hBreak).toFixed(1)}"</b>
                  {hDiff !== null && (
                    <em>
                      {' '}
                      · {Math.abs(hDiff).toFixed(1)}" {hDiff >= 0 ? 'more' : 'less'} than league
                    </em>
                  )}
                </span>
              )}
              {focus.vBreak !== null && (
                <span className="mv-callout">
                  {focus.vBreak >= 0 ? 'Rise' : 'Drop'} <b>{Math.abs(focus.vBreak).toFixed(1)}"</b>
                  {vDiff !== null && (
                    <em>
                      {' '}
                      {/* "more" and "less" are said of the quantity just named,
                          which flips with the pitch: a curveball above the
                          league's induced break has LESS drop, not more rise. */}
                      · {Math.abs(vDiff).toFixed(1)}"{' '}
                      {(focus.vBreak >= 0 ? vDiff >= 0 : vDiff < 0) ? 'more' : 'less'} than league
                    </em>
                  )}
                </span>
              )}
            </>
          )}
        </span>
      </div>

      <div className="mv-axis-top" aria-hidden="true">
        <span>1B ◀</span> MOVES TOWARD <span>▶ 3B</span>
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
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          role="img"
          aria-label={`Movement profile: ${shown
            .map((p) => `${p.pitchType} breaks ${inches1(p.hBreak ?? 0)} horizontally and ${inches1(p.vBreak ?? 0)} vertically`)
            .join('; ')}`}
        >
          <defs>
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
                />
              );
            })}

          {/* The selected pitch's own average, and the two legs it decomposes
              into: across to the vertical axis is its break, down to the
              horizontal axis is its rise.

              **The figures are in the callout row above rather than on the
              legs.** Savant rotates a label along each leader, which works
              because its labels are the only thing in that space; here both legs
              collapse toward nothing as a pitch approaches the origin — a slider
              at 3.5" break and 2.2" rise left two 80px boxes stacked on top of
              each other and on the marker, which is a picture of the collision
              rather than of the pitch. Off the plot they cannot collide at any
              geometry, and they gain room to carry the league comparison in the
              same breath. */}
          {focus && focus.hBreak !== null && focus.vBreak !== null && (
            <g className="mv-focus">
              {/* A leg is drawn only when it is long enough to be seen past the
                  marker. A pitch near the origin has almost no legs, and the two
                  stubs that survived behind a 15px bubble read as specks rather
                  than as a measurement — the callouts above carry the figures
                  either way, so an absent leg costs nothing. */}
              {Math.abs(fx - CX) > LEG_MIN && (
                <line className="mv-leader" x1={fx} y1={fy} x2={CX} y2={fy} />
              )}
              {Math.abs(fy - CY) > LEG_MIN && (
                <line className="mv-leader" x1={CX} y1={fy} x2={CX} y2={CY} />
              )}
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
        </svg>
      </div>

      <div className="mv-legend-note" aria-hidden="true">
        <span className="mv-legend-hatch" /> MLB average
      </div>

      <div className="mv-legend">
        <div className="mv-legend-labels" aria-hidden="true">
          <span>Usage</span>
          <span>MPH</span>
          <span>Lg avg</span>
        </div>
        <div className="mv-legend-cols">
          {shown.map((p) => {
            const { color } = pitchStyle(p.pitchType);
            const on = hot === p.pitchType;
            const dim = hot !== null && !on;
            return (
              <button
                key={p.pitchType}
                type="button"
                className={`mv-legend-col${on ? ' on' : ''}${dim ? ' dim' : ''}`}
                aria-pressed={on}
                onMouseEnter={() => onHover(p.pitchType)}
                onFocus={() => onHover(p.pitchType)}
                onClick={() => onHover(on ? null : p.pitchType)}
              >
                <span className="mv-legend-name">{p.pitchType}</span>
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
