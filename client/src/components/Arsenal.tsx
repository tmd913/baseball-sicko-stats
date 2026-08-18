import type { PitchMix } from '../types';
import { deltaVs, fmt, pitchStyle } from '../lib';

/*
 * The arsenal table, shared by the pitcher card (one game, measured against the
 * pitcher's own season) and the details view's Arsenal tab (the whole season,
 * measured against the league). Same row shape either way: a color-coded pitch
 * id with usage and strike bars, a velo/spin/break metric grid carrying ▲▼
 * deltas vs the baseline, and a results strip.
 */

export const pct = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 100)}%`);

/** Baseball rate line ".265" / "1.250" — drops the leading zero below 1.000. */
export const avg3 = (n: number | null): string => (n === null ? '—' : n.toFixed(3).replace(/^0\./, '.'));

/** One labeled stat in a results strip — the arsenal's, or the game line's. */
export function ResultStat({
  label,
  value,
  title,
  note,
}: {
  label: string;
  value: string;
  title?: string;
  // A trailing qualifier in the muted label type — the opponent section's
  // league rank ("14th"), where the number alone doesn't say much.
  note?: string;
}) {
  return (
    <span className="ars-rstat" title={title}>
      <span className="ars-rlabel">{label}</span>
      <span className="ars-rval">{value}</span>
      {note && <span className="ars-rnote">{note}</span>}
    </span>
  );
}

/**
 * Which way an arsenal metric has to move, for a given pitch type, to read as
 * an improvement on the pitcher's own season norm:
 *
 * - `up` / `down` — a rise / a drop is the better outcome.
 * - `more` — bigger either way. Horizontal break's sign is only arm side vs
 *   glove side (and flips with handedness), so what matters is how much the
 *   pitch moved, not which way the number went.
 * - `none` — the change isn't a quality signal, so it stays uncolored.
 */
export type BetterWay = 'up' | 'down' | 'more' | 'none';

interface PitchDirections {
  velo: BetterWay;
  spin: BetterWay;
  ivb: BetterWay;
  hb: BetterWay;
}

/**
 * Per pitch type, because "better" isn't the same for all of them: a four-seamer
 * wants to ride (more iVB), while a changeup, splitter or curveball wants to
 * drop (less). Sliders and sweepers live near zero iVB by design, so a wobble
 * there says nothing. Offspeed velo is judged against the fastball it's paired
 * with — which isn't in view on this row — so it stays neutral rather than
 * calling a faster changeup an improvement. Same for changeup/splitter spin,
 * where low spin is what kills lift and produces the drop.
 */
const NEUTRAL: PitchDirections = { velo: 'up', spin: 'none', ivb: 'none', hb: 'more' };
const RIDING: PitchDirections = { velo: 'up', spin: 'up', ivb: 'up', hb: 'more' };
const BREAKING: PitchDirections = { velo: 'up', spin: 'up', ivb: 'down', hb: 'more' };
const OFFSPEED: PitchDirections = { velo: 'none', spin: 'down', ivb: 'down', hb: 'more' };
const GYRO: PitchDirections = { velo: 'up', spin: 'up', ivb: 'none', hb: 'more' };

const PITCH_DIRECTIONS: Record<string, PitchDirections> = {
  '4-Seam Fastball': RIDING,
  Cutter: GYRO,
  Slider: GYRO,
  Sweeper: GYRO,
  // Sinker spin is about axis more than rate, so only its drop and run are read.
  Sinker: { velo: 'up', spin: 'none', ivb: 'down', hb: 'more' },
  Slurve: BREAKING,
  Curveball: BREAKING,
  'Knuckle Curve': BREAKING,
  'Slow Curve': { ...BREAKING, velo: 'none' },
  Screwball: { ...BREAKING, velo: 'none' },
  Changeup: OFFSPEED,
  Splitter: OFFSPEED,
  Forkball: OFFSPEED,
  // Nothing about a knuckleball or an eephus is better for being more of it.
  Knuckleball: { velo: 'none', spin: 'down', ivb: 'none', hb: 'none' },
  Eephus: { velo: 'none', spin: 'none', ivb: 'none', hb: 'none' },
};

export function pitchDirections(pitchType: string): PitchDirections {
  return PITCH_DIRECTIONS[pitchType] ?? NEUTRAL;
}

/** One arsenal metric (velo / spin / break): the game value with a small ▲▼
 * delta vs the pitcher's own season average (league avg in the hover title).
 * Green/red says whether the change is an improvement *for this pitch type*. */
export function ArsenalMetric({
  label,
  value,
  unit,
  season,
  league,
  digits,
  better,
}: {
  label: string;
  value: number | null;
  unit: string;
  season: number | null;
  league: number | null;
  digits: number;
  better: BetterWay;
}) {
  // For `more`, compare how far the pitch broke rather than the signed number,
  // so a lefty's -14" vs a -12" norm reads as more break, not less.
  const magnitude = better === 'more' && value !== null && season !== null;
  const d = magnitude
    ? deltaVs(Math.abs(value as number), Math.abs(season as number))
    : deltaVs(value, season);
  const arrow = d?.dir === 'up' ? '▲' : d?.dir === 'down' ? '▼' : null;
  const tone =
    !d || d.dir === 'flat' || better === 'none'
      ? 'flat'
      : (d.dir === 'down') === (better === 'down')
        ? 'good'
        : 'bad';
  const title = [
    season !== null ? `season ${fmt(season, digits)}${unit}` : null,
    league !== null ? `league ${fmt(league, digits)}${unit}` : null,
    magnitude ? 'compared by amount of break, not side' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="ars-metric" title={title || undefined}>
      <span className="ars-mlabel">{label}</span>
      <span className="ars-mval">
        {fmt(value, digits)}
        {unit && <span className="ars-unit">{unit}</span>}
      </span>
      {d && arrow ? (
        <span className={`ars-delta tone-${tone}`}>
          {arrow} {fmt(Math.abs(d.diff), digits)}
        </span>
      ) : (
        <span className="ars-delta tone-flat">·</span>
      )}
    </div>
  );
}

/**
 * A labeled rate bar — the arsenal row's usage share and strike rate, and the
 * game line's strike rate. `counts` spells out the numbers behind the
 * percentage (pitches thrown, or strikes and balls).
 */
export function RateBar({
  label,
  pct: value,
  color,
  counts,
  title,
}: {
  label: string;
  // 0-100, already rounded.
  pct: number | null;
  color: string;
  counts: string;
  title?: string;
}) {
  return (
    <span className="ars-usage" title={title}>
      <span className="ars-mlabel">{label}</span>
      <span className="ars-bar">
        <span className="ars-bar-fill" style={{ width: `${value ?? 0}%`, background: color }} />
      </span>
      <span className="ars-share">{value === null ? '—' : `${value}%`}</span>
      <span className="ars-count">{counts}</span>
    </span>
  );
}

/** Which half of his season a game row's strip is drawn from — the hover title,
 * since the tag reads "Season Results" on every tab. */
function seasonScope(split: SplitKey): string {
  return split === 'R' ? 'season, vs RHB' : split === 'L' ? 'season, vs LHB' : 'season';
}

/** One pitch type as a Savant-style arsenal row: color-coded id + usage and
 * strike bars, then velo / spin / iVB / HB (vs season) + whiff.
 *
 * `split` is only read for the results strip's hover title: on a handedness tab
 * the season figures beside the game's are drawn from that same half of his
 * season (the server matches them up), and the title says so. */
export function ArsenalRow({ m, split = 'all' }: { m: PitchMix; split?: SplitKey }) {
  const { abbr, color } = pitchStyle(m.pitchType);
  const share = Math.round(m.share * 100);
  const balls = m.count - m.strikes;
  const better = pitchDirections(m.pitchType);
  return (
    <div className="ars-row" style={{ borderLeftColor: color }}>
      <div className="ars-head">
        <span className="ars-dot" style={{ background: color }} />
        <span className="ars-abbr">{abbr}</span>
        <span className="ars-name">{m.pitchType}</span>
        <RateBar
          label="Usage"
          pct={share}
          color={color}
          counts={`${m.count} P`}
          title={`${m.count} of the game's pitches`}
        />
        <RateBar
          label="Strike"
          pct={m.count ? Math.round((m.strikes / m.count) * 100) : null}
          color="var(--accent)"
          counts={`${m.strikes} S · ${balls} B`}
        />
      </div>
      <div className="ars-metrics">
        <ArsenalMetric label="Velo" value={m.avgVelo} unit=" mph" season={m.seasonVelo} league={m.leagueVelo} digits={1} better={better.velo} />
        <ArsenalMetric label="Spin" value={m.avgSpin} unit="" season={m.seasonSpin} league={m.leagueSpin} digits={0} better={better.spin} />
        <ArsenalMetric label="iVB" value={m.vBreak} unit='"' season={m.seasonVBreak} league={m.leagueVBreak} digits={1} better={better.ivb} />
        <ArsenalMetric label="HB" value={m.hBreak} unit='"' season={m.seasonHBreak} league={m.leagueHBreak} digits={1} better={better.hb} />
        <div className="ars-metric ars-metric-whiff">
          <span className="ars-mlabel">Whiff</span>
          <span className="ars-mval">{pct(m.whiffRate)}</span>
          <span className="ars-delta tone-flat" aria-hidden="true">
            {' '}
          </span>
        </div>
      </div>
      {m.seasonPa !== null && (
        <div
          className="ars-results"
          title={`${m.seasonPa} PA ended on this pitch (${seasonScope(split)})`}
        >
          <span className="ars-rtag">Season Results</span>
          {/* The same strip the details view's Arsenal tab carries, PA first:
              a split's season sample can be a fraction of the whole, and the
              rate beside it means little without it. */}
          <ResultStat label="PA" value={String(m.seasonPa)} />
          <ResultStat label="BA" value={avg3(m.seasonBa)} />
          <ResultStat label="SLG" value={avg3(m.seasonSlg)} />
          <ResultStat label="wOBA" value={avg3(m.seasonWoba)} />
          <ResultStat label="xwOBA" value={avg3(m.seasonXwoba)} />
          <ResultStat label="PutAway" value={pct(m.seasonPutAway)} />
        </div>
      )}
    </div>
  );
}

/** Which batters a section is showing: everyone, or one handedness. */
export type SplitKey = 'all' | 'R' | 'L';

/**
 * Overall / vs RHB / vs LHB selector, shared by the pitcher card's Line and
 * Arsenal sections and the details view's Arsenal tab. Only offers a hand the
 * pitcher actually faced, and renders nothing when that leaves one option — a
 * lone "Overall" tab is just a label.
 */
export function SplitTabs({
  hasRight,
  hasLeft,
  value,
  onChange,
}: {
  hasRight: boolean;
  hasLeft: boolean;
  value: SplitKey;
  onChange: (v: SplitKey) => void;
}) {
  const opts: { key: SplitKey; label: string }[] = [{ key: 'all', label: 'Overall' }];
  if (hasRight) opts.push({ key: 'R', label: 'vs RHB' });
  if (hasLeft) opts.push({ key: 'L', label: 'vs LHB' });
  if (opts.length < 2) return null;
  return (
    <div className="split-switch" role="tablist" aria-label="Batter handedness">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          className={`split-tab${value === o.key ? ' active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
