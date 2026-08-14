/**
 * The ESPN invite code, held across whatever the sign-in takes.
 *
 * An invite link is `?league=<code>`, and it is the one query parameter in this
 * app that is aimed at somebody who **has no account yet**. So between arriving
 * on it and being able to redeem it there is a whole sign-in — and for the
 * Google route that means leaving the site, visiting two other origins and
 * coming back, which is the least reliable thing the app does. Every one of the
 * ways that round trip can go wrong used to lose the code:
 *
 *  - The federated leg fails at Cognito and never returns to the app at all.
 *    The user retries from Cognito's own page, or gives up and comes back to
 *    the site by hand; either way the `?league=` they clicked is long gone from
 *    the address bar.
 *  - The redirect comes back with `?error=` rather than `?code=`, and the query
 *    the user arrived on is replaced by that.
 *  - They sign in with email and password instead, which never restores a
 *    stashed query at all.
 *  - The tab is closed and the link opened again, or iOS restores the tab.
 *
 * It was carried by `auth.tsx`'s `sicko:return-query` — the whole query string,
 * in **session**Storage, put back only on the *successful* federated path. That
 * is right for view state (a preset, an open player) which is worth restoring
 * and costs nothing to lose. It is the wrong vehicle for a one-shot credential
 * that is the entire point of the visit, and the failure was silent: the app
 * came up signed in, on a page with no league connected, with nothing on screen
 * to say a link had been dropped.
 *
 * So the code is stored **deliberately and on its own**, and the two choices
 * that follow are the whole of the design:
 *
 *  - **localStorage, not sessionStorage.** sessionStorage is per tab and dies
 *    with it, which loses the code on exactly the paths above — a tab restore,
 *    a link reopened, a callback that lands somewhere else. The redemption is
 *    the user's own act, minutes later at most, and it has to survive that.
 *  - **An hour, and then it is stale** (`MAX_AGE_MS`). Redeeming a leaguemate's
 *    invite joins you to their ESPN connection, so a code left lying in storage
 *    is a thing that should expire; an hour covers a sign-up, a confirmation
 *    email and two failed Google attempts, and does not cover coming back
 *    tomorrow on a shared machine.
 *
 * `App` takes it exactly once per load and clears it on the way (see
 * `takeInvite`), which is what keeps a reload from redeeming twice — the
 * property the old "the URL sync drops the param" argument used to buy.
 */

const KEY = 'sicko:espn-invite';

/** How long a captured code stays redeemable. */
const MAX_AGE_MS = 60 * 60 * 1000;

interface Stored {
  code: string;
  /** Epoch ms, so a code can go stale rather than waiting in storage forever. */
  at: number;
}

/**
 * Read at module load, which is before anything else in the app runs.
 *
 * It has to be: `App` rewrites the whole query string from its own view state
 * on its first sync and `league` is not part of it, and `auth.tsx` navigates
 * away to Cognito the moment somebody presses the Google button. Both of those
 * happen after the module graph has been evaluated, so by then this has already
 * been captured.
 */
const fromUrl = new URLSearchParams(window.location.search).get('league');

if (fromUrl) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: fromUrl, at: Date.now() } satisfies Stored));
  } catch {
    /* private mode, a full quota — `fromUrl` below still covers this load */
  }
}

/** Memoised because the read is destructive and React renders twice under
 *  StrictMode: taking it once per load is what makes it safe to call from a
 *  render. */
let taken: string | null | undefined;

/**
 * The invite code this visit is carrying, if any — and it is spent by asking.
 *
 * Falls back to the parameter read at module load, so a browser that refuses
 * storage (private mode, a full quota) still redeems a link opened while
 * already signed in; what it cannot do there is survive the redirect, which is
 * the honest limit of a fallback with nowhere to write.
 */
export function takeInvite(): string | null {
  if (taken === undefined) taken = read();
  return taken;
}

function read(): string | null {
  let stored: Stored | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      if (typeof parsed.code === 'string' && typeof parsed.at === 'number') {
        stored = { code: parsed.code, at: parsed.at };
      }
    }
  } catch {
    stored = null;
  }
  if (stored && Date.now() - stored.at <= MAX_AGE_MS) return stored.code;
  return fromUrl;
}
