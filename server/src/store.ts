import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playerKey } from './types.js';
import type { PlayerKind, WatchPlayer } from './types.js';

/**
 * The watchlist, one list per user.
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
  /** Keep players on the IL off the players view (the settings-menu toggle).
   *  Absent means off, which is the default — see `setHideInjured`. */
  hideInjured?: boolean;
  /** Play every video clip with the sound off (the settings-menu toggle).
   *  Absent means off, the same convention as `hideInjured`. */
  muteAudio?: boolean;
}

/** The saved record plus the version it was read at, so a write can detect a
 *  lost update. */
interface Versioned {
  players: WatchPlayer[];
  prefs: UserPrefs;
  version: number;
}

/** Entries saved before `kind` existed are batters. */
function migrate(players: WatchPlayer[]): WatchPlayer[] {
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
}> | null = null;

function ddb() {
  if (ddbPromise) return ddbPromise;
  ddbPromise = (async () => {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = await import(
      '@aws-sdk/lib-dynamodb'
    );
    return {
      doc: DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        // Undefined shows up in optional WatchPlayer fields; dropping it is
        // friendlier than rejecting the write.
        marshallOptions: { removeUndefinedValues: true },
      }) as unknown as DocClient,
      Get: GetCommand as unknown as new (i: unknown) => unknown,
      Put: PutCommand as unknown as new (i: unknown) => unknown,
      Scan: ScanCommand as unknown as new (i: unknown) => unknown,
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
    | { players?: WatchPlayer[]; prefs?: UserPrefs; version?: number }
    | undefined;
  // Only a genuinely absent item is an empty watchlist. Anything else — a
  // throttle, a network blip — throws, because swallowing it would render the
  // "your watchlist is empty" state and then persist that emptiness.
  if (!item) return { players: [], prefs: {}, version: 0 };
  return {
    players: migrate(item.players ?? []),
    prefs: item.prefs ?? {},
    version: item.version ?? 0,
  };
}

async function ddbPersist(userId: string, next: Versioned): Promise<void> {
  const { doc, Put } = await ddb();
  await doc.send(
    new Put({
      TableName: TABLE,
      Item: { userId, players: next.players, prefs: next.prefs, version: next.version + 1 },
      // Reject the write if someone else moved the item since we read it.
      ConditionExpression: 'attribute_not_exists(version) OR version = :v',
      ExpressionAttributeValues: { ':v': next.version },
    }),
  );
}

// ---- Filesystem backend -----------------------------------------------

async function fileLoad(): Promise<Versioned> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as WatchPlayer[] | { players?: WatchPlayer[]; prefs?: UserPrefs };
    // The file was a bare array before preferences existed, and a dev machine
    // will have one sitting there — so both shapes read, and the next write
    // saves the newer one.
    return Array.isArray(parsed)
      ? { players: migrate(parsed), prefs: {}, version: 0 }
      : { players: migrate(parsed.players ?? []), prefs: parsed.prefs ?? {}, version: 0 };
  } catch (err) {
    // A missing file is a new watchlist; a malformed one shouldn't be silently
    // replaced by an empty list on the next write.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { players: [], prefs: {}, version: 0 };
    }
    throw err;
  }
}

async function filePersist(next: Versioned): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const body = { players: next.players, prefs: next.prefs };
  await fs.writeFile(FILE, JSON.stringify(body, null, 2), 'utf8');
}

// ---- Read/modify/write ------------------------------------------------

async function load(userId: string): Promise<Versioned> {
  return TABLE ? ddbLoad(userId) : fileLoad();
}

async function persist(userId: string, next: Versioned): Promise<void> {
  if (TABLE) await ddbPersist(userId, next);
  else await filePersist(next);
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
  change: (current: Versioned) => { players: WatchPlayer[]; prefs: UserPrefs } | null,
): Promise<Versioned> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await load(userId);
    const next = change(current);
    if (next === null) return current; // no-op, nothing to write
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

/** The watchlist half of `mutate`, so the list mutations below read as they
 *  always have — they don't touch preferences, and a write carries the prefs
 *  it just read back unchanged. */
async function update(
  userId: string,
  change: (players: WatchPlayer[]) => WatchPlayer[] | null,
): Promise<WatchPlayer[]> {
  const next = await mutate(userId, (cur) => {
    const players = change(cur.players);
    return players === null ? null : { players, prefs: cur.prefs };
  });
  return next.players;
}

export async function getWatchlist(userId: string): Promise<WatchPlayer[]> {
  return (await load(userId)).players;
}

/** Adds unless the same player is already watched *as that kind* — a two-way
 * player is two separate entries, one per kind. */
export async function addPlayer(userId: string, player: WatchPlayer): Promise<WatchPlayer[]> {
  return update(userId, (list) => {
    const key = playerKey(player);
    if (list.some((p) => playerKey(p) === key)) return null;
    return [player, ...list];
  });
}

/** Removes one entry. Without `kind`, removes every entry for the id — which is
 * what a client that predates two-way support means by "remove this player". */
export async function removePlayer(
  userId: string,
  id: number,
  kind?: PlayerKind,
): Promise<WatchPlayer[]> {
  return update(userId, (list) =>
    list.filter((p) => p.id !== id || (kind !== undefined && p.kind !== kind)),
  );
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
export async function reorderPlayers(userId: string, keys: string[]): Promise<WatchPlayer[]> {
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
 * Every watchlisted player across every user, deduped by player key — the set
 * the scheduled warmer pre-fetches season data for. DynamoDB only; a local run
 * has the single dev list and no warmer.
 */
export async function getAllWatchedPlayers(): Promise<WatchPlayer[]> {
  if (!TABLE) return (await fileLoad()).players;
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
  const next = await mutate(userId, (cur) => {
    const columns = { ...(cur.prefs.researchColumns ?? {}) };
    if (keys) columns[kind] = keys;
    else delete columns[kind];
    return { players: cur.players, prefs: { ...cur.prefs, researchColumns: columns } };
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
    return { players: cur.players, prefs };
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
    return { players: cur.players, prefs };
  });
  return next.prefs;
}
