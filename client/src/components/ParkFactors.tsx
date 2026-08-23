import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { InfoKey } from './InfoKey';
import { useParkFactor, useParkFactors, useTeamDoor } from '../hooks';
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

/**
 * **What every preview carries after the wOBA**, batter's and pitcher's alike:
 * what the ground does to run scoring, to the ball leaving it, and to the three
 * outcomes a plate appearance is settled by.
 *
 * **One list, where there were two.** A batter's strip carried `Runs` and `HR`
 * and a pitcher's carried those plus `H`, `BB` and `K`, on the reasoning that
 * hits, walks and strikeouts are a pitcher's night rather than a hitter's. That
 * is true of who *earns* them and false of who is *affected* by them: a park
 * that suppresses hits suppresses them for the man batting in it, and a hitter
 * deciding whether to start somebody wants to know he is walking into a ground
 * that eats singles quite as much as the pitcher does. The split was a
 * distinction about baseball imposed on a table that only reports the park.
 *
 * **Strikeouts are the one figure that runs the other way** — more of them is
 * the pitcher's gain where more of everything else is the hitter's — and they
 * are drawn like every other column anyway, because **the tint says how much of
 * a thing happens here, not who it is good for**. Red is *more than an average
 * park* on every figure and both surfaces. That is the rule the club page's
 * bars already follow (*the fill points at the index, not at who it favors*),
 * and it is Savant's own board, whose `SO` column colors 111 red and 87 blue
 * exactly as its `HR` column does.
 */
const PREVIEW_STATS: ParkStat[] = [
  { key: 'runs', label: 'Runs', title: 'Runs scored', full: 40 },
  { key: 'hr', label: 'HR', title: 'Home runs', full: 42 },
  { key: 'hits', label: 'H', title: 'Hits', full: 18 },
  { key: 'bb', label: 'BB', title: 'Walks', full: 26 },
  { key: 'so', label: 'K', title: 'Strikeouts — the one figure here where more of it is the pitcher’s gain', full: 20, pitcherUp: true },
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

/** One figure's tooltip on the preview strip — the number said in words. */
function figTitle(stat: ParkStat, v: number | null): string {
  if (typeof v !== 'number') return `${stat.title} — no index published for this park.`;
  const off = v - 100;
  return (
    `${stat.title}: ${v} — ` +
    (off === 0
      ? 'exactly average.'
      : `${Math.abs(off)}% ${off > 0 ? 'more' : 'fewer'} than an average park.`)
  );
}

/**
 * **The hot/cold tint on a preview figure**, Savant's own way of drawing this
 * board: red above the average park, blue below, and the strength of it is how
 * far.
 *
 * **It saturates at half the rail's scale, not at the whole of it.** The bars on
 * the club's page run to the most extreme park in the league, which is right for
 * a length — it makes a long bar rare and therefore worth something. A *tint* at
 * that scale is the opposite: almost every park would land in the pale middle
 * and the strip would read as uniformly colorless, which is exactly the reading
 * Savant's own table does not give. Half-scale puts the ordinary park at a
 * visible tint and the genuinely extreme one at full strength — measured on the
 * 2026 board, Coors' 109 park factor saturates and Yankee Stadium's 97 to a
 * right-handed hitter sits at a third.
 *
 * Mixed against the strip's own ground rather than painted flat, and the ink is
 * left alone — which is what `MAX_TINT` is for. **70%, and it is a measured
 * number rather than a taste.** The two hues are mid-tone, so a chip at full
 * strength is the classic case that is too light for dark ink and too dark for
 * light: at 100% the figure reads at **3.34:1** in the dark theme, under the
 * 4.5 a 15px weight-800 number needs (it is not WCAG "large text", which starts
 * at 18.66px bold). Measured across the five themes at four caps, the worst case
 * runs 6.67 at 45%, 5.20 at 65%, **4.87 at 70%** and 4.57 at 75% — so 75 passes
 * by 0.07, which is one palette tweak away from failing, and 70 passes with
 * margin in every theme. `frac` still runs the whole 0→1, so the *relative*
 * scale is untouched; only how dark its top gets is capped.
 *
 * The alternative was Savant's own — white ink on a saturated chip — and it does
 * not survive six themes: the ink here is `--text`, which is already near-white
 * in four of them, so switching it buys nothing where the problem actually is.
 */
const MAX_TINT = 70;

function heatStyle(v: number | null, full: number): { background: string } | undefined {
  if (typeof v !== 'number' || full <= 0) return undefined;
  const off = v - 100;
  if (off === 0) return undefined;
  const frac = Math.max(0, Math.min(1, Math.abs(off) / (full / 2)));
  const hue = off > 0 ? 'var(--park-hot)' : 'var(--park-cold)';
  return {
    background: `color-mix(in srgb, ${hue} ${Math.round(frac * MAX_TINT)}%, transparent)`,
  };
}

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
      {/* **No mark on the strikeout row.** It carried a small `P` for a while,
          on the reasoning that a row whose direction means the opposite of every
          other row's should say so where it is read. It is gone because that is
          a fact about *strikeouts*, which any reader of this table already has —
          and a glyph on one row of sixteen reads as a footnote the reader has to
          go and find. The row's own tooltip still names who the number favors,
          which is where the fact belongs; `pitcherUp` survives as the flag that
          makes that sentence come out right rather than as anything drawn. */}
      <span className="pf-label">{stat.label}</span>
      <span className="spl-track">
        {has && off > 0 && (
          <span
            className={`spl-fill spl-fill--${above ? 'r' : 'l'}`}
            style={above ? { left: '50%', width } : { right: '50%', width }}
          />
        )}
      </span>
      {/* **Plain, whatever the number is.** These used to take the accent
          wherever the park was not exactly average, on the platoon card's rule
          that a reading should survive being read at a glance *and* carefully.
          That rule earns its keep there because the accent marks *which of two
          figures is the stronger* — a fact the reader cannot get otherwise. Here
          there is one figure a row and the bar beside it already says both how
          far from average it is and which way, so the color was marking nothing
          except "not 100", which is true of fifteen rows in sixteen. Color is
          spent on state in this app, and "has a value" is not one. */}
      <span className={`pf-val${has ? '' : ' pf-val--none'}`}>{fmt(v)}</span>
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
  onNavigate,
}: {
  venueId: number | null;
  /** Which cut to draw — `hitterHand` for a batter, `all` for a pitcher. */
  hand?: ParkHand;
  /** Why this cut and not another, for the strip's own tooltip. */
  handNote?: string;
  /**
   * **Close the dialog this strip is in**, called just before the club's page
   * opens. The host owns its own `open` flag and this strip cannot reach it —
   * and without it the feed's dialog would stay up *over* the page it just
   * navigated to, the feed being a view rather than an overlay that
   * `openTeam` puts away on its own.
   */
  onNavigate?: () => void;
}) {
  const { park, loading, error } = useParkFactor(venueId);
  const openTeam = useTeamDoor();
  // Rule 1 of the loading system: never a wait over data, and this block *is*
  // a garnish on a dialog whose content is already up. A park still being read
  // draws nothing at all rather than a spinner over somebody's platoon splits;
  // it is one line and it appears when it has something to say.
  if (!venueId || loading || error || !park) return null;
  const indexes = park.hands[hand] ?? park.hands.all;
  if (!indexes) return null;
  const read = parkRead(indexes.woba);

  // **The park's name is the door to the club whose ground it is.** A reader
  // who has just been told the venue moves a night by nine points of wOBA wants
  // the other fourteen indexes, and they are one press away on that club's Park
  // tab — which is the same relationship the Overview's `Stats →` has with the
  // Stats tab, said with the name instead of an arrow because the name is
  // already the thing being read.
  //
  // **A neutral site is not a door**, and that is `ParkFactor.teamId`'s null
  // doing exactly what it is for: nobody is at home in Field of Dreams, so
  // there is no club page for it to lead to and the name stays plain text.
  const club = park.teamId;
  const toClub = club != null && openTeam ? () => {
    onNavigate?.();
    // Straight onto the Park tab, which is the reading the reader pressed the
    // venue's name to get. Landing them on the club's Overview would make the
    // door a navigation rather than an answer.
    openTeam(club, 'park');
  } : null;

  /**
   * **Six figures, the same six on every strip**, and there is no separate
   * *park factor* column: `wOBA` **is** the park factor, which is what Savant's
   * own board means by the name and why that board carries no plain `wOBA`
   * column at all. Two labels over one number are not two facts.
   *
   * **What differs between a batter's and a pitcher's is the cut, not the
   * columns.** A batter reads the ground from his own side of the plate — that
   * is the whole reason the board is fetched by hand — and a pitcher reads both
   * hands together, facing whichever nine the other club writes down. The hand
   * chip in the head is what says which, so the strip does not have to spend a
   * column on it.
   *
   * **It spent one for two commits and no longer does.** A batter's carried the
   * overall wOBA *and* his own beside it (`102` and `97` at Yankee Stadium),
   * which is a real and interesting difference — and it cost a seventh column on
   * the narrowest surface in the app to say something the head already says in
   * three characters. The club's Park tab is where both cuts can be read against
   * each other properly, on a switch and at full width.
   */
  const figs = [
    {
      label: 'wOBA',
      // **The park factor**, on whichever cut this strip is reading — a
      // batter's own side of the plate, a pitcher's both hands. There is no
      // separate `Park factor` column because this *is* it; see the note above.
      value: indexes.woba as number | null,
      full: HEADLINE.full,
      title:
        `wOBA index${hand === 'all' ? ' for all hitters' : ` to ${HAND_LABEL[hand].toLowerCase()}`}` +
        ' — the park factor, and what Savant’s own board leads with. 100 is the average ballpark.',
    },
    ...PREVIEW_STATS.map((st) => ({
      label: st.label,
      value: indexes[st.key] as number | null,
      full: st.full,
      title: figTitle(st, indexes[st.key] as number | null),
    })),
  ];

  return (
    <div className="pf-strip" title={handNote ?? HAND_LABEL[hand]}>
      <div className="pf-strip-head">
        {toClub ? (
          <button
            type="button"
            className="pf-venue pf-venue--door"
            onClick={toClub}
            title={`${park.venue} — open ${park.club ?? 'the club'}’s page for all sixteen park factors`}
          >
            {park.venue}
          </button>
        ) : (
          <span className="pf-venue">{park.venue}</span>
        )}
        <span className={`pf-lean pf-lean--${read.lean}`}>{read.text}</span>
        {hand !== 'all' && <span className="pf-hand">{HAND_SHORT[hand]}</span>}
      </div>
      <div className="pf-figs" style={{ '--pf-figs': figs.length } as CSSProperties}>
        {figs.map((f) => (
          <span key={f.label} className="pf-fig" title={f.title}>
            <span className="pf-fig-label">{f.label}</span>
            {/* **Hot and cold, Savant's own way of drawing this table.** The
                strip has no rails on it — that is the club page's tab — so the
                figures have to carry both halves of the reading themselves, and
                a number's distance from 100 is exactly the kind of scale
                `RULES.md` allows color for: *where a scale genuinely is the
                reading*. Red above the average park, blue below, and the
                strength of the tint is how far. Every figure here runs the same
                way now that K is off the strip, so one hue means one thing. */}
            <span className="pf-fig-val" style={heatStyle(f.value, f.full)}>
              {fmt(f.value)}
            </span>
          </span>
        ))}
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
            More of a stat favors the hitter on every row <em>except</em>{' '}
            <strong>K</strong> — more strikeouts is the pitcher’s gain, so a bar to the right on
            that row is the one that reads the other way.
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
