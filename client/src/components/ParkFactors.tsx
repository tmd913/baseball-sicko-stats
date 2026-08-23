import { useMemo, useState } from 'react';
import { InfoKey } from './InfoKey';
import { useParkFactor, useParkFactors } from '../hooks';
import type { ParkFactor, ParkHand, ParkIndexes } from '../types';

/**
 * **The ballpark as a number, and what a park factor actually says.**
 *
 * Savant scales every index so that **100 is the average park**: 109 means a
 * plate appearance here produces 9% more of that stat than the same plate
 * appearance in a neutral park would. That is the one sentence a reader needs
 * and it is the one the key says, because nothing about the digits carries it —
 * `109` read cold is a rate, a rank or a count with equal plausibility.
 *
 * ### Two surfaces, one table
 *
 * `GamePark` is the line a **game preview** draws — the four indexes that
 * change how a night reads, above the platoon split or the opposing lineup the
 * dialog opened on. `ParkTable` is the **team page's Park tab**, all sixteen.
 * Both read one league-wide table through `ParkFactorsContext`, so the club's
 * own page and a fixture at that club three days out cannot disagree about the
 * park, and the second surface a reader opens costs no request.
 *
 * ### The bars are the platoon card's rail, deliberately
 *
 * `.spl-track` and `.spl-fill` are shared rather than re-cut: a center-zero rail
 * with a fill growing out of the middle is the same object here as it is there
 * — *fold, don't restyle* — and `.pf-table` is folded onto `.spl-table`'s token
 * block for `--spl-inset` so a full bar's cap nests inside the rail's by the
 * same 3px in both places. Only the **grid around it** is this file's own, and
 * that is because it genuinely differs: a platoon row prints a figure either
 * side of the rail and a park row has one number, not two.
 *
 * ### The fill points at the number, not at who it favors
 *
 * Above 100 fills right and below 100 fills left, on every row, and that is
 * the deliberate choice against the platoon card's rule (where the fill points
 * at the *stronger* side). A park does not lean one way per row: Coors is a
 * hitter's park in wOBA at 109, in runs at 119 **and in strikeouts at 94** —
 * three hitter-friendly readings, of which two are above the line and one is
 * below it. Point every bar at "who this favors" and those three rows draw two
 * directions for one fact; point them all at the index and the picture is the
 * table, with the judgment made once, in words, by the headline. Which is the
 * `so` row's whole problem stated generally, and why it wears a note of its own
 * rather than an inverted bar.
 */

/** How the four-figure strip and the full table name each index. */
interface ParkStat {
  key: keyof ParkIndexes;
  label: string;
  /** The full name, for the row's tooltip. */
  title: string;
  /**
   * **The end of the rail: the most extreme park in the league in this stat,
   * measured.** Every one of the 30 club parks was taken on all three hands
   * (90 readings a stat) and `full` is the largest `|index − 100|` in that
   * population, rounded up to a clean number.
   *
   * Per-stat rather than one scale for all sixteen, which is the platoon card's
   * rule and holds for the same reason: a 9-point swing in wOBA is the biggest
   * wOBA park in baseball and a 9-point swing in triples is noise. **Triples are
   * the row that proves it** — that spread runs to 245 points against wOBA's 18,
   * because a park with an odd corner turns a handful of doubles a year into
   * triples off a denominator of almost nothing.
   *
   * **It is the maximum where the platoon card takes the 90th percentile, and
   * the difference is measured rather than stylistic.** At p90 the scale is
   * tight enough that Coors Field — the extreme park — clamped **7 of its 16
   * rows**, and seven identical full bars say less than the numbers beside them
   * do. The reason is that a park's indexes are *correlated*: a ground that
   * inflates wOBA inflates runs, hits, BAcon and wOBAcon with it, so a single
   * park meets a per-stat 90th percentile on half its rows at once. A platoon
   * gap has no such structure — one hitter's eight stats move independently —
   * which is why the same constant does different work in the two cards. Against
   * the maximum, Coors' wOBA draws at 50% of its half-rail and its home runs at
   * 24%, which is the fact: it is an extreme park for run scoring and a fairly
   * ordinary one for home runs.
   *
   * The measured maxima, in order below: wOBA 18, runs 39, HR 41, K 19, BB 26,
   * OBP 15, hits 18, 1B 16, 2B 45, 3B 245, hard-hit 9, wOBAcon 16, xwOBAcon 8,
   * xBAcon 7, BAcon 13, wOBA/TTO 11. The medians are 3.0 of wOBA and 11.0 of
   * home runs, so the ordinary park draws a short bar and a long one is genuinely
   * rare — which is the reading.
   */
  full: number;
  /** True where a number above 100 is the **pitcher's** gain rather than the
   *  hitter's. Strikeouts are the only one, and it is why the row is noted
   *  rather than flipped — see the note on this module. */
  pitcherUp?: boolean;
}

const HEADLINE: ParkStat = {
  key: 'woba',
  label: 'wOBA',
  title: 'wOBA — the headline park factor, and what Savant’s own board leads with',
  full: 18,
};

/** The four a game preview carries: what the park does to run scoring, to the
 *  ball leaving it, and to the strikeout. Chosen because they are the four that
 *  change how a hitter or a pitcher reads a night — the other twelve are a
 *  reading of the park itself and live on its club's page. */
const PREVIEW_STATS: ParkStat[] = [
  HEADLINE,
  { key: 'runs', label: 'Runs', title: 'Runs scored', full: 40 },
  { key: 'hr', label: 'HR', title: 'Home runs', full: 42 },
  { key: 'so', label: 'K', title: 'Strikeouts — the one row where above 100 favors the pitcher', full: 20, pitcherUp: true },
];

/** All sixteen, in the order a park is read in: the headline, then what it does
 *  to scoring, then to each kind of hit, then the contact-quality estimators
 *  that say whether the park or the hitters in it did the work. */
const ALL_STATS: ParkStat[] = [
  HEADLINE,
  { key: 'runs', label: 'Runs', title: 'Runs scored', full: 40 },
  { key: 'obp', label: 'OBP', title: 'On-base percentage', full: 15 },
  { key: 'hits', label: 'Hits', title: 'Hits', full: 18 },
  { key: 'singles', label: '1B', title: 'Singles', full: 16 },
  { key: 'doubles', label: '2B', title: 'Doubles', full: 45 },
  { key: 'triples', label: '3B', title: 'Triples — the noisiest index on the board; a handful of balls a year moves it', full: 245 },
  { key: 'hr', label: 'HR', title: 'Home runs', full: 42 },
  { key: 'bb', label: 'BB', title: 'Walks', full: 26 },
  { key: 'so', label: 'K', title: 'Strikeouts — the one row where above 100 favors the pitcher', full: 20, pitcherUp: true },
  { key: 'hardHit', label: 'Hard hit', title: 'Hard-hit rate — batted balls at 95mph and up', full: 10 },
  { key: 'baCon', label: 'BAcon', title: 'Batting average on contact', full: 13 },
  { key: 'wobaCon', label: 'wOBAcon', title: 'wOBA on contact — the park with the strikeouts taken out of it', full: 16 },
  { key: 'xbaCon', label: 'xBAcon', title: 'Expected batting average on contact — what the contact deserved', full: 7 },
  { key: 'xwobaCon', label: 'xwOBAcon', title: 'Expected wOBA on contact — what the contact deserved', full: 8 },
  { key: 'wobaTto', label: 'wOBA/TTO', title: 'wOBA excluding the three true outcomes', full: 11 },
];

/**
 * **Which hand's park a hitter is standing in.**
 *
 * A switch hitter has no fixed answer and the preview knows the one thing that
 * settles it — the hand the announced starter throws with, which is the very
 * fact the dialog opened to show. So he is read from the side he will actually
 * bat from, and a park whose short porch is only a short porch to a lefty says
 * so for the right man.
 *
 * Unknown handedness falls to `all` rather than guessing a side: both hands
 * together is a true reading of the park, where the wrong side is not.
 */
export function hitterHand(bats: string | null, pitcherThrows: 'L' | 'R' | null): ParkHand {
  if (bats === 'L' || bats === 'R') return bats;
  if (bats === 'S' && pitcherThrows) return pitcherThrows === 'L' ? 'R' : 'L';
  return 'all';
}

/** How the three cuts are named wherever one is shown. */
const HAND_LABEL: Record<ParkHand, string> = {
  all: 'All hitters',
  L: 'Left-handed hitters',
  R: 'Right-handed hitters',
};
const HAND_SHORT: Record<ParkHand, string> = { all: 'All', L: 'vs LHB', R: 'vs RHB' };

/**
 * **The park in a phrase**, off the wOBA index alone — the headline, and the
 * only row whose judgment a reader should have to take on trust.
 *
 * The three bands are the measured distribution rather than round numbers: the
 * median club park sits 3.0 points of wOBA off center and the 75th percentile
 * 6.0, so under 3 is *the middle of the league*, 3 to 6 is a lean, and past 6 is
 * a park with a reputation. Naming those bands after the population is what
 * keeps `102` from being announced as a hitter's park.
 */
export function parkRead(woba: number): { text: string; lean: 'hitter' | 'pitcher' | 'neutral' } {
  const d = woba - 100;
  if (Math.abs(d) < 3) return { text: 'plays neutral', lean: 'neutral' };
  const lean = d > 0 ? 'hitter' : 'pitcher';
  if (Math.abs(d) < 6) return { text: `leans ${lean}`, lean };
  return { text: `${lean}’s park`, lean };
}

const fmt = (v: number | null): string => (v == null ? '–' : String(v));

/** A number's distance from the average park, as a fraction of the rail's half.
 *  Answers in [0,1] for **every** input, the absurd and the non-finite alike —
 *  the invariant `railFraction` holds on the platoon card, for the same reason:
 *  a fill longer than its half of the rail draws outside it. */
function railFraction(index: number, full: number): number {
  const gap = Math.abs(index - 100);
  if (!Number.isFinite(gap) || !Number.isFinite(full) || full <= 0) return 0;
  return Math.max(0, Math.min(1, gap / full));
}

/** One index as a row: name, the rail with the average down its middle, the
 *  number. */
function ParkRow({ stat, indexes }: { stat: ParkStat; indexes: ParkIndexes }) {
  const v = indexes[stat.key] as number | null;
  const has = typeof v === 'number';
  const above = has && v > 100;
  const frac = has ? railFraction(v, stat.full) : 0;
  // The rail's half less the inset the fill nests by, so a full bar lands
  // inside the rail's cap rather than on its box. `--spl-inset` is the platoon
  // card's own token, in scope because `.pf-table` is folded onto the block
  // that declares it — one number, so the two rails cannot drift apart.
  const width = `calc(${frac} * (50% - var(--spl-inset)))`;
  const off = has ? Math.abs(v - 100) : 0;
  const title = !has
    ? `${stat.title} — Savant publishes no index for this park.`
    : `${stat.title}: ${v}. ` +
      (off === 0
        ? 'Exactly the average park.'
        : `${off}% ${above ? 'more' : 'fewer'} than an average park` +
          (stat.pitcherUp
            ? `, which favors the ${above ? 'pitcher' : 'hitter'}.`
            : `, which favors the ${above ? 'hitter' : 'pitcher'}.`)) +
      (frac === 1 && off > stat.full ? ' Bigger than the bar can show, so it stops at the end.' : '');

  return (
    <div className="pf-row" title={title}>
      <span className="pf-label">
        {stat.label}
        {/* The one row whose direction does not mean what every other row's
            means, marked where it is read rather than explained in the key
            alone — see the note on this module. */}
        {stat.pitcherUp && <abbr className="pf-flip" title="More strikeouts favors the pitcher">P</abbr>}
      </span>
      <span className="spl-track">
        {has && off > 0 && (
          <span
            className={`spl-fill spl-fill--${above ? 'r' : 'l'}`}
            style={above ? { left: '50%', width } : { right: '50%', width }}
          />
        )}
      </span>
      <span className={`pf-val${!has ? ' pf-val--none' : off === 0 ? '' : ' pf-val--on'}`}>
        {fmt(v)}
      </span>
    </div>
  );
}

/**
 * **The four-figure strip a game preview carries**, above whatever the dialog
 * opened on.
 *
 * It is a strip rather than the table because of what is under it: this box
 * already holds a nine-cut opposing lineup or a whole platoon comparison, and
 * sixteen more bars would bury the thing the reader pressed for. The club's own
 * page is one press away and has all of them.
 *
 * **A hitter is shown his own side of the plate and a pitcher is shown both.**
 * He faces whichever nine the other club writes down, so the park he works in
 * is the park as it plays to everybody; a hitter stands on one side of the
 * plate all night, and on the 2026 board that is worth 34 points of home-run
 * index at Yankee Stadium.
 */
export function GamePark({
  venueId,
  hand = 'all',
  handNote,
}: {
  venueId: number | null;
  /** Which cut to draw — `hitterHand` for a batter, `all` for a pitcher. */
  hand?: ParkHand;
  /** Why this cut and not another, for the strip's own tooltip. */
  handNote?: string;
}) {
  const { park, loading, error } = useParkFactor(venueId);
  // Rule 1 of the loading system: never a wait over data, and this block *is*
  // a garnish on a dialog whose content is already up. A park still being read
  // draws nothing at all rather than a spinner over somebody's platoon splits;
  // it is one line and it appears when it has something to say.
  if (!venueId || loading || error || !park) return null;
  const indexes = park.hands[hand] ?? park.hands.all;
  if (!indexes) return null;
  const read = parkRead(indexes.woba);

  return (
    <div className="pf-strip" title={handNote ?? HAND_LABEL[hand]}>
      <div className="pf-strip-head">
        <span className="pf-venue">{park.venue}</span>
        <span className={`pf-lean pf-lean--${read.lean}`}>{read.text}</span>
        {hand !== 'all' && <span className="pf-hand">{HAND_SHORT[hand]}</span>}
      </div>
      <div className="pf-figs">
        {PREVIEW_STATS.map((s) => {
          const v = indexes[s.key] as number | null;
          const off = typeof v === 'number' ? v - 100 : 0;
          return (
            <span
              key={s.key}
              className="pf-fig"
              title={
                typeof v !== 'number'
                  ? `${s.title} — no index published for this park.`
                  : `${s.title}: ${v} — ${
                      off === 0
                        ? 'exactly average'
                        : `${Math.abs(off)}% ${off > 0 ? 'more' : 'fewer'} than an average park`
                    }.`
              }
            >
              <span className="pf-fig-label">{s.label}</span>
              <span className={`pf-fig-val${typeof v === 'number' && v !== 100 ? ' pf-val--on' : ''}`}>
                {fmt(v)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * **The team page's Park tab** — one club's ballpark, all sixteen indexes, on
 * whichever of the three hitter hands the reader picks.
 *
 * The hand switch is the tab's own control rather than the page's side switch,
 * and the two are different questions: `tside=` asks *the club's bat or its
 * arms*, and a park has neither — it does the same thing to both clubs in it.
 * What this switch asks is **which hitter**, which is the only cut a park
 * factor has. Putting it on the page's switch would have made `Pitching` mean
 * something it cannot mean here.
 */
export function ParkTable({ teamId, teamName }: { teamId: number; teamName: string }) {
  const [hand, setHand] = useState<ParkHand>('all');
  const { byVenue, loading, error } = useParkFactors();
  // Asked for by venue everywhere else; a club's page has only the club, so
  // this is the one lookup that goes the other way. A club with no park in the
  // table is not a club that plays somewhere — it is a table that has not
  // landed, or a season Savant has not indexed yet.
  const park = useMemo(() => {
    if (!byVenue) return null;
    for (const p of byVenue.values()) if (p.teamId === teamId) return p;
    return null;
  }, [byVenue, teamId]);

  if (loading) return <p className="ovw-none">Reading the park factors</p>;
  if (error) return <p className="ovw-none">The park factors couldn’t be read — {error}</p>;
  if (!park) return <p className="ovw-none">No park factors published for {teamName}.</p>;

  const indexes = park.hands[hand];

  return (
    <div className="pf-card">
      <div className="pct-card-head pf-card-head">
        <h3 className="pf-venue-name">{park.venue}</h3>
        <InfoKey className="pf-key" label="How to read park factors">
          <p>
            <strong>100 is the average ballpark.</strong> An index of 109 means a plate appearance
            here produces 9% more of that stat than the same plate appearance in a neutral park
            would; 91 means 9% less.
          </p>
          <p>
            The bar grows out of the middle toward the number — right for more than average, left
            for fewer — and its length is that gap against{' '}
            <strong>the most extreme park in the league</strong> in that stat, so a full bar means
            the same thing on every row and a half-length one means half as far from average as any
            park in baseball gets. Each stat has its own scale, because nine points of wOBA is the
            biggest park in the game and nine points of triples is noise.
          </p>
          <p>
            More of a stat favors the hitter on every row <em>except</em> strikeouts, marked{' '}
            <span className="pf-flip">P</span> — more of those is the pitcher’s gain.
          </p>
          <p>
            A park is not one park: the same fence is a short porch from one side of the plate and a
            long out from the other. The three tabs are that cut, and the sample each is measured
            over is under them.
          </p>
        </InfoKey>
      </div>

      <div className="view-switch pf-hands" role="tablist" aria-label="Which hitters">
        {(['all', 'L', 'R'] as const).map((h) => (
          <button
            key={h}
            type="button"
            role="tab"
            className={`view-tab${hand === h ? ' active' : ''}`}
            aria-selected={hand === h}
            onClick={() => setHand(h)}
            title={`${park.venue} as it plays to ${HAND_LABEL[h].toLowerCase()}`}
          >
            {HAND_SHORT[h]}
          </button>
        ))}
      </div>

      {!indexes ? (
        <p className="ovw-none">Savant publishes no {HAND_LABEL[hand].toLowerCase()} cut for this park.</p>
      ) : (
        <>
          <p className="pf-sample">
            {HAND_LABEL[hand]} · {indexes.pa.toLocaleString()} plate appearances ·{' '}
            <strong>{indexes.woba}</strong> wOBA index, {parkRead(indexes.woba).text}
          </p>
          <div className="pf-table">
            <div className="pf-heads">
              <span className="pf-label" />
              <span className="pf-axis">
                <span>fewer</span>
                <span>average</span>
                <span>more</span>
              </span>
              <span className="pf-val pf-val--head">Index</span>
            </div>
            {ALL_STATS.map((s) => (
              <ParkRow key={s.key} stat={s} indexes={indexes} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export type { ParkFactor };
