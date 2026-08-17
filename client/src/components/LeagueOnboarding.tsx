import { useEffect, useRef, useState } from 'react';
import { answersEscape, useDelayedFlag, useLockBodyScroll, useOverlayFocus } from '../hooks';
import { api } from '../api';
import type { EspnStatus, EspnTeam } from '../types';
import { LoadingBlock, LoadingLine } from './Loading';

/**
 * The page an invite link lands on: the league you have just joined, a list of
 * its teams, and one button that says which is yours and puts you in the app.
 *
 * **It is a page of its own rather than the Fantasy league settings page**,
 * which is where an invite used to land. That page is written for the person
 * who *connects* a league — most of it is instructions for finding two browser
 * cookies, and under them a status panel, a sharing section and a Disconnect —
 * and none of that is anything to do with the person the link was sent to. What
 * that reader has to do is one thing: say which team is theirs. Opening them on
 * a page of somebody else's apparatus, with the one control they need three
 * sections down it, is a doorway that reads as a settings screen.
 *
 * So the onboarding flow is the one question and its answer, and the settings
 * page is untouched behind it — reachable from the fantasy button the moment
 * this closes, which is where somebody goes when they want the rest of it.
 *
 * **Why the pick matters enough to be a page.** Naming a team for the first
 * time is what turns the roster views over to the fantasy team (see
 * `App.tsx::confirmEspnOnboarding`), so it is the last step of joining rather
 * than a preference: without it a brand-new user is in a league and reading a
 * saved roster they have nothing in. The button's label says so.
 */
export function LeagueOnboarding({
  status,
  onConfirm,
  onDone,
}: {
  /** The connection as it stands, straight off the join. */
  status: Extract<EspnStatus, { connected: true }>;
  /**
   * Name the team and start the app on it — the whole of the last step, App's
   * to do because it is the one that knows which list the views should read
   * and it finishes by reloading the tab (see `App.tsx::confirmEspnOnboarding`
   * for why a boot rather than a reconciliation). Rejects if the team could not
   * be set, which is the one failure that leaves this page on screen; resolving
   * means the page is going away, so nothing after it has to be cleared.
   */
  onConfirm: (teamId: number) => Promise<void>;
  /** Leave the flow — skipped it, or pressed Escape. */
  onDone: () => void;
}) {
  useLockBodyScroll();

  const [teams, setTeams] = useState<EspnTeam[] | null>(null);
  // The team already on the connection, which is not null in the one case that
  // matters: re-opening a link for a league this user is already on. `''` is
  // the placeholder, so the button can require a real answer.
  const [picked, setPicked] = useState<string>(status.teamId == null ? '' : String(status.teamId));
  const [saving, setSaving] = useState(false);
  /**
   * Two failures, deliberately two pieces of state, because they leave the page
   * in different shapes. **The league could not be read** takes the picker away
   * — there is nothing to pick from — so the page becomes the message and a
   * retry of that read. **The team could not be saved** leaves everything on
   * screen and adds a line: the answer is still in the box, and the retry is
   * pressing the button again. One `error` covering both had the save's failure
   * swap the picker for a `Try again` that would have re-read the teams, which
   * is not the thing that failed.
   */
  const [readError, setReadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Bumped by the retry, so a failed read can be asked for again — the rule the
  // opponent table's own span retry follows.
  const [attempt, setAttempt] = useState(0);
  const phase: 'loading' | 'error' | 'ready' =
    readError !== null ? 'error' : teams === null ? 'loading' : 'ready';
  // Nothing at all under `WAIT_DELAY`, which is the app's one rule for a pane
  // with nothing in it yet — a wait that appears and vanishes inside a tenth of
  // a second reads as the page breaking rather than as an answer.
  const waiting = useDelayedFlag(phase === 'loading');

  /**
   * The league's teams. `/api/espn/ownership` is the one call that knows them,
   * and it is the same call the settings page's picker makes — a lookup on the
   * server's own ten-minute cache rather than a second trip to ESPN, since the
   * join immediately before this has already read the league.
   *
   * A failure here is worth a message rather than a shrug, which is where this
   * parts from the settings page: there the picker is a convenience over a team
   * the SWID usually names on its own, and here it is the whole page.
   */
  useEffect(() => {
    let cancelled = false;
    setReadError(null);
    api
      .espnOwnership()
      .then((o) => {
        if (cancelled) return;
        setTeams(o.teams);
        // ESPN names the team itself when the SWID identifies one, which for a
        // joiner it does not — but the answer costs nothing to honour.
        setPicked((cur) => (cur === '' && o.myTeamId != null ? String(o.myTeamId) : cur));
      })
      .catch((e: Error) => {
        if (!cancelled) setReadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const viewRef = useRef<HTMLDivElement | null>(null);
  useOverlayFocus(viewRef);

  // Through the shared test, so this page claims the press rather than leaving
  // it for anything under it — see `hooks.ts::answersEscape`. Escape is the
  // keyboard's version of `Not now`, which is the visible way out below.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answersEscape(e, viewRef.current)) onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const confirm = async () => {
    if (picked === '') return;
    setSaving(true);
    setSaveError(null);
    try {
      await onConfirm(Number(picked));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not set the team');
      setSaving(false);
    }
    // Deliberately no `finally`: on the way through the tab reloads, and
    // clearing a flag on a page that is being torn down is a state update
    // nobody reads — it would also blink the button back from `Setting up` to
    // its label for the frame before the boot takes the screen. Only the
    // failing path stays on screen, and it clears its own.
  };

  return (
    <div className="details-view onboard-view" ref={viewRef} tabIndex={-1}>
      {/* A wrapper purely so the block can sit in the middle of the window: it
          is one question and its answer, which at the top left of a desktop
          reads as a page that failed to load the rest of itself. See
          `.onboard-inner`, where the `margin: auto` that does it — and why it
          is that rather than `justify-content` — is set out. */}
      <div className="onboard-inner">
      <div className="tut-head onboard-head">
        <div className="tut-title-block">
          <p className="onboard-kicker">You&rsquo;ve been invited to</p>
          <h1 className="tut-title onboard-title">
            {status.leagueName ?? `League ${status.leagueId}`}
          </h1>
          <p className="tut-lede">
            You&rsquo;re on the league now — no ESPN login, nothing to copy.
            One thing left: tell the app which team is yours, and the Roster and
            Feed views will read it instead of an empty list.
          </p>
        </div>
      </div>

      <div className="tut-body onboard-body">
        {phase === 'loading' && waiting && (
          <LoadingBlock>Reading your league&rsquo;s teams</LoadingBlock>
        )}

        {phase === 'error' && <p className="espn-error">{readError}</p>}

        {phase === 'ready' && teams && (
          <label className="espn-field onboard-field">
            <span className="espn-label">Your team</span>
            <select
              className="espn-input espn-select"
              value={picked}
              disabled={saving || teams.length === 0}
              onChange={(e) => setPicked(e.target.value)}
            >
              <option value="">Choose your team&hellip;</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {phase === 'ready' && saveError !== null && (
          <p className="espn-error">{saveError}</p>
        )}

        {/* One row, whichever of the two answerable states we are in — and the
            way out is in it either way. A page whose league could not be read
            offering only `Try again` is the trap this app's own rule names: a
            mode with no visible way out. */}
        {phase !== 'loading' && (
          <div className="espn-actions onboard-actions">
            {phase === 'ready' ? (
              <button
                type="button"
                className="espn-submit"
                /* The one control on the page, so it says what pressing it
                   does rather than `OK`: it names the team *and* leaves. */
                disabled={picked === '' || saving}
                aria-busy={saving}
                onClick={confirm}
              >
                {saving ? (
                  <LoadingLine announce={false}>Setting up</LoadingLine>
                ) : (
                  'Start using the app'
                )}
              </button>
            ) : (
              <button
                type="button"
                className="espn-submit"
                onClick={() => {
                  setReadError(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>
            )}
            {/* Skipping leaves the league connected and the team unnamed, which
                the Fantasy league page fixes whenever they get round to it. */}
            <button type="button" className="espn-skip" disabled={saving} onClick={onDone}>
              Not now
            </button>
          </div>
        )}

        {phase !== 'loading' && (
          <p className="espn-note onboard-note">
            You can change this later, and share the league on to anyone else in
            it, from the <strong>fantasy button</strong> beside the settings gear
            at the top of the page.
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
