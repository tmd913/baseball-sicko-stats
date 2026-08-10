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
  /** Keep players on the IL off the players view (the settings-menu toggle).
   *  Absent means off, which is the default — see `setHideInjured`. */
  hideInjured?: boolean;
  /** Play every video clip with the sound off (the settings-menu toggle).
   *  Absent means off, the same convention as `hideInjured`. */
  muteAudio?: boolean;
  /** Read the watchlist views off the user's **ESPN fantasy roster** instead of
   *  the list they built here. Absent means the saved watchlist, which is the
   *  default and the only thing a user without a connected league can have —
   *  the same absence-is-the-default convention as the two toggles above. */
  rosterSource?: 'fantasy';
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

/** The saved record plus the version it was read at, so a write can detect a
 *  lost update. */
interface Versioned {
  players: WatchPlayer[];
  prefs: UserPrefs;
  espn: EspnLeague | null;
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
    | { players?: WatchPlayer[]; prefs?: UserPrefs; espn?: EspnLeague; version?: number }
    | undefined;
  // Only a genuinely absent item is an empty watchlist. Anything else — a
  // throttle, a network blip — throws, because swallowing it would render the
  // "your watchlist is empty" state and then persist that emptiness.
  if (!item) return { players: [], prefs: {}, espn: null, version: 0 };
  return {
    players: migrate(item.players ?? []),
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
    players?: WatchPlayer[];
    prefs?: UserPrefs;
    espn?: EspnLeague;
  };
  return {
    players: migrate(item.players ?? []),
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
  change: (current: Versioned) => Omit<Versioned, 'version'> | null,
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
    return players === null ? null : { players, prefs: cur.prefs, espn: cur.espn };
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
    return { players: cur.players, prefs: { ...cur.prefs, researchColumns: columns }, espn: cur.espn };
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
    return { players: cur.players, prefs, espn: cur.espn };
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
    return { players: cur.players, prefs, espn: cur.espn };
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
  const next = await mutate(userId, (cur) => ({
    players: cur.players,
    prefs: cur.prefs,
    espn,
  }));
  return next.espn;
}

/**
 * Which list the watchlist views read from. `'watchlist'` is stored as the
 * absence of the entry, as the toggles above are — so a user who switches back
 * is indistinguishable from one who never switched, and the default can change
 * without anyone's record needing revisiting.
 */
export async function setRosterSource(
  userId: string,
  source: 'watchlist' | 'fantasy',
): Promise<UserPrefs> {
  const next = await mutate(userId, (cur) => {
    const prefs = { ...cur.prefs };
    if (source === 'fantasy') prefs.rosterSource = 'fantasy';
    else delete prefs.rosterSource;
    return { players: cur.players, prefs, espn: cur.espn };
  });
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
    cur.espn === null
      ? null
      : {
          players: cur.players,
          prefs: cur.prefs,
          espn: { ...cur.espn, teamId, teamName },
        },
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
    players: cur.players,
    prefs: cur.prefs,
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
