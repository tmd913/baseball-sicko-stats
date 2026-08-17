import { promises as fs } from 'node:fs';
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
 * change of behaviour. Two names are deliberately *not* touched: the
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
 * Everything saved for one user. Preferences live on the **same item** as the
 * watchlist rather than in a store of their own: same partition key, same
 * version-conditional write, no second table to provision — and a user's saved
 * state is one thing to read on sign-in.
 */
export interface UserPrefs {
  /** The research board's visible columns, per board. Absent means that
   *  board's defaults; the client owns the column vocabulary and narrows
   *  anything it doesn't recognise, so nothing here is validated against it. */
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
   * The colour scheme, by id — `'midnight'` (the dark original) or
   * `'lavender'`. Absent means the default, which is the convention every
   * toggle above follows and is the right one here for the same reason: the
   * default can change without anyone's record needing revisiting.
   *
   * A string rather than a boolean because there can be a third theme, and an
   * id the client does not recognise is read as the default rather than
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
   * unrecognised league draws the dot, which is news offered rather than news
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
 * Pruning too eagerly fails **into the old behaviour and no further**: a player
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
  prefs: UserPrefs;
  espn: EspnLeague | null;
  version: number;
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
        prefs?: UserPrefs;
        espn?: EspnLeague;
        version?: number;
      }
    | undefined;
  // Only a genuinely absent item is an empty watchlist. Anything else — a
  // throttle, a network blip — throws, because swallowing it would render the
  // "your watchlist is empty" state and then persist that emptiness.
  if (!item) {
    return { players: [], removed: [], watchlist: [], prefs: {}, espn: null, version: 0 };
  }
  return {
    players: migrate(item.players ?? []),
    removed: migrate(item.removed ?? []) as RosterRemoval[],
    watchlist: item.watchlist ?? [],
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
        ...(next.watchlist.length ? { watchlist: next.watchlist } : {}),
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

async function fileWriteDb(db: FileDb): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify({ records: db }, null, 2), 'utf8');
}

async function fileLoad(userId: string): Promise<Versioned> {
  const db = await fileDb();
  const item = (db[userId] ?? db.__legacy ?? {}) as {
    players?: RosterEntry[];
    removed?: RosterRemoval[];
    watchlist?: string[];
    prefs?: UserPrefs;
    espn?: EspnLeague;
  };
  return {
    players: migrate(item.players ?? []),
    removed: migrate(item.removed ?? []) as RosterRemoval[],
    watchlist: item.watchlist ?? [],
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
    ...(next.watchlist.length ? { watchlist: next.watchlist } : {}),
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
  return (await load(userId)).watchlist;
}

/**
 * Add or remove one key. Idempotent in both directions, which is what makes the
 * lost-update replay in `mutate` the right resolution rather than a failure: a
 * board row's star is pressed from one tab while another is doing something
 * else with the item, and replaying "make sure this key is (not) in the list"
 * against the newer record is exactly correct.
 */
export async function setWatchlisted(
  userId: string,
  key: string,
  on: boolean,
): Promise<string[]> {
  const next = await mutate(userId, (cur) => {
    const has = cur.watchlist.includes(key);
    if (has === on) return null; // already so — nothing to write
    return { watchlist: on ? [key, ...cur.watchlist] : cur.watchlist.filter((k) => k !== key) };
  });
  return next.watchlist;
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

/** The same, for the player page's Stats tab — see `UserPrefs.statsColumns`
 *  for why it is its own entry rather than a share of the board's. */
export async function setStatsColumns(
  userId: string,
  kind: PlayerKind,
  keys: string[] | null,
): Promise<UserPrefs> {
  return setColumnPrefs(userId, 'statsColumns', kind, keys);
}

/** One read/modify/write for both, since the rule is the same one twice: a
 *  per-kind slot, and `null` clearing the slot rather than storing a copy of
 *  today's defaults. Written once so the two cannot come to disagree about
 *  what "back to the defaults" stores. */
async function setColumnPrefs(
  userId: string,
  field: 'researchColumns' | 'statsColumns',
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
 * Save the reader's colour scheme.
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
export async function setStatRanks(userId: string, on: boolean): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prefs = { ...cur.prefs };
    if (on) prefs.statRanks = true;
    else delete prefs.statRanks;
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
