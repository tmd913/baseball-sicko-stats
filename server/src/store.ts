import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, baseballToday } from './etDate.js';
import { playerKey } from './types.js';
import type { PlayerKind, ResearchIncludeKey, WatchPlayer } from './types.js';

/**
 * Everything saved for one user — and there are **two** lists of players in it,
 * which the app spent a long time calling by one name.
 *
 * - The **roster** (`players`) is the list the Summary, Games and Feed views
 *   report on. It is what the reorder screen edits and what a fantasy team
 *   stands in for when `rosterSource` says so.
 * - The **watchlist** (`watchlist`) is a set of `playerKey` strings followed on
 *   the research board — a free agent you are thinking about is on it and not
 *   on your roster, which is the whole point of having two.
 *
 * The exports below are named for that split (`getRoster`, `addRosterPlayer`, …
 * against `getWatchlist`, `setWatchlisted`), which means **`getWatchlist` has
 * changed meaning**: it used to return the roster and now returns the
 * watchlist's keys. The types differ (`WatchPlayer[]` against `string[]`), so
 * every call site of the old one is a compile error rather than a silent
 * change of behavior. Two names are deliberately *not* touched: the
 * `WATCHLIST_TABLE` environment variable, which infra owns and which naming is
 * not worth a stack update over, and the `/api/watchlist` routes, which every
 * browser tab open at deploy time is still calling for its roster.
 *
 * The stored item's own attribute names were already neutral: `players` for the
 * roster, so nothing had to be migrated to tell the two apart.
 *
 * Two backends, chosen by whether `WATCHLIST_TABLE` is set: DynamoDB (one item
 * per Cognito `sub`) when deployed, and the original `server/data/watchlist.json`
 * locally, where `userId` is always the single dev user.
 *
 * There is deliberately **no module-level cache**. The previous version kept the
 * loaded list in a module variable that was never invalidated, so two processes
 * would each serve their own stale copy and the second writer would silently
 * overwrite the first — the whole list is rewritten on every mutation, with no
 * merge. Harmless with one long-lived server; a data-loss bug the moment there
 * is more than one instance. Every call now reads through, and DynamoDB writes
 * are guarded by a version check.
 */

const TABLE = process.env.WATCHLIST_TABLE;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'watchlist.json');

/** The single local user, matching `auth.ts`'s `DEV_USER_ID ?? 'local'` — used
 *  only where a file-backed call has no request to read the id from. */
const DEV_USER = process.env.DEV_USER_ID ?? 'local';

/**
 * **A named list of players followed on the research board**, of which there
 * may now be several.
 *
 * The watchlist used to be one list and one attribute — `watchlist: string[]`
 * on the item — and the reason to have more than one is the same reason there
 * are two lists in the first place: a reader keeps *sets* of players, and
 * "closers I might stream", "the guys I'd trade for" and "prospects to watch"
 * are three questions, not one list of thirty names.
 *
 * **Keys, not entries**, which is the rule the single list already followed and
 * for the same reason: the board holds every row it could mark, so a stored
 * name and club would be a second and staler copy. Nothing about that changed.
 *
 * `id` is minted here and is opaque to the client — an id rather than the name
 * because a list can be **renamed**, and every reference to one (the active
 * choice on the record, a share pointing at it, a link in somebody's history)
 * would otherwise break the moment its owner corrected a typo.
 */
export interface SavedList {
  id: string;
  name: string;
  /** `playerKey` strings, newest first — the order `setWatchlisted` has always
   *  maintained. */
  keys: string[];
  /**
   * The share code this list is reachable by, or absent when it is not shared.
   *
   * Present means *anyone holding the code may read it*; it is not a list of
   * who has. Revoking clears it here **and** deletes the pointer record, and a
   * read requires the two to agree — the same both-must-agree rule
   * `leagueForInvite` uses, so a half-finished revoke cannot leave a working
   * link behind.
   */
  shareCode?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * **A named reading of the research board** — the whole of what decides which
 * rows are on screen, in which order, under which columns.
 *
 * `board` is **opaque here on purpose.** Which positions exist, what a window
 * is, which column keys are real, what a filter's operator may be — every one
 * of those is the client's vocabulary (`ResearchTable.tsx`), and this is the
 * split `researchColumns` already makes: the route checks the *shape* of what
 * arrived and the meaning lives where the thing is drawn. So a build that adds
 * a column or a filter operator needs no server change at all, and a saved
 * search written by a newer browser is narrowed by an older one rather than
 * rejected by an older server.
 *
 * What the server does own is the envelope: the id, the name, the stamps, the
 * share code, and the caps below.
 */
export interface SavedSearch {
  id: string;
  name: string;
  /** The board's reading as the client defines it — see above. */
  board: Record<string, unknown>;
  /** As `SavedList.shareCode`, and revoked the same way. */
  shareCode?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * How many of each a user may keep, and how big one may be.
 *
 * These are not arbitrary: the whole user record is **one DynamoDB item**, and
 * an item has a hard 400KB ceiling that the roster, the tombstones and the
 * preferences already sit inside. A cap that is never reached costs nothing; an
 * uncapped list of searches on a shared item is a way to make somebody's entire
 * saved state unwritable, roster included, with no way back through the UI.
 * So each is checked at the route and the numbers are generous against any real
 * use: measured, a search's `board` with forty columns, six filters and a
 * search string serializes to ~1.4KB, so thirty of them is ~42KB.
 */
export const MAX_LISTS = 20;
export const MAX_SEARCHES = 30;
export const MAX_LIST_KEYS = 500;
export const MAX_NAME_LEN = 60;
/** Serialized `board`, in bytes. */
export const MAX_BOARD_BYTES = 8_000;

/**
 * Everything saved for one user. Preferences live on the **same item** as the
 * watchlist rather than in a store of their own: same partition key, same
 * version-conditional write, no second table to provision — and a user's saved
 * state is one thing to read on sign-in.
 */
export interface UserPrefs {
  /** The research board's visible columns, per board. Absent means that
   *  board's defaults; the client owns the column vocabulary and narrows
   *  anything it doesn't recognize, so nothing here is validated against it. */
  researchColumns?: Partial<Record<PlayerKind, string[]>>;
  /**
   * The **player page's Stats tab** columns, per kind — a separate entry from
   * `researchColumns` although the two are drawn from one vocabulary.
   *
   * They could have been one key, and "the same columns in two places is one
   * preference" is a real argument. What decides it is that the two tables do
   * not have the same columns to offer: the Stats tab cuts `Opp`, `Ros%` and
   * the five trend columns, which are facts about a player or about this
   * afternoon rather than about a span (see `PlayerWindowTable.tsx`). Sharing
   * the entry would therefore mean a write from the player page **silently
   * dropping six columns from the board's saved set** — the very hazard
   * `ColumnPicker`'s reorder threads around within one table — and the two are
   * read for different things anyway: a board is scanned across six hundred
   * names, a player page down five spans of one man.
   *
   * Absent means that kind's defaults, the same convention as everything else
   * here. There is deliberately no URL parameter to go with it: `cols=` names
   * the board `pos=` selects, and the open player-page tab is in no URL at all.
   */
  statsColumns?: Partial<Record<PlayerKind, string[]>>;
  /**
   * The research board's **projected** reading, per kind — a third entry
   * alongside the two above and its own for the identical reason the Stats
   * tab's is: the lens offers a **strict subset** of the board's vocabulary
   * (only what a projection can actually fill), so a write from it would drop
   * every Statcast and roster-% column from the board's saved list. Absent
   * means that kind's projected defaults, the same convention.
   */
  projectedColumns?: Partial<Record<PlayerKind, string[]>>;
  /** Keep players on the IL off the players view (the settings-menu toggle).
   *  Absent means off, which is the default — see `setHideInjured`. */
  hideInjured?: boolean;
  /** Play every video clip with the sound off (the settings-menu toggle).
   *  Absent means off, the same convention as `hideInjured`. */
  muteAudio?: boolean;
  /** Draw a percentile rank under every value on the research board and the
   *  player page's Stats tab. Absent means off, the same
   *  absence-is-the-default convention as the two toggles above. One entry for
   *  both tables rather than one each: they are the same column vocabulary, and
   *  this is a habit of reading rather than a setting on a table. */
  statRanks?: boolean;
  /**
   * **Which density the player page's Percentile Rankings tab opens at** —
   * `'summary'`, Savant's own fifteen bars, or `'detailed'`, every row this app
   * ranks.
   *
   * A preference rather than a URL parameter, and beside `statRanks` rather
   * than beside `statsCut`, because it is the same kind of thing `statRanks`
   * is: a **habit of reading**. The cut a reader picks is *which numbers the
   * card is about* and goes in the URL, where a link can carry it; the density
   * is how many rows that reader likes to be shown, which is true of them on
   * every player they open and is not worth a stranger inheriting from a link.
   *
   * Absent means the default, the convention every entry here follows — and the
   * default is **summary**, which is a change of behavior for anyone who used
   * this tab before the switch existed. Deliberate: the fifteen-bar card is the
   * one a reader means by "the Savant card", the detailed one is a door off it,
   * and absence-is-the-default is exactly what lets that call be revisited
   * without anybody's record needing to be.
   *
   * A string rather than a boolean for the reason `theme` is one: there can be a
   * third density, and a value the client does not recognize reads as the
   * default rather than emptying the tab.
   */
  percentileDensity?: string;
  /**
   * The color scheme, by id — `'midnight'` (the dark original) or
   * `'lavender'`. Absent means the default, which is the convention every
   * toggle above follows and is the right one here for the same reason: the
   * default can change without anyone's record needing revisiting.
   *
   * A string rather than a boolean because there can be a third theme, and an
   * id the client does not recognize is read as the default rather than
   * rejected — so a record written by a newer build opens an older tab on
   * Midnight instead of on nothing. Which ids exist is the **client's**
   * business (`client/src/theme.ts`): this is the same split `researchColumns`
   * makes, where the route validates the shape of a key and the vocabulary
   * lives where the thing is drawn.
   */
  theme?: string;
  /**
   * Read the roster views off the user's **ESPN fantasy team** instead of the
   * list they built here.
   *
   * The one preference here that stores **both** of its values, and absence
   * therefore means *unspecified* rather than off. That is a sharpening of the
   * convention above rather than a departure from it: absent has always meant
   * "the user has said nothing, so the default applies", and the reason to
   * write `'saved'` down is that something now acts on the difference — naming
   * a team for the first time turns this on **only for a user who has never
   * stated a source** (see `App.tsx::firstTeamNamed`). A user who has worked
   * the toggle either way has stated one, so their record says so and the app
   * leaves it alone. Reading is unchanged in both workspaces (`=== 'fantasy'`
   * is the only test anywhere), so a record written before this still reads as
   * the saved roster; what it no longer claims is that its owner *chose* it.
   */
  rosterSource?: 'fantasy' | 'saved';
  /**
   * Which of the three **ownership** sets the research board includes. Absent
   * means the default — free agents alone — the same absence-is-the-default
   * convention the toggles above follow, so the default can change without
   * anyone's record needing revisiting. An empty array is a real state (the
   * user has turned all three off) and is stored as such, which is why this
   * can't lean on `[]` meaning absent.
   */
  researchInclude?: ResearchIncludeKey[];
  /** Put the watchlist on the research board **as well as** those sets. Absent
   *  means off. */
  researchWatchlist?: boolean;
  /**
   * **Which of the user's watchlists is the active one** — the list the board's
   * star writes to, the list its Watchlist button unions on, the list every
   * surface that says "the watchlist" means.
   *
   * A preference and not a URL parameter, which is the app's own line: the
   * active list is a fact about the person, true of them on every view and
   * across every device, where a *shared* list is a transient thing a link
   * hands you and lives in the URL for exactly as long as you are looking at
   * it. That separation is what makes "opening somebody's shared list must not
   * disturb your own" a property of the design rather than a thing to remember.
   *
   * Absent means **the first list**, which is the same absence-is-the-default
   * convention as everything else here and is what makes the migration free: a
   * record that has never seen this feature has one list (its old `watchlist`,
   * read forward by `listsOf`) and no entry here, and that resolves to exactly
   * the list it always had. An id naming a list that has since been deleted
   * falls back the same way rather than emptying the board — the standing rule
   * for an unrecognized value.
   */
  activeWatchlistId?: string;
  /**
   * The last few players picked out of the header search, most recent first —
   * what that field offers before a single character has been typed.
   *
   * **Keys, not entries**, which is the rule the watchlist already follows and
   * for the same reason one step stronger: the client that renders these rows
   * is holding the season roster anyway (`getSeasonPlayers`, the ~1,400-row
   * list the search itself matches against), so a stored name, club and Savant
   * spelling would only be a second and staler copy of what is already in
   * hand — and a player who has left that list is one the search cannot find
   * either, so a row for him would be a row that opens on nothing. It also
   * means the app's `${kind}-${id}` key is what is stored, so a two-way player
   * picked as a pitcher is a different entry from the same man picked as a
   * batter, exactly as he is a different roster entry and a different star.
   *
   * Absent means none, the convention everything else here follows — a user
   * who has never searched and one whose picks are all of players since gone
   * from the season roster read the same.
   */
  recentPlayers?: string[];
  /**
   * How far the reader has got down the League page's **Transactions** feed —
   * the date of the newest move they had seen when that tab was last open, and
   * the league it belonged to. What it is for is the red dot on the tab: a feed
   * is unread until somebody looks at it, and "unread" is a fact about a person
   * rather than about a view, so it belongs here beside `recentPlayers` rather
   * than in the URL or in a link somebody might be handed.
   *
   * **The league id is stored with the date and is not decoration.** A marker
   * only means anything against the feed it was taken from, so a user who moves
   * to another league — or joins a leaguemate's — would otherwise have that
   * league's whole history silently marked read by a timestamp with nothing to
   * do with it. Requiring the id to match fails in the one safe direction: an
   * unrecognized league draws the dot, which is news offered rather than news
   * hidden.
   *
   * **A date rather than a transaction id**, because the feed's own order is by
   * date and ESPN's topic ids are opaque strings — "newer than the last thing I
   * saw" is a comparison a date supports and an id does not. Absent means
   * nothing has ever been read, which draws the dot, which is right: a reader
   * who has never opened the tab has seen none of it.
   */
  seenTransactions?: { leagueId: number; ts: number };
  /**
   * How far down the **Feed** view's stream of plays this reader has got —
   * epoch ms of the newest play they marked read. What draws, and undraws, the
   * red `N new plays` button at the head of the Recent section, and what the
   * feed's `New` filter narrows to.
   *
   * A bare timestamp where `seenTransactions` carries a league id beside its
   * own, because a play is not scoped to anything a reader can switch between:
   * it belongs to a roster and a date range, and both of those are already the
   * thing the feed is about. Absent means the reader has never marked anything
   * read, which the client seeds to its own boot instant rather than to zero —
   * a stream that opens on "84 new plays" is a mark nobody reads.
   */
  seenPlays?: number;
  /**
   * @deprecated The same flag under the name it carried when it *narrowed* the
   * board to the watchlist rather than adding the watchlist to it. Kept on the
   * type because `GET /api/prefs` hands the stored object straight to the
   * browser and the client reads it as a fallback; the next write of this
   * control drops it, so a record migrates as it is used — the rule
   * `getEspnCreds` follows for the legacy inline credential rather than a
   * migration script over every user.
   */
  researchWatchlistOnly?: boolean;
}

/**
 * A user's ESPN fantasy league connection.
 *
 * Deliberately **not** a field on `UserPrefs`: `GET /api/prefs` hands that whole
 * object to the browser, and `espnS2` is a live session cookie for the user's
 * ESPN account. Keeping it a sibling means the leak would have to be written on
 * purpose rather than inherited by adding a key. Nothing here is ever returned
 * from the API — see the `/api/espn` routes, which answer with a status object
 * built from the harmless half.
 */
export interface EspnLeague {
  leagueId: number;
  /**
   * **Legacy.** The credential now lives on the `league#<id>` record so it can
   * be shared and refreshed by any member; these two remain only so a
   * connection saved before that still works, and `getEspnCreds` promotes one
   * into a league record the first time it sees it. Nothing writes them.
   *
   * Null was, and still is, what a **public** league stores: ESPN serves one to
   * anyone, so there is no credential at all.
   */
  swid?: string | null;
  espnS2?: string | null;
  /** Cached at connect time so the status can name the league and the user's
   *  own team without a round trip to ESPN. */
  leagueName?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  savedAt: number;
}

/**
 * A roster entry as it is **stored** — a `WatchPlayer` plus the day it joined.
 *
 * The stamp is on this type rather than on `WatchPlayer` itself deliberately:
 * `WatchPlayer` is what every report, season player and card in both workspaces
 * is built on, and *when he joined your roster* is a fact about this one list.
 * Nothing outside this file needs it, so nothing outside this file carries it —
 * which is also why the client's hand-mirrored `types.ts` did not have to move
 * for any of this.
 */
export interface RosterEntry extends WatchPlayer {
  /**
   * The ET baseball day he went on the roster (`baseballToday()` — the app's
   * one definition of today, which turns at 3am ET), **inclusive**: he is
   * reported on from this day forward.
   *
   * Optional, and that is the migration. An entry saved before the roster had a
   * history has no stamp and is read as having been there **forever**, so it
   * passes every date test. The other way round — reading an unstamped entry as
   * added today — would make every existing user's history appear to begin on
   * the day this deployed, which is a claim the reader has no way to catch. It
   * is the rule `getEspnCreds` follows for the legacy inline credential: read
   * the older shape on the way in, write only the newer one, and let a record
   * migrate the first time its owner touches it.
   */
  addedAt?: string;
}

/**
 * A player who has come **off** the roster, kept as a tombstone rather than
 * dropped outright, so the days he *was* held can still be reported on.
 *
 * The two stamps make a **half-open** interval, `[addedAt, removedAt)`: each is
 * the day its own action happened, and a removal takes effect on the day it is
 * made. That asymmetry is doing real work. It keeps "remove" meaning remove —
 * press ✕ and he is off today's table on the very next read, exactly as he
 * always was, which is what `removeFromEditor` on the client already assumes
 * when it drops his row before the refetch lands — while yesterday, which you
 * really did hold him for, still has him. A player added and dropped inside one
 * day was held for no days at all and leaves no tombstone at all.
 */
export interface RosterRemoval extends RosterEntry {
  /** The ET baseball day the removal happened — the first day he was no longer
   *  held. */
  removedAt: string;
}

/**
 * How far back a tombstone is worth keeping.
 *
 * `/api/report` caps a span at `MAX_RANGE_DAYS` (62), so a player dropped more
 * than that many days before the latest day anyone can be looking at can never
 * appear on a range that reaches him. 70 is that with a week of slack for a
 * range running into the future (the `Tomorrow` preset ends a day past today,
 * and the picker allows the rest of the season). Pruned on every write that
 * touches the list, or the item grows for the life of the account.
 *
 * Pruning too eagerly fails **into the old behavior and no further**: a player
 * whose tombstone has gone is simply absent from that range, which is what
 * every dropped player was from every range before any of this existed.
 */
const HISTORY_DAYS = 70;

function pruneRemovals(list: RosterRemoval[], today: string): RosterRemoval[] {
  const cutoff = addDays(today, -HISTORY_DAYS);
  return list.filter((r) => r.removedAt > cutoff);
}

/** The saved record plus the version it was read at, so a write can detect a
 *  lost update. */
interface Versioned {
  /** The roster — the saved list the Summary, Games and Feed views read, each
   *  entry stamped with the day it joined. */
  players: RosterEntry[];
  /**
   * The roster's tombstones — players dropped recently enough that a range on
   * screen could still reach a day they were held.
   *
   * Absent from the stored item when empty, the convention `watchlist` and
   * `espn` already follow, so a user who has never dropped anybody and one
   * whose history has aged out are the same stored state. A record saved before
   * this existed has no attribute either, which reads as "nobody has ever been
   * dropped" — the same direction the missing `addedAt` fails in.
   */
  removed: RosterRemoval[];
  /** The watchlist — `playerKey` strings followed on the research board.
   *  Keys rather than entries: the board already holds every row it could
   *  mark, so a stored copy of the name would only be a second and staler one,
   *  and membership is the whole of what this list is. */
  watchlist: string[];
  /**
   * **The named lists, which are what the watchlist is now** — and `watchlist`
   * above is the shape they are read forward *from* rather than a second copy
   * of them.
   *
   * A record written before this has a `watchlist` attribute and no
   * `watchlists`; `listsOf` turns that into a single list called `Watchlist`
   * with the keys it always had, so nothing migrates until its owner touches
   * it. On the first write the item is replaced and the legacy attribute goes
   * with it — the rule `getEspnCreds` follows for the legacy inline credential,
   * a migration that happens as people use the app rather than in a script over
   * every account.
   *
   * **The cost of that rule is the rollback**, and it is worth writing down: a
   * user who has touched this and then meets an older build has a record with
   * no `watchlist` attribute, and that build reads an empty watchlist. It is
   * recoverable (nothing is deleted — the keys are in `watchlists`) and it is
   * the same exposure every read-forward migration in this codebase carries.
   */
  watchlists: SavedList[];
  /** The named readings of the research board. Absent on a record that has
   *  never saved one, which reads as none — the convention `removed` and
   *  `espn` already follow. */
  searches: SavedSearch[];
  prefs: UserPrefs;
  espn: EspnLeague | null;
  version: number;
}

/**
 * The user's lists, **reading a legacy record forward**.
 *
 * One place, called by both backends' loaders, so the migration is a property
 * of loading rather than something each caller has to remember. A record with
 * `watchlists` is handed back as it is; one with only the old `watchlist`
 * attribute becomes a single list under a name — and a record with neither
 * becomes a single **empty** list rather than no lists at all, because every
 * surface downstream assumes there is a list to be active, and "you have no
 * watchlists" is a state the UI would have to invent an empty state for that
 * nobody can reach on purpose.
 */
const LEGACY_LIST_ID = 'default';

function listsOf(
  stored: SavedList[] | undefined,
  legacy: string[] | undefined,
): SavedList[] {
  if (stored && stored.length) return stored;
  return [
    {
      id: LEGACY_LIST_ID,
      // The word every surface in the app already uses for it, so a user who
      // never asked for more than one list never meets the fact that there can
      // be. Renaming it is theirs to do.
      name: 'Watchlist',
      keys: legacy ?? [],
      // Zero rather than "now": the list is as old as the record, and stamping
      // it with the moment of the migration would make every legacy list look
      // as though it had been created the day this deployed.
      createdAt: 0,
      updatedAt: 0,
    },
  ];
}

/** Entries saved before `kind` existed are batters. */
function migrate(players: RosterEntry[]): RosterEntry[] {
  return players.map((p) => ({ ...p, kind: p.kind ?? 'batter' }));
}

// ---- DynamoDB backend -------------------------------------------------

interface DocClient {
  send(command: unknown): Promise<Record<string, unknown>>;
}

let ddbPromise: Promise<{
  doc: DocClient;
  Get: new (i: unknown) => unknown;
  Put: new (i: unknown) => unknown;
  Scan: new (i: unknown) => unknown;
  Delete: new (i: unknown) => unknown;
}> | null = null;

function ddb() {
  if (ddbPromise) return ddbPromise;
  ddbPromise = (async () => {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, ScanCommand } =
      await import('@aws-sdk/lib-dynamodb');
    return {
      doc: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        // Undefined shows up in optional WatchPlayer fields; dropping it is
        // friendlier than rejecting the write.
        marshallOptions: { removeUndefinedValues: true },
      }) as unknown as DocClient,
      Get: GetCommand as unknown as new (i: unknown) => unknown,
      Put: PutCommand as unknown as new (i: unknown) => unknown,
      Scan: ScanCommand as unknown as new (i: unknown) => unknown,
      Delete: DeleteCommand as unknown as new (i: unknown) => unknown,
    };
  })();
  return ddbPromise;
}

async function ddbLoad(userId: string): Promise<Versioned> {
  const { doc, Get } = await ddb();
  const res = await doc.send(
    new Get({ TableName: TABLE, Key: { userId }, ConsistentRead: true }),
  );
  const item = res.Item as
    | {
        players?: RosterEntry[];
        removed?: RosterRemoval[];
        watchlist?: string[];
        watchlists?: SavedList[];
        searches?: SavedSearch[];
        prefs?: UserPrefs;
        espn?: EspnLeague;
        version?: number;
      }
    | undefined;
  // Only a genuinely absent item is an empty watchlist. Anything else — a
  // throttle, a network blip — throws, because swallowing it would render the
  // "your watchlist is empty" state and then persist that emptiness.
  if (!item) {
    return {
      players: [],
      removed: [],
      watchlist: [],
      watchlists: listsOf(undefined, undefined),
      searches: [],
      prefs: {},
      espn: null,
      version: 0,
    };
  }
  return {
    players: migrate(item.players ?? []),
    removed: migrate(item.removed ?? []) as RosterRemoval[],
    watchlist: item.watchlist ?? [],
    watchlists: listsOf(item.watchlists, item.watchlist),
    searches: item.searches ?? [],
    prefs: item.prefs ?? {},
    espn: item.espn ?? null,
    version: item.version ?? 0,
  };
}

async function ddbPersist(userId: string, next: Versioned): Promise<void> {
  const { doc, Put } = await ddb();
  await doc.send(
    new Put({
      TableName: TABLE,
      Item: {
        userId,
        players: next.players,
        // Absent rather than empty, for the reason `espn` is: a user who has
        // never watchlisted anybody and one who has cleared the list are the
        // same stored state. The roster's tombstones follow the same rule.
        ...(next.removed.length ? { removed: next.removed } : {}),
        // **The named lists are what is written, and the legacy attribute is
        // not.** A `Put` replaces the whole item, so the old `watchlist` simply
        // stops existing on the first write after this deploys — see
        // `Versioned.watchlists` for the read-forward and what it costs on a
        // rollback. Absent rather than empty follows the rule beside it, and a
        // user with one empty list is stored as no lists at all, which
        // `listsOf` reads straight back as one empty list.
        ...(next.watchlists.some((l) => l.keys.length || l.name !== 'Watchlist' || l.shareCode)
          ? { watchlists: next.watchlists }
          : {}),
        ...(next.searches.length ? { searches: next.searches } : {}),
        prefs: next.prefs,
        // Absent rather than null when there is no connection, so disconnecting
        // removes the credential from the item instead of leaving a tombstone.
        ...(next.espn ? { espn: next.espn } : {}),
        version: next.version + 1,
      },
      // Reject the write if someone else moved the item since we read it.
      ConditionExpression: 'attribute_not_exists(version) OR version = :v',
      ExpressionAttributeValues: { ':v': next.version },
    }),
  );
}

// ---- Filesystem backend -----------------------------------------------

/**
 * The dev file, as a map of the same keyed records DynamoDB holds.
 *
 * It used to be one user's record and nothing else, which stopped working when
 * a **league** became a record of its own (see `LeagueRecord`): those are keyed
 * by league rather than by user, and two of them can exist beside a single dev
 * user. So the file now mirrors the table — `{ records: { <key>: item } }` —
 * and the two backends have the same shape rather than one being a special
 * case of a single row.
 *
 * Both older shapes still read: the bare array from before preferences, and the
 * single `{ players, prefs, espn }` object from before this. Either is folded
 * under the reading user's key and the next write saves the newer form, so a
 * dev machine's existing list migrates in place rather than being lost.
 */
type FileDb = Record<string, Record<string, unknown>>;

async function fileDb(): Promise<FileDb> {
  let raw: string;
  try {
    raw = await fs.readFile(FILE, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    // A malformed file shouldn't be silently replaced by an empty one on the
    // next write.
    throw err;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) return { __legacy: { players: parsed } };
  const obj = parsed as Record<string, unknown>;
  if (obj.records && typeof obj.records === 'object') return obj.records as FileDb;
  return { __legacy: obj };
}

/**
 * Write the dev record **atomically**, and one write at a time.
 *
 * `fs.writeFile` over an existing path truncates and rewrites **in place**, so
 * a write that is shorter than what is already there leaves the tail of the old
 * document behind — and a JSON document with a byte of another one after it
 * does not parse. That is not a lost update, which this backend has always been
 * documented as risking; it is a **corrupted file**, and once it happens every
 * read *and* every write fails until somebody repairs it by hand.
 *
 * It was reproduced rather than guessed at: two preference writes fired back to
 * back from one settings menu (a theme and a toggle) left `watchlist.json` as a
 * valid 8,056-byte document followed by a single stray `}`, and both writes then
 * came back **502** — as did every one after them. The roster, the watchlist and
 * the league's ESPN credential were all in that file.
 *
 * Two lines fix it and each answers a different half:
 *
 * - **A temp file and a rename.** `rename(2)` is atomic within a filesystem, so
 *   a reader sees either the whole old document or the whole new one and never a
 *   splice of the two. The temp name carries the pid so two processes sharing a
 *   `server/data/` cannot collide on it.
 * - **A promise chain**, so two writes *in this process* cannot interleave at
 *   all. `client/src/App.tsx::queueUserWrite` does the same one tier up and is
 *   the reason a single tab is orderly; this is what makes two tabs, a tab and a
 *   `curl`, or anything else pointed at the same file safe as well.
 *
 * What it deliberately does **not** do is give this backend the versioned,
 * conditional write DynamoDB gets. A concurrent read-modify-write here can still
 * *lose* an update, which is the documented shape and is what `mutate`'s replay
 * handles where it can; what it can no longer do is destroy the file.
 */
let fileWrites: Promise<unknown> = Promise.resolve();
async function fileWriteDb(db: FileDb): Promise<void> {
  const run = async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ records: db }, null, 2), 'utf8');
    await fs.rename(tmp, FILE);
  };
  const next = fileWrites.then(run, run);
  fileWrites = next.catch(() => undefined);
  return next;
}

async function fileLoad(userId: string): Promise<Versioned> {
  const db = await fileDb();
  const item = (db[userId] ?? db.__legacy ?? {}) as {
    players?: RosterEntry[];
    removed?: RosterRemoval[];
    watchlist?: string[];
    watchlists?: SavedList[];
    searches?: SavedSearch[];
    prefs?: UserPrefs;
    espn?: EspnLeague;
  };
  return {
    players: migrate(item.players ?? []),
    removed: migrate(item.removed ?? []) as RosterRemoval[],
    watchlist: item.watchlist ?? [],
    watchlists: listsOf(item.watchlists, item.watchlist),
    searches: item.searches ?? [],
    prefs: item.prefs ?? {},
    espn: item.espn ?? null,
    version: 0,
  };
}

async function filePersist(userId: string, next: Versioned): Promise<void> {
  const db = await fileDb();
  delete db.__legacy;
  db[userId] = {
    players: next.players,
    ...(next.removed.length ? { removed: next.removed } : {}),
    ...(next.watchlists.some((l) => l.keys.length || l.name !== 'Watchlist' || l.shareCode)
      ? { watchlists: next.watchlists }
      : {}),
    ...(next.searches.length ? { searches: next.searches } : {}),
    prefs: next.prefs,
    ...(next.espn ? { espn: next.espn } : {}),
  };
  await fileWriteDb(db);
}

// ---- Read/modify/write ------------------------------------------------

async function load(userId: string): Promise<Versioned> {
  return TABLE ? ddbLoad(userId) : fileLoad(userId);
}

async function persist(userId: string, next: Versioned): Promise<void> {
  if (TABLE) await ddbPersist(userId, next);
  else await filePersist(userId, next);
}

function isConflict(err: unknown): boolean {
  return (err as { name?: string })?.name === 'ConditionalCheckFailedException';
}

/**
 * Apply `change` to the user's list and save the result. On a lost update the
 * read/modify/write is replayed once against the newer list — the mutations
 * here are all idempotent-ish set operations, so replaying is the right
 * resolution rather than failing the request.
 */
async function mutate(
  userId: string,
  change: (current: Versioned) => Partial<Omit<Versioned, 'version'>> | null,
): Promise<Versioned> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await load(userId);
    const patch = change(current);
    if (patch === null) return current; // no-op, nothing to write
    // A **patch** rather than a whole record, so a mutation names only the
    // field it touches: the item now carries a roster, a watchlist, the
    // preferences and the ESPN reference, and a caller that has to restate all
    // four is a caller that will one day drop one of them by omission.
    const next = { ...current, ...patch };
    try {
      await persist(userId, { ...next, version: current.version });
      return { ...next, version: current.version + 1 };
    } catch (err) {
      if (attempt === 0 && isConflict(err)) continue;
      throw err;
    }
  }
  throw new Error('user record update failed: too much concurrent modification');
}

/** The roster half of `mutate`, so the list mutations below read as they always
 *  have — they name the one field they change and everything else on the item
 *  rides through untouched. */
async function update(
  userId: string,
  change: (players: RosterEntry[]) => RosterEntry[] | null,
): Promise<RosterEntry[]> {
  const next = await mutate(userId, (cur) => {
    const players = change(cur.players);
    return players === null ? null : { players };
  });
  return next.players;
}

/** The user's roster — the list the Summary, Games and Feed views report on.
 *  (Named `getWatchlist` until the two lists were told apart; that name now
 *  belongs to the research board's list, further down.) */
export async function getRoster(userId: string): Promise<RosterEntry[]> {
  return (await load(userId)).players;
}

/**
 * Adds unless the same player is already watched *as that kind* — a two-way
 * player is two separate entries, one per kind.
 *
 * The `addedAt` stamp is minted **here** rather than by the route, so every
 * caller gets one and there is one place that decides what "today" means. A
 * re-add after a drop leaves the old tombstone standing rather than clearing
 * it: those were days he really was held, and the two intervals are read as a
 * union (see `getRosterForRange`).
 */
export async function addRosterPlayer(userId: string, player: WatchPlayer): Promise<RosterEntry[]> {
  const addedAt = baseballToday();
  return update(userId, (list) => {
    const key = playerKey(player);
    if (list.some((p) => playerKey(p) === key)) return null;
    return [{ ...player, addedAt }, ...list];
  });
}

/**
 * Removes one entry. Without `kind`, removes every entry for the id — which is
 * what a client that predates two-way support means by "remove this player".
 *
 * Each entry that goes leaves a **tombstone** stamped with today, so the days
 * he was held can still be reported on; an entry added and dropped inside the
 * same day was held for no days and leaves nothing behind. The write goes
 * through `mutate` rather than the roster-only `update` because it touches two
 * fields of the item, and it is the one place the tombstone list is pruned —
 * which is exactly the right place, being the only one that ever grows it.
 */
export async function removeRosterPlayer(
  userId: string,
  id: number,
  kind?: PlayerKind,
): Promise<RosterEntry[]> {
  const removedAt = baseballToday();
  const next = await mutate(userId, (cur) => {
    const hit = (p: RosterEntry) => p.id === id && (kind === undefined || p.kind === kind);
    const gone = cur.players.filter(hit);
    const players = cur.players.filter((p) => !hit(p));
    const removed = pruneRemovals(
      [
        // A zero-length span is no history at all.
        ...gone.flatMap((p) =>
          p.addedAt !== undefined && p.addedAt >= removedAt ? [] : [{ ...p, removedAt }],
        ),
        ...cur.removed,
      ],
      removedAt,
    );
    // Nothing removed and nothing to prune is nothing to write.
    if (gone.length === 0 && removed.length === cur.removed.length) return null;
    return { players, removed };
  });
  return next.players;
}

/** One interval of the range a player was held for, resolved into the days
 *  themselves — the range is at most `MAX_RANGE_DAYS` (62) long, so a set of
 *  date strings is both the cheapest and the least ambiguous way to say it. */
export interface RosterOverRange {
  /**
   * Everyone who was on the roster on **any** day of the range: the live
   * entries first, in their saved order — which is the order the reorder screen
   * set and the order the summary table reads — then the dropped ones,
   * most-recently-dropped first. A player who was on it for none of the days is
   * not in this list at all.
   */
  players: WatchPlayer[];
  /** Player key → the days of the range he was actually held. Always fully
   *  populated for every key in `players`, so a reader never has to know what
   *  an absent entry would have meant. */
  heldDays: Map<string, Set<string>>;
}

/**
 * The roster **as it stood over a range**, which is what the Roster and Feed
 * views are about: they report on a span of days, and the list of players those
 * days belonged to is not today's list.
 *
 * Two facts come back rather than one, because the question has two halves and
 * only answering the first is what the app used to do. *Who* was on the roster
 * at some point in the range decides which rows exist; *which days* each was
 * held decides what each row is allowed to count. A player added on Wednesday
 * has a row over a week that starts on Monday, and Monday and Tuesday are not
 * his.
 *
 * A player dropped and picked back up inside one range is **one entry with the
 * union of his intervals**, not two: the app keys everything on `${kind}-${id}`
 * and two rows for one man would be two React keys, two summary rows and a
 * doubled `Total`. Resolving each interval down to days and unioning the sets
 * is what makes that fall out rather than needing a rule.
 */
export async function getRosterForRange(
  userId: string,
  start: string,
  end: string,
): Promise<RosterOverRange> {
  const { players, removed } = await load(userId);
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);

  const heldDays = new Map<string, Set<string>>();
  const identity = new Map<string, WatchPlayer>();
  const order: string[] = [];
  // `until` is exclusive and null means "still held" — the half-open interval
  // `[addedAt, removedAt)` the two stamps describe. An absent `addedAt` is the
  // migration: he has been there forever, so every day of the range is his.
  const hold = (p: RosterEntry, until: string | null) => {
    const key = playerKey(p);
    let days = heldDays.get(key);
    if (!days) {
      days = new Set<string>();
      heldDays.set(key, days);
      order.push(key);
    }
    // The live entry's own name and Savant spelling win where there is one,
    // being the fresher of the two; a tombstone only ever names a man no live
    // entry does.
    if (!identity.has(key) || until === null) {
      identity.set(key, { id: p.id, savantName: p.savantName, name: p.name, kind: p.kind });
    }
    for (const d of dates) {
      if (p.addedAt !== undefined && d < p.addedAt) continue;
      if (until !== null && d >= until) continue;
      days.add(d);
    }
  };

  for (const p of players) hold(p, null);
  // Newest first, so the men who left most recently read closest to the roster
  // they left.
  for (const r of [...removed].sort((a, b) => (a.removedAt < b.removedAt ? 1 : -1))) {
    hold(r, r.removedAt);
  }

  const out: WatchPlayer[] = [];
  for (const key of order) {
    if (heldDays.get(key)?.size) out.push(identity.get(key)!);
    else heldDays.delete(key);
  }
  return { players: out, heldDays };
}

/**
 * Reorder the watchlist to match the given key order ("pitcher-592332", ...).
 * Keys not present are ignored.
 *
 * The submitted keys usually cover only one kind, since the reorder screen is
 * per-kind — so the new order is spliced back into the slots that kind already
 * occupied, leaving every other entry exactly where it was. Any player of a
 * submitted kind that's missing from `keys` keeps its place too, so a stale
 * client can't accidentally drop or bury players.
 */
export async function reorderRoster(userId: string, keys: string[]): Promise<WatchPlayer[]> {
  return update(userId, (list) => {
    const byKey = new Map(list.map((p) => [playerKey(p), p]));
    const moving = keys.map((k) => byKey.get(k)).filter((p): p is WatchPlayer => p !== undefined);
    if (moving.length === 0) return null;

    // Only the kinds actually represented in the submitted order are touched.
    const kinds = new Set(moving.map((p) => p.kind));
    const movingKeys = new Set(moving.map(playerKey));
    // Players of those kinds that the client didn't mention, in their current
    // order — they refill the leftover slots after the ones that did move.
    const leftover = list.filter((p) => kinds.has(p.kind) && !movingKeys.has(playerKey(p)));
    const queue = [...moving, ...leftover];

    let i = 0;
    return list.map((p) => (kinds.has(p.kind) ? queue[i++] : p));
  });
}

/**
 * Every **rostered** player across every user, deduped by player key — the set
 * the scheduled warmer pre-fetches season data for. DynamoDB only; a local run
 * has the single dev list and no warmer.
 *
 * Deliberately not the watchlists: those are keys rather than entries, and a
 * board row costs nothing to draw — the season data this warms is what a
 * *report* needs, and a watchlisted player has no report until he is rostered.
 */
export async function getAllRosterPlayers(): Promise<WatchPlayer[]> {
  if (!TABLE) return (await fileLoad(DEV_USER)).players;
  const { doc, Scan } = await ddb();
  const seen = new Map<string, WatchPlayer>();
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new Scan({
        TableName: TABLE,
        ProjectionExpression: 'players',
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of (res.Items ?? []) as { players?: WatchPlayer[] }[]) {
      for (const p of migrate(item.players ?? [])) seen.set(playerKey(p), p);
    }
    startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return [...seen.values()];
}

// ---- The watchlist ----------------------------------------------------
//
// A different list from the roster above, and the reason both exist: the
// roster is who the Summary, Games and Feed views are *about*, while the
// watchlist is who you are keeping an eye on over on the research board. A free
// agent you are thinking of picking up belongs on the second and not the first,
// and before this the app had nowhere to put him but the list every view
// reports on.
//
// Stored as `playerKey` strings — "batter-660271" — rather than as
// `WatchPlayer` entries. The board holds every row it could ever mark, so a
// saved copy of the name and the Savant spelling would be a second and staler
// one of what the leaderboard already carries; membership is the whole of what
// this list is.

/** The keys this user is watching, in the order they were added (newest
 *  first, matching the roster's own convention). */
export async function getWatchlist(userId: string): Promise<string[]> {
  const cur = await load(userId);
  return activeList(cur).keys;
}

/**
 * **Which list is the active one**, resolved rather than trusted.
 *
 * The preference names an id and the id may name nothing — the list was deleted
 * from another tab, or the record predates the preference entirely. Both fall
 * back to the **first** list, which is the app's standing rule that an
 * unrecognized value falls back rather than emptying the view, and `listsOf`
 * guarantees there is always a first one to fall back to.
 */
function activeList(cur: Versioned): SavedList {
  const wanted = cur.prefs.activeWatchlistId;
  return cur.watchlists.find((l) => l.id === wanted) ?? cur.watchlists[0];
}

/** All of this user's lists, in the order they were made. */
export async function getLists(userId: string): Promise<SavedList[]> {
  return (await load(userId)).watchlists;
}

/** …and which of them is active, resolved the same way every write does. */
export async function getActiveListId(userId: string): Promise<string> {
  return activeList(await load(userId)).id;
}

/**
 * An id for a list or a search: eight URL-safe characters.
 *
 * Shorter than an invite code (16) and deliberately so — this is a **name for a
 * thing you own**, not the whole of the authorisation to read it. Guessing one
 * gets you nothing, because every route that takes one also takes the caller's
 * own user id and looks only in their own record; the codes that *are* an
 * authorisation are minted at the full length by `index.ts`.
 */
function mintId(): string {
  return randomBytes(6).toString('base64url');
}

/** Apply `change` to one list of this user's, by id. A no-op (and no write) if
 *  there is no such list, which is what makes a delete racing a rename resolve
 *  as the delete rather than as an error. */
async function mutateList(
  userId: string,
  listId: string,
  change: (list: SavedList) => SavedList | null,
): Promise<SavedList[]> {
  const next = await mutate(userId, (cur) => {
    const at = cur.watchlists.findIndex((l) => l.id === listId);
    if (at === -1) return null;
    const replaced = change(cur.watchlists[at]);
    const watchlists = [...cur.watchlists];
    if (replaced === null) watchlists.splice(at, 1);
    else watchlists[at] = replaced;
    // **Never nothing.** Deleting the last list would leave every surface
    // downstream with no list to be active, so the floor is one empty list —
    // exactly what `listsOf` hands a brand-new record.
    return { watchlists: watchlists.length ? watchlists : listsOf(undefined, undefined) };
  });
  return next.watchlists;
}

/** Add a list. The name is the caller's; the id and the stamps are ours. */
export async function addList(
  userId: string,
  name: string,
  keys: string[] = [],
): Promise<{ lists: SavedList[]; id: string }> {
  const id = mintId();
  const now = Date.now();
  const next = await mutate(userId, (cur) => {
    if (cur.watchlists.length >= MAX_LISTS) return null;
    return {
      watchlists: [...cur.watchlists, { id, name, keys, createdAt: now, updatedAt: now }],
    };
  });
  return { lists: next.watchlists, id };
}

/** Rename one. */
export async function renameList(
  userId: string,
  listId: string,
  name: string,
): Promise<SavedList[]> {
  return mutateList(userId, listId, (l) =>
    l.name === name ? l : { ...l, name, updatedAt: Date.now() },
  );
}

/**
 * Delete one — **and its share pointer with it**, or the link would go on
 * resolving to a list that no longer exists. The pointer is removed first for
 * the reason `setLeagueSharing` writes its own last: the failure that leaves a
 * link working is worse than the one that leaves an orphan pointer, which
 * resolves to nothing anyway because the two must agree.
 */
export async function deleteList(userId: string, listId: string): Promise<SavedList[]> {
  const cur = await load(userId);
  const code = cur.watchlists.find((l) => l.id === listId)?.shareCode;
  if (code) await deleteRaw(SHARE_KEY(code));
  return mutateList(userId, listId, () => null);
}

/**
 * Add or remove one key **from the active list**. Idempotent in both
 * directions, which is what makes the lost-update replay in `mutate` the right
 * resolution rather than a failure: a board row's star is pressed from one tab
 * while another is doing something else with the item, and replaying "make sure
 * this key is (not) in this list" against the newer record is exactly correct.
 *
 * **The active list and not a named one**, which is the whole of what the star
 * had to learn: it is one press on a row and there is no room on it to ask
 * *which list*, so the answer is the one the reader has selected — the same
 * thing the Watchlist button unions and the same thing every sentence in the UI
 * calls "your watchlist".
 */
export async function setWatchlisted(
  userId: string,
  key: string,
  on: boolean,
): Promise<string[]> {
  const cur = await load(userId);
  const id = activeList(cur).id;
  const lists = await mutateList(userId, id, (l) => {
    const has = l.keys.includes(key);
    if (has === on) return l; // already so — no change, and `mutate` writes nothing
    return {
      ...l,
      keys: on ? [key, ...l.keys] : l.keys.filter((k) => k !== key),
      updatedAt: Date.now(),
    };
  });
  return (lists.find((l) => l.id === id) ?? lists[0]).keys;
}

// ---- Saved searches ---------------------------------------------------

/** Every reading this user has saved, oldest first. */
export async function getSearches(userId: string): Promise<SavedSearch[]> {
  return (await load(userId)).searches;
}

/** Save the board as it stands, under a name. */
export async function addSearch(
  userId: string,
  name: string,
  board: Record<string, unknown>,
): Promise<{ searches: SavedSearch[]; id: string }> {
  const id = mintId();
  const now = Date.now();
  const next = await mutate(userId, (cur) => {
    if (cur.searches.length >= MAX_SEARCHES) return null;
    return { searches: [...cur.searches, { id, name, board, createdAt: now, updatedAt: now }] };
  });
  return { searches: next.searches, id };
}

/**
 * Rename a search, replace what it points at, or both.
 *
 * One function for the two because they are one gesture in the UI — *update
 * this saved search to the board I am looking at* — and because a partial
 * update is what makes "rename without disturbing the reading" possible: an
 * omitted field is left alone rather than cleared.
 */
export async function updateSearch(
  userId: string,
  searchId: string,
  patch: { name?: string; board?: Record<string, unknown> },
): Promise<SavedSearch[]> {
  const next = await mutate(userId, (cur) => {
    const at = cur.searches.findIndex((x) => x.id === searchId);
    if (at === -1) return null;
    const searches = [...cur.searches];
    searches[at] = {
      ...searches[at],
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.board !== undefined ? { board: patch.board } : {}),
      updatedAt: Date.now(),
    };
    return { searches };
  });
  return next.searches;
}

/** Delete a search, and its share pointer with it — as `deleteList`. */
export async function deleteSearch(userId: string, searchId: string): Promise<SavedSearch[]> {
  const cur = await load(userId);
  const code = cur.searches.find((x) => x.id === searchId)?.shareCode;
  if (code) await deleteRaw(SHARE_KEY(code));
  const next = await mutate(userId, (c) => {
    if (!c.searches.some((x) => x.id === searchId)) return null;
    return { searches: c.searches.filter((x) => x.id !== searchId) };
  });
  return next.searches;
}

// ---- Preferences ------------------------------------------------------

/** Everything this user has customised. `{}` for a user who never has. */
export async function getPrefs(userId: string): Promise<UserPrefs> {
  return (await load(userId)).prefs;
}

/**
 * Save (or clear) one board's research columns. `null` removes the entry
 * rather than storing the default list, so a user who resets goes back to
 * following the defaults as they change rather than being pinned to whatever
 * they were the day he reset.
 */
export async function setResearchColumns(
  userId: string,
  kind: PlayerKind,
  keys: string[] | null,
): Promise<UserPrefs> {
  return setColumnPrefs(userId, 'researchColumns', kind, keys);
}

/** …and for the research board's **projected** reading, which offers a strict
 *  subset of the board's own vocabulary and so keeps its own entry for exactly
 *  the reason the Stats tab does — see `UserPrefs.projectedColumns`. */
export async function setProjectedColumns(
  userId: string,
  kind: PlayerKind,
  keys: string[] | null,
): Promise<UserPrefs> {
  return setColumnPrefs(userId, 'projectedColumns', kind, keys);
}

/** The same, for the player page's Stats tab — see `UserPrefs.statsColumns`
 *  for why it is its own entry rather than a share of the board's. */
export async function setStatsColumns(
  userId: string,
  kind: PlayerKind,
  keys: string[] | null,
): Promise<UserPrefs> {
  return setColumnPrefs(userId, 'statsColumns', kind, keys);
}

/** One read/modify/write for all three, since the rule is the same one three
 *  times: a per-kind slot, and `null` clearing the slot rather than storing a
 *  copy of today's defaults. Written once so they cannot come to disagree about
 *  what "back to the defaults" stores. */
async function setColumnPrefs(
  userId: string,
  field: 'researchColumns' | 'statsColumns' | 'projectedColumns',
  kind: PlayerKind,
  keys: string[] | null,
): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const columns = { ...(cur.prefs[field] ?? {}) };
    if (keys) columns[kind] = keys;
    else delete columns[kind];
    return { prefs: { ...cur.prefs, [field]: columns } };
  });
  return next.prefs;
}

/**
 * Save the "hide injured players" toggle. Off is stored as the *absence* of the
 * entry rather than as `false`, the same convention the columns follow: absent
 * means "whatever the default is", so nothing here has to be revisited if that
 * default ever changes.
 */
export async function setHideInjured(userId: string, hide: boolean): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prefs = { ...cur.prefs };
    if (hide) prefs.hideInjured = true;
    else delete prefs.hideInjured;
    return { prefs };
  });
  return next.prefs;
}

/**
 * Save the "mute clip audio" toggle. Off is the absence of the entry, as with
 * the two above: a user who has never touched it, and one who has turned it
 * back off, are the same stored state, so the default can change without
 * anyone's record needing revisiting.
 */
export async function setMuteAudio(userId: string, mute: boolean): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prefs = { ...cur.prefs };
    if (mute) prefs.muteAudio = true;
    else delete prefs.muteAudio;
    return { prefs };
  });
  return next.prefs;
}

/**
 * Save the reader's color scheme.
 *
 * Absence is the default theme, so switching *back* to it deletes the entry —
 * the same convention as the three toggles above, and the same benefit: nobody's
 * record has to be revisited if the default ever moves. The id is length-capped
 * and otherwise trusted, the vocabulary being the client's; the worst a bad one
 * can do is give this reader the default palette.
 */
export async function setTheme(userId: string, theme: string | null): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prefs = { ...cur.prefs };
    if (theme) prefs.theme = theme;
    else delete prefs.theme;
    return { prefs };
  });
  return next.prefs;
}

/**
 * Save the "show percentile ranks" toggle — the badges under every value on the
 * research board and the player page's Stats tab. Off is the absence of the
 * entry, as with the three above, and it is **one** entry for both tables: the
 * two are drawn from one column vocabulary and the flag is a habit of reading
 * rather than a property of either table, so a reader who turns it on for the
 * board wants it on the Stats tab as well.
 */
export async function setActiveList(userId: string, listId: string | null): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prefs = { ...cur.prefs };
    // **Only an id that names a list is stored**, which is what keeps the
    // fallback in `activeList` a safety net rather than the normal path: a
    // request naming a list that has been deleted clears the entry back to
    // absence — the first list — rather than writing down a pointer to nothing.
    if (listId && cur.watchlists.some((l) => l.id === listId)) prefs.activeWatchlistId = listId;
    else delete prefs.activeWatchlistId;
    return { prefs };
  });
  return next.prefs;
}

export async function setStatRanks(userId: string, on: boolean): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prefs = { ...cur.prefs };
    if (on) prefs.statRanks = true;
    else delete prefs.statRanks;
    return { prefs };
  });
  return next.prefs;
}

/**
 * Which density the percentile card opens at. A `null` clears the entry back to
 * the default rather than storing a word meaning "the default" — the rule every
 * absence here follows, and what lets the default move later.
 *
 * The **vocabulary is the client's**, exactly as `theme`'s is: this validates
 * that a string arrived and nothing more, and a density the client does not
 * recognize is read there as the default. That is the same split
 * `researchColumns` makes, where the route checks the shape of a key and the
 * meaning lives where the thing is drawn.
 */
export async function setPercentileDensity(
  userId: string,
  density: string | null,
): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prefs = { ...cur.prefs };
    if (density) prefs.percentileDensity = density;
    else delete prefs.percentileDensity;
    return { prefs };
  });
  return next.prefs;
}

/** How many recent picks are kept. Mirrored by hand in `client/src/App.tsx`,
 *  the two workspaces being unable to import from each other — the client caps
 *  its optimistic copy of the list and the server caps what is stored, and the
 *  two agree by arithmetic rather than by one trusting the other. */
export const RECENT_PLAYERS = 5;

/**
 * Record that a player was picked out of the search — the one act that
 * *completes* a search here, so it is the one thing worth remembering about it.
 *
 * The server owns the push-to-front and the cap rather than taking a list from
 * the client, which is what makes this safe to replay against a newer record
 * the way `setWatchlisted` is: "put this key at the front" cannot lose anything
 * a concurrent write added, where a whole list posted by a tab that has been
 * open an hour would quietly overwrite it. A key already in the list **moves**
 * rather than duplicating, which is why the filter is there and why the cap is
 * applied after it rather than before.
 *
 * No debouncing, unlike the column preferences: picking a player is one
 * deliberate act with one write behind it, where ticking a group of columns is
 * one intent and a dozen state changes.
 */
export async function setRecentPlayer(userId: string, key: string): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prev = cur.prefs.recentPlayers ?? [];
    const recent = [key, ...prev.filter((k) => k !== key)].slice(0, RECENT_PLAYERS);
    return { prefs: { ...cur.prefs, recentPlayers: recent } };
  });
  return next.prefs;
}

/**
 * Mark the League page's Transactions feed read up to `ts` — the date of the
 * newest move on screen while that tab was open.
 *
 * **The marker only ever moves forward within a league**, which is what makes
 * this safe to replay against a newer record the way `setWatchlisted` and
 * `setRecentPlayer` are: two tabs on the same page, or a slow response carrying
 * an older head than one that has already landed, cannot un-read what has been
 * read. A *different* league replaces it outright rather than being compared
 * against, there being one connection at a time and no ordering between two
 * leagues' feeds.
 *
 * A marker that would not move writes **nothing** — the no-op path `mutate`
 * already has — so sitting on the tab through a poll that brings no new moves
 * costs no write at all.
 */
export async function setSeenTransactions(
  userId: string,
  leagueId: number,
  ts: number,
): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prev = cur.prefs.seenTransactions;
    if (prev && prev.leagueId === leagueId && prev.ts >= ts) return null;
    return { prefs: { ...cur.prefs, seenTransactions: { leagueId, ts } } };
  });
  return next.prefs;
}

/**
 * Mark the Feed view's stream of plays read up to a date — what undraws the red
 * `N new plays` button at the head of it.
 *
 * `setSeenTransactions`' own semantic with one field instead of two, and the
 * **forward-only** rule is doing more work here than it does there. The feed is
 * read over a date range the reader picks, so asking for "Last 15 days" makes
 * the newest play on screen older than a marker set this afternoon — and a
 * marker that moved *back* to it would report every play of the fortnight as
 * unseen the next time the range came back to today. Forward-only is what makes
 * a range excursion cost nothing, and it is the same property that makes this
 * safe to replay against a newer record: two tabs on the feed, or a slow
 * response carrying an older head than one that has landed, cannot un-read what
 * has been read.
 *
 * A marker that would not move writes **nothing** — `mutate`'s own no-op path —
 * so a reader who never presses the button pays for no writes at all, however
 * long the 20-second poll runs.
 */
export async function setSeenPlays(userId: string, ts: number): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    if (cur.prefs.seenPlays !== undefined && cur.prefs.seenPlays >= ts) return null;
    return { prefs: { ...cur.prefs, seenPlays: ts } };
  });
  return next.prefs;
}

/**
 * Save which ownership sets the research board includes, and whether the
 * watchlist is on the board beside them.
 *
 * **One route for both**, unlike the three toggles above, because they are one
 * control set: the three include buttons and the watchlist are read together
 * every time the board decides who is on it, and a client that has just changed
 * one holds the other anyway. `null` for `include` is "back to the default" and
 * stores the absence of the entry, the same rule the research columns follow —
 * where `[]` is the real, storable state of a user who has turned all three
 * off. Note that `[]` is no longer an empty board on its own: with the
 * watchlist on it is exactly the watchlist, which is a state someone wants.
 *
 * **The legacy key is deleted on every write, whichever way the flag goes.**
 * `researchWatchlistOnly` said "only" and the control no longer means that, so
 * leaving a stale copy beside the new one would give a record two answers to
 * one question, and the client reads the old key as a fallback — it would win
 * for a user who had it set and has since turned the new control off.
 */
export async function setResearchInclude(
  userId: string,
  include: ResearchIncludeKey[] | null,
  watchlist: boolean,
): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prefs = { ...cur.prefs };
    if (include) prefs.researchInclude = include;
    else delete prefs.researchInclude;
    if (watchlist) prefs.researchWatchlist = true;
    else delete prefs.researchWatchlist;
    delete prefs.researchWatchlistOnly;
    return { prefs };
  });
  return next.prefs;
}

// ---- ESPN fantasy league ----------------------------------------------

/**
 * The user's saved ESPN connection, credentials and all. **Server-side callers
 * only** — the routes narrow this to a status object before it goes anywhere
 * near a response body.
 */
export async function getEspnLeague(userId: string): Promise<EspnLeague | null> {
  return (await load(userId)).espn;
}

/** Save a connection, or `null` to disconnect — which drops the attribute
 *  entirely rather than storing an empty one, so a user who disconnects has no
 *  ESPN cookie left in the record at all. */
export async function setEspnLeague(
  userId: string,
  espn: EspnLeague | null,
): Promise<EspnLeague | null> {
  const next = await mutate(userId, () => ({ espn }));
  return next.espn;
}

/**
 * Which list the roster views read from.
 *
 * **`'saved'` is written down rather than stored as the absence of the entry**,
 * which is where this parts from the toggles above and is the whole of what
 * makes the auto-switch on a first team pick safe. Absence used to mean two
 * things at once — "never asked" and "asked for the saved roster" — and with
 * something now filling in the first of those, conflating them would have the
 * app turning a preference back on for the one user who had turned it off.
 * Recording the answer is what tells them apart; the default is still free to
 * change, because a record that has never held this key still has no answer in
 * it. Every reader tests `=== 'fantasy'`, so writing `'saved'` changes nothing
 * anybody reads.
 */
export async function setRosterSource(
  userId: string,
  source: 'saved' | 'fantasy',
): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => ({
    prefs: { ...cur.prefs, rosterSource: source },
  }));
  return next.prefs;
}

/**
 * Point the connection at a different team in the same league.
 *
 * Needed because the SWID only identifies the connecting user's team in a
 * league they are actually in — a public league read anonymously has no owner
 * to match, and a manager with two teams has to say which. A no-op (returning
 * null) when nothing is connected, since a team without a league is nothing.
 */
export async function setEspnTeam(
  userId: string,
  teamId: number,
  teamName: string | null,
): Promise<EspnLeague | null> {
  const next = await mutate(userId, (cur) =>
    cur.espn === null ? null : { espn: { ...cur.espn, teamId, teamName } },
  );
  return next.espn;
}

// ---- Leagues, and sharing one with your leaguemates -------------------
//
// A connection used to live entirely on the connecting user's record, which is
// fine for one person and wrong the moment a league is shared: the credential
// would belong to whoever happened to type it, everyone else would be a copy
// of it, and an expiry would need the original person to come back.
//
// So the **credential lives on the league**, in a record of its own, and a user
// record holds only a *reference* to the league plus their own team. Keyed
// `league#<id>` in the same table — DynamoDB is schemaless past the key, so
// this needs no new table and no CDK change — and an invite code gets a
// pointer record of its own (`invite#<code>`) so a join is one lookup rather
// than a scan.

// ---- Sharing a list or a search ---------------------------------------
//
// **The same shape the ESPN invite already has**, one level simpler. A share is
// a pointer record (`share#<code>`) naming whose record the thing is on and
// which thing it is, and the owner's copy carries the code back — so a read
// requires the two to agree and a half-finished revoke cannot leave a working
// link behind. That is `leagueForInvite`'s rule, and this is the second thing
// in the app to need it.
//
// **A live reference and not a snapshot**, which is the one real decision here.
// A shared watchlist that froze the day it was handed over would be a worse
// thing than a link to a list — the whole use is *these are the arms I am
// watching*, and it is worth something precisely because it goes on being true.
// The cost is that the owner can change what a recipient sees, which is
// exactly what revoking is for; and the recipient's own copy, when they take
// one, is a copy and stops tracking. That is what "save as my own" means.
//
// **Nobody's name travels with it.** The app knows its users as Cognito subs
// and their email addresses, and an email is not a thing to hand to whoever
// holds a link. So a shared item arrives with its own name and the fact that it
// is shared, and says nothing about who shared it — which is all the UI needs to
// say *you are reading somebody else's list*.

const SHARE_KEY = (code: string) => `share#${code}`;

/** What a share pointer holds: whose record, and which thing on it. */
interface SharePointer {
  kind: 'list' | 'search';
  ownerId: string;
  itemId: string;
}

/** A shared thing as a reader who is not its owner receives it. */
export interface SharedItem {
  kind: 'list' | 'search';
  code: string;
  name: string;
  /** Set for a list, absent for a search. */
  keys?: string[];
  /** Set for a search, absent for a list. */
  board?: Record<string, unknown>;
  /** True when the reader asking is the person who shared it — which the client
   *  uses to *not* draw the "you are reading somebody else's" chrome over your
   *  own list. Following your own share link is not a thing to warn about. */
  mine: boolean;
}

/**
 * Turn sharing on for one list or search, minting a code if it has none, or off.
 *
 * Idempotent on: asking twice returns the code it already had, so a reader who
 * presses Share again gets the link they handed out last week rather than
 * quietly invalidating it. Off deletes both halves.
 */
export async function setItemSharing(
  userId: string,
  kind: 'list' | 'search',
  itemId: string,
  enabled: boolean,
  mintCode: () => string,
): Promise<string | null> {
  const cur = await load(userId);
  const item =
    kind === 'list'
      ? cur.watchlists.find((l) => l.id === itemId)
      : cur.searches.find((x) => x.id === itemId);
  if (!item) return null;
  const existing = item.shareCode;
  if (enabled && existing) return existing;
  const code = enabled ? mintCode() : null;

  await mutate(userId, (c) => {
    if (kind === 'list') {
      const at = c.watchlists.findIndex((l) => l.id === itemId);
      if (at === -1) return null;
      const watchlists = [...c.watchlists];
      const { shareCode: _drop, ...rest } = watchlists[at];
      watchlists[at] = code ? { ...rest, shareCode: code } : rest;
      return { watchlists };
    }
    const at = c.searches.findIndex((x) => x.id === itemId);
    if (at === -1) return null;
    const searches = [...c.searches];
    const { shareCode: _drop, ...rest } = searches[at];
    searches[at] = code ? { ...rest, shareCode: code } : rest;
    return { searches };
  });

  // The pointer is written **after** the owner's copy and deleted **before**
  // it, both for the same reason `setLeagueSharing` gives: whichever half fails,
  // the failure must not be the one that leaves a link working.
  if (code) await putRaw(SHARE_KEY(code), { kind, ownerId: userId, itemId }, 0);
  else if (existing) await deleteRaw(SHARE_KEY(existing));
  return code;
}

/**
 * Resolve a share code to the thing it opens, reading the **owner's current**
 * copy — see the note above on why this is a live reference.
 *
 * Null for a code that was never valid, has been revoked, or points at an item
 * since deleted. Deliberately one answer for all three: which of them it is
 * tells a stranger holding a guessed code something about whether they are
 * close, which is the reasoning `/api/espn/join` already states.
 */
export async function resolveShare(code: string, readerId: string): Promise<SharedItem | null> {
  const { item } = await loadRaw(SHARE_KEY(code));
  const ptr = item as unknown as SharePointer | null;
  if (!ptr || (ptr.kind !== 'list' && ptr.kind !== 'search')) return null;
  const owner = await load(ptr.ownerId);
  const mine = ptr.ownerId === readerId;
  if (ptr.kind === 'list') {
    const list = owner.watchlists.find((l) => l.id === ptr.itemId);
    // Both halves must agree, or a revoke that got half-way would leave this
    // resolving — the rule `leagueForInvite` states and the reason the pointer
    // is not trusted on its own.
    if (!list || list.shareCode !== code) return null;
    return { kind: 'list', code, name: list.name, keys: list.keys, mine };
  }
  const search = owner.searches.find((x) => x.id === ptr.itemId);
  if (!search || search.shareCode !== code) return null;
  return { kind: 'search', code, name: search.name, board: search.board, mine };
}

const LEAGUE_KEY = (leagueId: number) => `league#${leagueId}`;
const INVITE_KEY = (code: string) => `invite#${code}`;

/** One ESPN league, and the credential the whole app reads it with. */
export interface LeagueRecord {
  leagueId: number;
  leagueName: string | null;
  /** The working credential. Null only in the window between a league being
   *  referenced and anyone supplying one, which shouldn't happen — a league is
   *  created by the act of connecting with cookies. */
  swid: string | null;
  espnS2: string | null;
  /** Who supplied the credential currently in use, and when. **Any member can
   *  replace it** — that is the point of holding it here: a cookie expires
   *  every few weeks, and a shared league that only its original connector can
   *  revive goes dark for everyone the moment that person stops paying
   *  attention. */
  credentialFrom: string;
  credentialAt: number;
  /** The invite code, or null when sharing is off. Present means *new* members
   *  may join; it is not a list of who already has. */
  inviteCode: string | null;
  /** App user ids attached to this league, oldest first. Kept so the page can
   *  say how many people are on the connection. */
  members: string[];
  createdBy: string;
  createdAt: number;
}

async function ddbLoadRaw(key: string): Promise<{ item: Record<string, unknown> | null; version: number }> {
  const { doc, Get } = await ddb();
  const res = await doc.send(new Get({ TableName: TABLE, Key: { userId: key }, ConsistentRead: true }));
  const item = res.Item as Record<string, unknown> | undefined;
  return { item: item ?? null, version: (item?.version as number) ?? 0 };
}

async function ddbPutRaw(key: string, item: Record<string, unknown>, version: number): Promise<void> {
  const { doc, Put } = await ddb();
  await doc.send(
    new Put({
      TableName: TABLE,
      Item: { ...item, userId: key, version: version + 1 },
      ConditionExpression: 'attribute_not_exists(version) OR version = :v',
      ExpressionAttributeValues: { ':v': version },
    }),
  );
}

async function loadRaw(key: string): Promise<{ item: Record<string, unknown> | null; version: number }> {
  if (TABLE) return ddbLoadRaw(key);
  const db = await fileDb();
  return { item: (db[key] as Record<string, unknown>) ?? null, version: 0 };
}

async function putRaw(key: string, item: Record<string, unknown>, version: number): Promise<void> {
  if (TABLE) {
    await ddbPutRaw(key, item, version);
    return;
  }
  const db = await fileDb();
  db[key] = item;
  await fileWriteDb(db);
}

async function deleteRaw(key: string): Promise<void> {
  if (TABLE) {
    const { doc, Delete } = await ddb();
    await doc.send(new Delete({ TableName: TABLE, Key: { userId: key } }));
    return;
  }
  const db = await fileDb();
  delete db[key];
  await fileWriteDb(db);
}

/** The same read/modify/write-with-one-replay the user record gets, over an
 *  arbitrary key — two leaguemates refreshing a stale cookie at the same
 *  moment is exactly the lost update the version guard exists for. */
async function mutateRaw<T extends Record<string, unknown>>(
  key: string,
  change: (current: T | null) => T | null,
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { item, version } = await loadRaw(key);
    const next = change(item as T | null);
    if (next === null) return item as T | null;
    try {
      await putRaw(key, next, version);
      return next;
    } catch (err) {
      if (attempt === 0 && isConflict(err)) continue;
      throw err;
    }
  }
  throw new Error(`record ${key} update failed: too much concurrent modification`);
}

export async function getLeague(leagueId: number): Promise<LeagueRecord | null> {
  const { item } = await loadRaw(LEAGUE_KEY(leagueId));
  return (item as unknown as LeagueRecord) ?? null;
}

/**
 * Create the league if it is new, and record this user's credential as the
 * working one. Called on every successful connect, which is what makes "any
 * member can refresh" true without a route of its own.
 */
export async function upsertLeague(
  userId: string,
  leagueId: number,
  leagueName: string | null,
  swid: string | null,
  espnS2: string | null,
): Promise<LeagueRecord> {
  const next = await mutateRaw<Record<string, unknown>>(LEAGUE_KEY(leagueId), (cur) => {
    const prev = cur as unknown as LeagueRecord | null;
    const members = prev?.members ?? [];
    return {
      leagueId,
      leagueName,
      swid,
      espnS2,
      credentialFrom: userId,
      credentialAt: Date.now(),
      inviteCode: prev?.inviteCode ?? null,
      members: members.includes(userId) ? members : [...members, userId],
      createdBy: prev?.createdBy ?? userId,
      createdAt: prev?.createdAt ?? Date.now(),
    } as unknown as Record<string, unknown>;
  });
  return next as unknown as LeagueRecord;
}

/** Attach a user to a league they were invited to. Adds no credential — that
 *  is the whole point of an invite. */
export async function joinLeague(userId: string, leagueId: number): Promise<LeagueRecord | null> {
  const next = await mutateRaw<Record<string, unknown>>(LEAGUE_KEY(leagueId), (cur) => {
    const prev = cur as unknown as LeagueRecord | null;
    if (!prev) return null;
    if (prev.members.includes(userId)) return null;
    return { ...prev, members: [...prev.members, userId] } as unknown as Record<string, unknown>;
  });
  return (next as unknown as LeagueRecord) ?? getLeague(leagueId);
}

/**
 * Turn sharing on (minting a code) or off (clearing it).
 *
 * Turning it off stops **new** joins; it deliberately does not detach the
 * people already on the connection. "Revoke the link" and "throw out my
 * leaguemates" are different intentions, and doing the second silently when
 * asked for the first is the kind of surprise that loses data.
 */
export async function setLeagueSharing(
  leagueId: number,
  enabled: boolean,
  mintCode: () => string,
): Promise<LeagueRecord | null> {
  const before = await getLeague(leagueId);
  if (!before) return null;
  const code = enabled ? before.inviteCode ?? mintCode() : null;
  const next = await mutateRaw<Record<string, unknown>>(LEAGUE_KEY(leagueId), (cur) => {
    const prev = cur as unknown as LeagueRecord | null;
    if (!prev) return null;
    return { ...prev, inviteCode: code } as unknown as Record<string, unknown>;
  });
  // The pointer is what makes a join one lookup instead of a scan. Written
  // after the league so a code can never point at a league that doesn't carry
  // it, which would let a revoked link keep working.
  if (enabled && code) await putRaw(INVITE_KEY(code), { leagueId }, 0);
  else if (before.inviteCode) await deleteRaw(INVITE_KEY(before.inviteCode));
  return next as unknown as LeagueRecord;
}

/** The league an invite code opens, or null if it was never valid or has been
 *  revoked. Both the pointer and the league's own copy must agree, so a
 *  half-finished revoke can't leave a working link behind. */
export async function leagueForInvite(code: string): Promise<LeagueRecord | null> {
  const { item } = await loadRaw(INVITE_KEY(code));
  const leagueId = (item as { leagueId?: number } | null)?.leagueId;
  if (typeof leagueId !== 'number') return null;
  const league = await getLeague(leagueId);
  return league && league.inviteCode === code ? league : null;
}

/**
 * The credential to read this user's league with, wherever it currently lives.
 *
 * Normally the league record's, which is what makes a connection shareable and
 * refreshable by anyone on it. A connection saved before leagues had records of
 * their own still carries its own copy, and this **promotes it** the first time
 * it is read — so the migration happens as people use the app rather than in a
 * script, and a user who never comes back costs nothing.
 */
export async function getEspnCreds(
  userId: string,
): Promise<{ leagueId: number; swid: string | null; espnS2: string | null } | null> {
  const espn = (await load(userId)).espn;
  if (!espn) return null;
  const league = await getLeague(espn.leagueId);
  if (league) {
    return { leagueId: espn.leagueId, swid: league.swid, espnS2: league.espnS2 };
  }
  const promoted = await upsertLeague(
    userId,
    espn.leagueId,
    espn.leagueName ?? null,
    espn.swid ?? null,
    espn.espnS2 ?? null,
  );
  return { leagueId: espn.leagueId, swid: promoted.swid, espnS2: promoted.espnS2 };
}

/** Point a user at a league — used when they join by invite, where there is no
 *  credential of their own to save. Their team is unset until they pick one. */
export async function attachEspnLeague(
  userId: string,
  leagueId: number,
  leagueName: string | null,
): Promise<EspnLeague | null> {
  const next = await mutate(userId, (cur) => ({
    espn: {
      leagueId,
      leagueName,
      teamId: cur.espn?.leagueId === leagueId ? cur.espn.teamId ?? null : null,
      teamName: cur.espn?.leagueId === leagueId ? cur.espn.teamName ?? null : null,
      savedAt: Date.now(),
    },
  }));
  return next.espn;
}
