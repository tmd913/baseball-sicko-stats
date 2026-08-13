/**
 * A string reduced to unaccented ASCII: NFKD splits every accented letter into
 * its base plus a combining mark, and the marks are then dropped. **The one
 * definition of that in this workspace** — `espn.ts::normalizeName` is its only
 * caller today — and the twin of `client/src/lib.ts::stripAccents`, mirrored by
 * hand for the reason the two `types.ts` files are: the workspaces cannot
 * import from each other.
 */
export function stripAccents(raw: string): string {
  return raw.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** "First Last" -> "Last, First" (mirrors the format the watchlist stores). */
export function toSavantName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return `${last}, ${first}`;
}
