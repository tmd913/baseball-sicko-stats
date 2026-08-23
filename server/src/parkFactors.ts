import { readJsonBlob, writeJsonBlob } from './storage.js';
import type { ParkFactor, ParkFactors, ParkHand, ParkIndexes } from './types.js';

// Keep in sync with hfSea in savant.ts, CURRENT_SEASON in percentiles.ts, and
// SEASON in xwoba.ts / pitcherArsenal.ts / expectedStats.ts / armAngle.ts /
// research.ts / teamResearch.ts / espn.ts / rotowire.ts.
const SEASON = 2026;

// Savant recomputes a park's index once a night at most — it is a season to
// date over ~14,000 plate appearances, so a day's games move it by a point at
// the very outside — and this is every park and all three hands in one blob.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

let cache: { data: ParkFactors; fetchedAt: number } | null = null;
let inFlight: Promise<ParkFactors> | null = null;

const storeKey = () => `park-factors-${SEASON}-v1.json`;

/**
 * **There is no CSV behind this leaderboard.** Every other Savant board this app
 * reads answers `&csv=true` with a CSV; this one answers it with the HTML page,
 * 200 and 124KB of it — the exact failure mode `RULES.md` warns about, a
 * parameter accepted and ignored. What the page carries instead is the whole
 * table already reduced, as `var data = [...]` on one line of inline script, so
 * the read is the page and the parse is a `JSON.parse` of one capture. That is
 * the same shape `savant-chart-data` records for every chart on the site.
 *
 * Non-greedy to the first `];`, which is safe because the array holds nothing
 * but flat objects of strings and nulls — no nested array can close it early.
 */
const DATA_RE = /var data = (\[[\s\S]*?\]);/;

/** `batSide=` empty is Savant's own spelling of "both hands together". */
const SIDE_PARAM: Record<ParkHand, string> = { all: '', L: 'L', R: 'R' };

const boardUrl = (hand: ParkHand) =>
  'https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?' +
  `type=year&year=${SEASON}&batSide=${SIDE_PARAM[hand]}` +
  // `stat=` decides Savant's own sort order and nothing else — every index
  // column is in the payload whichever one is named — and `rolling=1` is the
  // single season rather than the three-year average the board also offers.
  '&stat=index_wOBA&condition=All&rolling=1&parks=all';

/** One row of Savant's table, every value a string. */
type Row = Record<string, string | null>;

const num = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function indexesOf(r: Row): ParkIndexes | null {
  const woba = num(r.index_woba);
  // The wOBA index is the headline and the one every reader is shown first, so
  // a row without one is not a park this app can say anything about.
  if (woba == null) return null;
  return {
    woba,
    runs: num(r.index_runs),
    hr: num(r.index_hr),
    so: num(r.index_so),
    bb: num(r.index_bb),
    obp: num(r.index_obp),
    hits: num(r.index_hits),
    singles: num(r.index_1b),
    doubles: num(r.index_2b),
    triples: num(r.index_3b),
    hardHit: num(r.index_hardhit),
    wobaCon: num(r.index_wobacon),
    xwobaCon: num(r.index_xwobacon),
    xbaCon: num(r.index_xbacon),
    baCon: num(r.index_bacon),
    wobaTto: num(r.index_wobatto),
    pa: num(r.n_pa) ?? 0,
  };
}

async function fetchSide(hand: ParkHand): Promise<Row[]> {
  const res = await fetch(boardUrl(hand), { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`Savant park factors returned ${res.status} ${res.statusText}`);
  }
  const m = DATA_RE.exec(await res.text());
  if (!m) throw new Error('Savant park factors carried no data table');
  return JSON.parse(m[1]) as Row[];
}

async function build(): Promise<ParkFactors> {
  // Three reads rather than one, and they are three different questions: a
  // park plays differently for a left-handed hitter than a right-handed one,
  // and the gap is the whole reason the cut is worth having — Yankee Stadium's
  // home-run index is **139 to a lefty and 105 to a righty** on the 2026 board,
  // Oracle Park's **64 and 83**. A club's short porch is not a fact about the
  // club, it is a fact about which side of the plate a man stands on.
  const [all, left, right] = await Promise.all([
    fetchSide('all'),
    fetchSide('L'),
    fetchSide('R'),
  ]);

  const parks = new Map<number, ParkFactor>();
  const put = (hand: ParkHand, rows: Row[]) => {
    for (const r of rows) {
      const venueId = num(r.venue_id);
      if (venueId == null) continue;
      const indexes = indexesOf(r);
      if (!indexes) continue;
      let park = parks.get(venueId);
      if (!park) {
        // `main_team_id` is the club whose home park this is, and Savant makes
        // it **negative** for a venue no club is at home in — the neutral sites
        // a season carries a handful of games at (Field of Dreams, Estadio
        // Alfredo Harp Helu, Las Vegas Ballpark on the 2026 board). That is a
        // null club here rather than a guess, and it is exactly why a game's
        // park is joined on its **venue** and never on its home team: a Reds
        // game in Mexico City is not played in Great American Ball Park.
        const teamId = num(r.main_team_id);
        park = {
          venueId,
          venue: r.venue_name ?? '',
          teamId: teamId != null && teamId > 0 ? teamId : null,
          club: r.name_display_club ?? null,
          hands: { all: null, L: null, R: null },
        };
        parks.set(venueId, park);
      }
      park.hands[hand] = indexes;
    }
  };
  put('all', all);
  put('L', left);
  put('R', right);

  return {
    season: SEASON,
    // Biggest park first is Savant's own order and means nothing to a reader
    // arriving at one club's page, so the list is sorted by the name it is
    // going to be read under.
    parks: [...parks.values()].sort((a, b) => a.venue.localeCompare(b.venue)),
  };
}

/**
 * **Every park's Statcast park factors for the season, all three hitter hands.**
 *
 * An index is scaled so that **100 is the league-average park**: 109 means a
 * plate appearance here is worth 9% more wOBA than the same plate appearance
 * would be in a neutral one, and 91 means 9% less. That is the whole of what a
 * reader needs to be told, and it is what the client's key says.
 *
 * Keyed by **venue** rather than by club, which is the join the whole feature
 * rests on — see the note on `main_team_id` above.
 *
 * Cached six hours in memory and in the storage tier behind one `inFlight`
 * guard, the shape `expectedStats.ts` and `armAngle.ts` already have: three
 * page reads is more than any single request should ever be made to wait for
 * twice.
 */
export async function getParkFactors(): Promise<ParkFactors> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const stored = await readJsonBlob<ParkFactors>(
      storeKey(),
      (_v, cachedAt) => Date.now() - cachedAt < CACHE_TTL_MS,
    );
    if (stored) {
      cache = { data: stored, fetchedAt: Date.now() };
      return stored;
    }
    const data = await build();
    cache = { data, fetchedAt: Date.now() };
    await writeJsonBlob(storeKey(), data);
    return data;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
