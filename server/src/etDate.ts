/**
 * The MLB day, in US Eastern.
 *
 * A baseball day doesn't end at midnight. A 10pm ET first pitch on the West
 * Coast finishes around 1am, so at 12:30am the day anyone means by "today" is
 * still the one whose games are ending — and a date-picker preset that had
 * already rolled over would show them an empty slate. The day therefore turns
 * at 3am ET: later than any game realistically runs, earlier than anything the
 * next day starts.
 *
 * `client/src/App.tsx` mirrors these (its presets have to land on the same day
 * the API defaults to, and the two can't share code across the workspaces) —
 * change one and change the other.
 */
const ET_ZONE = 'America/New_York';

/** The hour (ET) a new baseball day begins. */
export const DAY_ROLLOVER_HOUR = 3;

/** The Eastern calendar date of an instant, as YYYY-MM-DD. */
export function easternDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Today's baseball date — the Eastern date of a clock set back to the rollover
 * hour, so the small hours still belong to the night before.
 */
export function baseballToday(): string {
  return easternDate(new Date(Date.now() - DAY_ROLLOVER_HOUR * 3_600_000));
}

/** `date` (YYYY-MM-DD) shifted by whole days. */
export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
