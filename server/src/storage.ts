import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';

/**
 * The cache tier, behind one interface with two implementations.
 *
 * Locally (and in `npm run dev` / `npm start`) it's the filesystem, writing to
 * `server/data/cache/` exactly as it always has. On Lambda the filesystem is
 * read-only and per-container, so `CACHE_BUCKET` switches it to S3 — same keys,
 * same semantics, just under a `cache/` prefix in the bucket.
 *
 * Everything cached here is a *derived* copy of a public upstream response, so
 * a miss is only ever slower, never wrong. That shapes the error handling: a
 * failed read degrades to a miss and a failed write is logged and swallowed,
 * because neither should turn a working request into a 502.
 */

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const BUCKET = process.env.CACHE_BUCKET;
/** Keys live under one prefix so the bucket can carry other things (and so a
 *  lifecycle rule can target the cache alone). */
const PREFIX = 'cache/';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');

export const usingS3 = BUCKET !== undefined;

// ---- S3 backend -------------------------------------------------------

interface S3Api {
  get(key: string): Promise<Buffer | null>;
  put(key: string, body: Buffer): Promise<void>;
}

/** Loaded lazily so local runs never pay the SDK's import cost, and so the
 *  server still starts if the AWS SDK isn't installed. */
let s3Promise: Promise<S3Api> | null = null;

function s3(): Promise<S3Api> {
  if (s3Promise) return s3Promise;
  s3Promise = (async (): Promise<S3Api> => {
    const { S3Client, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({});
    return {
      async get(key) {
        try {
          const res = await client.send(
            new GetObjectCommand({ Bucket: BUCKET, Key: PREFIX + key }),
          );
          if (!res.Body) return null;
          return Buffer.from(await res.Body.transformToByteArray());
        } catch (err) {
          // A miss is the common case and not worth logging; anything else is.
          if (!isNotFound(err)) console.error(`cache read failed for ${key}:`, err);
          return null;
        }
      },
      async put(key, body) {
        await client.send(
          new PutObjectCommand({ Bucket: BUCKET, Key: PREFIX + key, Body: body }),
        );
      },
    };
  })();
  return s3Promise;
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

// ---- Filesystem backend -----------------------------------------------

async function fsGet(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, key));
  } catch {
    // not cached yet
    return null;
  }
}

async function fsPut(key: string, body: Buffer): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, key), body);
}

// ---- Public interface -------------------------------------------------

async function get(key: string): Promise<Buffer | null> {
  return BUCKET ? (await s3()).get(key) : fsGet(key);
}

async function put(key: string, body: Buffer): Promise<void> {
  try {
    if (BUCKET) await (await s3()).put(key, body);
    else await fsPut(key, body);
  } catch (err) {
    // A cache write is best-effort — the caller already has the value it needs,
    // so a full disk or a transient S3 error must not fail the request.
    console.error(`cache write failed for ${key}:`, err);
  }
}

/** Cached text, or null if not cached. Blank content counts as a miss, matching
 *  the "empty file means we never really got it" rule the disk cache used. */
export async function readBlob(key: string): Promise<string | null> {
  const buf = await get(key);
  if (buf === null) return null;
  const text = buf.toString('utf8');
  return text.trim().length > 0 ? text : null;
}

export async function writeBlob(key: string, body: string): Promise<void> {
  await put(key, Buffer.from(body, 'utf8'));
}

/**
 * The same, gzipped — for payloads big enough that the compression pays for
 * itself in transfer time (the per-day report snapshots, which are several MB
 * of JSON that gzip to roughly a tenth of that).
 *
 * The `.gz` suffix is applied here rather than by callers so both backends
 * agree, and the content is stored as opaque bytes rather than relying on S3's
 * `Content-Encoding` — `GetObject` does not decompress on the way out, so we'd
 * have to gunzip by hand either way.
 */
export async function readGzipBlob(key: string): Promise<string | null> {
  const buf = await get(`${key}.gz`);
  if (buf === null || buf.length === 0) return null;
  try {
    return (await gunzipAsync(buf)).toString('utf8');
  } catch (err) {
    // A truncated or corrupt object should read as a miss, not an error.
    console.error(`cache gunzip failed for ${key}:`, err);
    return null;
  }
}

export async function writeGzipBlob(key: string, body: string): Promise<void> {
  await put(`${key}.gz`, await gzipAsync(Buffer.from(body, 'utf8')));
}

/**
 * Read-through JSON cache with a caller-supplied freshness test.
 *
 * `xwoba.ts` and `pitcherArsenal.ts` were memory-only, which on Lambda meant
 * re-downloading a multi-MB season CSV on every cold container. They now stamp
 * `cachedAt` into the stored payload and hand the TTL check in here, the same
 * shape `percentiles.ts` already used with its `updatedAt`.
 */
export async function readJsonBlob<T>(
  key: string,
  isFresh: (value: T, cachedAt: number) => boolean,
): Promise<T | null> {
  const raw = await readBlob(key);
  if (raw === null) return null;
  try {
    const { cachedAt, value } = JSON.parse(raw) as { cachedAt: number; value: T };
    if (typeof cachedAt !== 'number') return null;
    return isFresh(value, cachedAt) ? value : null;
  } catch {
    return null;
  }
}

export async function writeJsonBlob<T>(key: string, value: T): Promise<void> {
  await writeBlob(key, JSON.stringify({ cachedAt: Date.now(), value }));
}
