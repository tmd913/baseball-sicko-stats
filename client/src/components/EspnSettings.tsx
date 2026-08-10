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
          <p className="espn-note espn-warn">
            Treat <code>espn_s2</code> like a password: it is a live session for
            your ESPN account. It expires every so often, and when it does the
            board will say so — come back here and paste a fresh one.
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
            <input
              className="espn-input"
              type="password"
              placeholder="{ABCD1234-…}"
              value={swid}
              onChange={(e) => setSwid(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="espn-field">
            <span className="espn-label">
              espn_s2
              <span className="espn-optional">private leagues only</span>
            </span>
            <input
              className="espn-input"
              type="password"
              placeholder="AEB…%2F…"
              value={espnS2}
              onChange={(e) => setEspnS2(e.target.value)}
              autoComplete="off"
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
