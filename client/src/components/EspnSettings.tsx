import { useEffect, useState } from 'react';
import { useLockBodyScroll } from '../hooks';
import { api } from '../api';
import type { EspnStatus } from '../types';

/**
 * What a pasted ESPN league URL yields. Both ids are in the address bar of any
 * league page — `leagueId` on every one of them, `teamId` on a team page — and
 * neither cookie is, nor could be: a cookie belongs to the site that set it and
 * no other page can read it. So the URL saves the two lookups it can, and the
 * instructions below cover the two it can't.
 */
interface LeagueRef {
  leagueId: string;
  teamId: number | null;
}

/**
 * Pull the ids out of anything the user is likely to paste — a team page, a
 * league page, a standings page, or just the number itself.
 *
 * Deliberately a regex over the raw string rather than `new URL()`: half the
 * time what lands in the field is a fragment rather than a whole address (a
 * copied query string, a URL with the scheme trimmed off by the app it came
 * from), and none of those parse. `leagueId=` is unambiguous wherever it sits.
 */
export function parseLeagueRef(raw: string): LeagueRef | null {
  const text = raw.trim();
  if (text === '') return null;
  const league = /[?&#\/]leagueId=(\d+)/i.exec(text) ?? /\bleagueId[=:](\d+)/i.exec(text);
  if (league) {
    const team = /[?&#]teamId=(\d+)/i.exec(text);
    return { leagueId: league[1], teamId: team ? Number(team[1]) : null };
  }
  // A bare id, which is what the field held before it learned to take a URL.
  return /^\d+$/.test(text) ? { leagueId: text, teamId: null } : null;
}

/** The two cookies, as much of the pair as a given paste turned out to hold. */
interface CookiePaste {
  swid: string | null;
  espnS2: string | null;
}

/**
 * Find one named cookie's value inside whatever the user pasted.
 *
 * Cookie viewers, devtools panels and phone inspectors all copy the **name
 * along with the value**, and each of them punctuates it differently:
 * `espn_s2:"AEB…"`, `SWID={…}`, `"espn_s2": "AEB…"`, or the whole
 * `SWID={…}; espn_s2=AEB…` string at once. Every one of those pasted whole is
 * a value the app would otherwise reject, so the field reads them all rather
 * than asking the user to trim by hand — which on a phone, with a 300-character
 * token, is the step the whole thing founders on.
 *
 * The value is quoted or it runs to the next separator. Neither cookie can
 * contain a space, a comma or a semicolon (`espn_s2` is percent-encoded and
 * `SWID` is a braced GUID), so the unquoted form has an unambiguous end.
 */
function pickCookie(text: string, key: string): string | null {
  const quoted = new RegExp(`${key}["']?\\s*[:=]\\s*"([^"]+)"`, 'i').exec(text);
  if (quoted) return quoted[1];
  const bare = new RegExp(`${key}["']?\\s*[:=]\\s*([^;,"'\\s]+)`, 'i').exec(text);
  return bare ? bare[1] : null;
}

export function parseCookiePaste(raw: string): CookiePaste {
  return { swid: pickCookie(raw, 'SWID'), espnS2: pickCookie(raw, 'espn_s2') };
}

/** Strip a *matched* pair of surrounding quotes — the ones a copy brings along.
 *  Matched, so a lone quote someone is midway through typing survives. */
export function unquote(raw: string): string {
  const text = raw.trim();
  return text.length > 1 && /^(["']).*\1$/s.test(text) ? text.slice(1, -1) : text;
}

/**
 * Connect the app to one ESPN fantasy baseball league.
 *
 * A full-screen overlay in the same shape as the how-to page and the player
 * page — `.details-view`, its own scroller, Escape or Back to leave — rather
 * than a fourth kind of modal. It is reached from the settings popover, which
 * is where the app's other saved preferences live.
 *
 * Most of what is on screen is **instructions**, and that is the right ratio:
 * the two values it needs are browser cookies, and nobody knows where those are
 * without being told. The form itself is three fields.
 *
 * The `espn_s2` value is a live session cookie for the user's ESPN account, so
 * the field is a password input, it is never read back from the server (the
 * status route answers with the league and team only), and re-connecting means
 * pasting it again rather than editing a value the page is holding.
 */
export function EspnSettings({
  status,
  onStatusChange,
  onClose,
}: {
  status: EspnStatus | null;
  onStatusChange: (s: EspnStatus) => void;
  onClose: () => void;
}) {
  useLockBodyScroll();

  const connected = status?.connected === true;
  const [leagueId, setLeagueId] = useState(
    status?.connected ? String(status.leagueId) : '',
  );
  // Whatever `teamId` the pasted URL carried. Only used when there is no SWID
  // to identify the user's own team with — i.e. a public league.
  const [urlTeamId, setUrlTeamId] = useState<number | null>(null);
  const [swid, setSwid] = useState('');
  const [espnS2, setEspnS2] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The form stays on screen after a successful connect — the panel above it
  // becomes the record of what happened, so a bare "saved" line would be the
  // same news twice. This only marks the moment, for the button.
  const [justSaved, setJustSaved] = useState(false);

  /**
   * A status that never arrived is re-read here.
   *
   * App reads it once on boot and, like the preferences beside it, logs a
   * failure rather than bannering it — but the two fail differently. A lost
   * preference costs a column layout; a lost status makes the whole feature
   * *disappear*, pill and all, with nothing on screen to say why and no way
   * back short of a reload. This page is where someone goes to find out, so it
   * asks again on the way in.
   */
  useEffect(() => {
    if (status !== null) return;
    let cancelled = false;
    api
      .espn()
      .then((s) => {
        if (!cancelled) onStatusChange(s);
      })
      .catch((e: Error) => console.error('ESPN status unavailable:', e.message));
    return () => {
      cancelled = true;
    };
  }, [status, onStatusChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const next = await api.saveEspn(Number(leagueId.trim()), swid, espnS2, urlTeamId);
      onStatusChange(next);
      // Nothing keeps the cookie in the page once the server has it.
      setSwid('');
      setEspnS2('');
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to ESPN');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    setError(null);
    try {
      onStatusChange(await api.disconnectEspn());
      setLeagueId('');
      setJustSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Paste handling for the league field: a URL collapses to the id it contains
   * the moment it lands, so what stays on screen is the number the app will
   * use. Anything unrecognised is left exactly as typed — silently blanking a
   * field someone is halfway through is worse than letting the submit fail.
   */
  const onLeagueInput = (raw: string) => {
    const ref = parseLeagueRef(raw);
    if (ref && ref.leagueId !== raw.trim()) {
      setLeagueId(ref.leagueId);
      setUrlTeamId(ref.teamId);
      return;
    }
    setLeagueId(raw);
    if (ref?.teamId != null) setUrlTeamId(ref.teamId);
  };

  /**
   * Both cookie fields share this. A paste that names either key fills the
   * field(s) it names **whichever box it landed in** — someone who copies the
   * whole cookie string into the SWID box has given the app both values, and
   * making them go and split it by hand would be pedantry. A paste that names
   * neither is the bare value, minus any quotes the copy brought with it.
   */
  const onCookieInput = (field: 'swid' | 'espnS2', raw: string) => {
    const found = parseCookiePaste(raw);
    if (found.swid || found.espnS2) {
      if (found.swid) setSwid(found.swid);
      if (found.espnS2) setEspnS2(found.espnS2);
      // The paste named only the other key, so this box must not be left
      // holding the raw text it was dropped into.
      if (field === 'swid' && !found.swid) setSwid('');
      if (field === 'espnS2' && !found.espnS2) setEspnS2('');
      return;
    }
    const value = unquote(raw);
    if (field === 'swid') setSwid(value);
    else setEspnS2(value);
  };

  // The cookies are a pair and optional: a public league needs neither, a
  // private one needs both, and one of the two is a half-finished paste.
  const cookiesGiven = swid.trim() !== '' || espnS2.trim() !== '';
  const cookiesComplete = swid.trim() !== '' && espnS2.trim() !== '';
  const ready = leagueId.trim() !== '' && (!cookiesGiven || cookiesComplete);

  return (
    <div className="details-view espn-view">
      <div className="tut-head">
        <button type="button" className="details-back" onClick={onClose}>
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <div className="tut-title-block">
          <h1 className="tut-title">Fantasy league</h1>
          <p className="tut-lede">
            Connect your ESPN fantasy baseball league and the research board gains a{' '}
            <strong>Free Agents</strong> filter — every player in the majors who
            isn't on a roster in your league, sortable by any stat on the board.
          </p>
        </div>
      </div>

      <div className="tut-body espn-body">
        {connected && status.connected && (
          <section className="espn-status">
            <div className="espn-status-head">
              <span className="espn-dot" aria-hidden="true" />
              <div>
                <p className="espn-status-title">{status.leagueName ?? 'Connected'}</p>
                <p className="espn-status-sub">
                  League {status.leagueId}
                  {status.teamName ? ` · ${status.teamName}` : ''}
                  {status.hasCredentials ? '' : ' · public, no credentials stored'}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="espn-disconnect"
              onClick={disconnect}
              disabled={saving}
            >
              Disconnect
            </button>
          </section>
        )}

        <section className="espn-section">
          <h2 className="espn-h2">Where to find these</h2>
          <p className="espn-note">
            ESPN has no public API key for fantasy leagues. A <em>public</em>{' '}
            league it will hand to anyone, so all the app needs is which one. A{' '}
            <em>private</em> league is visible only to someone signed in to it —
            for that the app has to sign in as you, using two cookies your browser
            already holds. Those stay on the server, are never sent back to this
            page, and you can remove them at any time with{' '}
            <strong>Disconnect</strong>.
          </p>

          <h3 className="espn-h3">1. Your league</h3>
          <p className="espn-note">
            Open your league on <code>fantasy.espn.com</code> and paste the whole
            address into the first field below — the app reads the ids out of it.
            The bare number works too, if you'd rather.
          </p>
          <pre className="espn-code">
            https://fantasy.espn.com/baseball/team?leagueId=<b>123456</b>&amp;teamId=<b>6</b>
          </pre>

          <h3 className="espn-h3">2. SWID and espn_s2 — private leagues only</h3>
          <p className="espn-note">
            <strong>Try connecting without these first.</strong> If your league is
            public, ESPN will serve it to anyone and nothing else is needed — the
            app stores no credential for you at all. If it's private you'll be
            told so, and these two are what get you in.
          </p>
          <p className="espn-note">
            They're cookies, which is why they aren't in the address bar: a cookie
            belongs to the site that set it, and no other page can read it. You
            have to copy them across by hand. With your league open, in the same
            tab:
          </p>
          <ol className="espn-steps">
            <li>
              Open developer tools — <code>F12</code>, or <code>⌥⌘I</code> on a
              Mac.
            </li>
            <li>
              Go to <strong>Application</strong> (Chrome, Edge) or{' '}
              <strong>Storage</strong> (Firefox, Safari).
            </li>
            <li>
              Under <strong>Cookies</strong>, pick <code>https://fantasy.espn.com</code>.
            </li>
            <li>
              Find the rows named <code>SWID</code> and <code>espn_s2</code>, and
              copy each one's <strong>value</strong>.
            </li>
          </ol>
          <p className="espn-note">
            <code>SWID</code> looks like <code>{'{ABCD1234-…}'}</code> — braces
            included, though it's fine if you leave them off. <code>espn_s2</code>{' '}
            is a long string with plenty of <code>%</code> signs in it; paste it
            exactly as it appears, without decoding it.
          </p>
          <p className="espn-note">
            You can paste the <strong>name and the value together</strong> if that's
            what your browser copied — <code>espn_s2:"AEB…"</code>,{' '}
            <code>SWID={'{ABCD…}'}</code>, or the whole{' '}
            <code>SWID=…; espn_s2=…</code> line — into either box. The fields read
            the values out and sort themselves, which saves trimming a
            300-character token by hand on a phone.
          </p>

          <details className="espn-details">
            <summary className="espn-summary">On a phone or tablet</summary>
            <p className="espn-note">
              <strong>Easiest: don't.</strong> This connection is saved to your
              account rather than to a device, so do it once from any computer and
              your phone has it too — nothing to repeat here.
            </p>
            <p className="espn-note">
              No mobile browser has a built-in cookie viewer, which is why the rest
              of these still involve a computer, just briefly:
            </p>
            <p className="espn-note">
              <strong>iPhone or iPad, with a Mac.</strong>
            </p>
            <ol className="espn-steps">
              <li>
                On the phone: <strong>Settings</strong> → <strong>Apps</strong> →{' '}
                <strong>Safari</strong> (on older iOS, <strong>Settings</strong> →{' '}
                <strong>Safari</strong>) → <strong>Advanced</strong> → turn on{' '}
                <strong>Web Inspector</strong>.
              </li>
              <li>
                On the Mac: <strong>Safari</strong> → <strong>Settings</strong> →{' '}
                <strong>Advanced</strong> → tick{' '}
                <strong>Show features for web developers</strong>.
              </li>
              <li>
                Connect the two by cable and tap <strong>Trust</strong> if the phone
                asks. Open your league in Safari on the phone.
              </li>
              <li>
                On the Mac: <strong>Develop</strong> → your phone's name → the{' '}
                <code>fantasy.espn.com</code> tab.
              </li>
              <li>
                In the inspector, <strong>Storage</strong> → <strong>Cookies</strong>{' '}
                → <code>fantasy.espn.com</code>.
              </li>
            </ol>
            <p className="espn-note">
              <strong>Android, with any computer.</strong>
            </p>
            <ol className="espn-steps">
              <li>
                On the phone: <strong>Settings</strong> →{' '}
                <strong>About phone</strong> → tap <strong>Build number</strong>{' '}
                seven times, then <strong>Developer options</strong> → turn on{' '}
                <strong>USB debugging</strong>.
              </li>
              <li>
                Connect by cable and allow debugging when asked. Open your league in
                Chrome on the phone.
              </li>
              <li>
                On the computer, in Chrome, go to{' '}
                <code>chrome://inspect/#devices</code> and press{' '}
                <strong>inspect</strong> under the{' '}
                <code>fantasy.espn.com</code> tab.
              </li>
              <li>
                Then <strong>Application</strong> → <strong>Cookies</strong> →{' '}
                <code>https://fantasy.espn.com</code>, as above.
              </li>
            </ol>
            <p className="espn-note">
              Whichever route you take, the two values paste into this page from
              anywhere — email them to yourself, or connect from the computer
              you're already on.
            </p>
          </details>
          <p className="espn-note espn-warn">
            Treat <code>espn_s2</code> like a password: it is a live session for
            your ESPN account. It expires every so often, and when it does the
            board will say so — come back here and paste a fresh one. The box
            below shows it rather than masking it, so you can see the whole thing
            arrived; that does mean not doing this over someone's shoulder.
          </p>
        </section>

        <form className="espn-form" onSubmit={submit}>
          <h2 className="espn-h2">{connected ? 'Reconnect' : 'Connect'}</h2>
          <label className="espn-field">
            <span className="espn-label">League URL or ID</span>
            <input
              className="espn-input"
              type="text"
              placeholder="https://fantasy.espn.com/baseball/team?leagueId=…"
              value={leagueId}
              onChange={(e) => onLeagueInput(e.target.value)}
              autoComplete="off"
            />
            {urlTeamId !== null && (
              <span className="espn-field-note">
                Read from the URL — league {leagueId}, team {urlTeamId}.
              </span>
            )}
          </label>
          <label className="espn-field">
            <span className="espn-label">
              SWID
              <span className="espn-optional">private leagues only</span>
            </span>
            {/* Deliberately **not** masked. It is a credential, but the failure
                this form actually suffers is a paste that silently dropped half
                a 300-character token, and a row of dots is no help against
                that. Seeing the value is what lets you check it. */}
            <input
              className="espn-input espn-mono"
              type="text"
              placeholder="{ABCD1234-…}"
              value={swid}
              onChange={(e) => onCookieInput('swid', e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label className="espn-field">
            <span className="espn-label">
              espn_s2
              <span className="espn-optional">private leagues only</span>
            </span>
            {/* A textarea rather than an input for the same reason: the value
                runs to some 300 characters, and an input would show you its
                last forty. Wrapped, it is checkable at a glance. */}
            <textarea
              className="espn-input espn-mono espn-textarea"
              rows={3}
              placeholder="AEB…%2F…"
              value={espnS2}
              onChange={(e) => onCookieInput('espnS2', e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>

          {error && <p className="espn-error">{error}</p>}

          <div className="espn-actions">
            <button type="submit" className="espn-submit" disabled={!ready || saving}>
              {saving ? 'Checking…' : justSaved ? 'Connected' : 'Connect league'}
            </button>
            {/* The check is a real read of the league, so the button says what
                it is doing rather than "Save": a set of cookies that can't open
                the league is worth rejecting while the form is still on screen. */}
            <span className="espn-hint">
              {cookiesGiven
                ? "Your credentials are checked against ESPN before they're saved."
                : 'Checked against ESPN before saving — a private league will say so.'}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
