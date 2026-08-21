import { useEffect, useRef, useState } from 'react';
import { answersEscape, useDelayedFlag, useLockBodyScroll, useOverlayFocus } from '../hooks';
import { api } from '../api';
import type { EspnStatus, EspnTeam } from '../types';
import type { ThemeId } from '../theme';
import { LoadingBlock } from './Loading';
import { ThemeSwatches } from './ThemePicker';

/**
 * Whether this tab is already the installed app, asked once at import: a page
 * telling somebody how to install what they are looking at is the one reader
 * this tip has nothing for. Both tests, because they answer for different
 * vintages of iOS — `display-mode: standalone` is what a manifest-era home
 * screen web app matches, and `navigator.standalone` is Safari's own flag,
 * which is the only one older iOS sets. Neither can change while the tab is
 * open, so a constant rather than state.
 */
const INSTALLED =
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

/** The iOS Share glyph — the box with an arrow out of it, which is what the
 *  reader is looking for in Safari's toolbar and is quicker to recognize than
 *  the word. `currentColor`, so it is the ink of the `<strong>` it sits in
 *  rather than a color of its own, and `aria-hidden` because the word beside it
 *  already says it. */
function ShareGlyph() {
  return (
    <svg
      className="onboard-share"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.6v10.2" />
      <path d="M8.6 7 12 3.6 15.4 7" />
      <path d="M7.6 10.4H5.2v10h13.6v-10h-2.4" />
    </svg>
  );
}

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
  theme,
  onTheme,
  onConfirm,
  onDone,
}: {
  /** The connection as it stands, straight off the join. */
  status: Extract<EspnStatus, { connected: true }>;
  /** The scheme in force, and the app's own setter for it — see the picker
   *  below for why this page offers one at all. */
  theme: ThemeId;
  onTheme: (id: ThemeId) => void;
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
    let canceled = false;
    setReadError(null);
    api
      .espnOwnership()
      .then((o) => {
        if (canceled) return;
        setTeams(o.teams);
        // ESPN names the team itself when the SWID identifies one, which for a
        // joiner it does not — but the answer costs nothing to honor.
        setPicked((cur) => (cur === '' && o.myTeamId != null ? String(o.myTeamId) : cur));
      })
      .catch((e: Error) => {
        if (!canceled) setReadError(e.message);
      });
    return () => {
      canceled = true;
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
    // nobody reads — it would also blink the ball off the button for the frame
    // before the boot takes the screen. Only the failing path stays on screen,
    // and it clears its own.
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

        {/* **The color scheme, under the one question this page is for.**

            It is here because this is the first screen a new user sees and the
            app has six palettes — two of them light — so a reader on a bright
            screen, or one who simply wants the plain pair, is otherwise
            committed to Midnight's navy until they find a gear they have no
            reason to open yet. The settings menu is still where it lives; this
            is the one moment the app can reasonably ask, because it is already
            asking something.

            **Second, not first.** The team is what the page is *for* — the lede
            says so, and naming it is what turns the roster views over — so the
            required question leads and the optional one follows it. Putting a
            preference above the task is the settings-page mistake this whole
            page exists to avoid.

            **It is the settings menu's own swatches** (`ThemeSwatches`), so a
            reader who meets the gear later meets a control they have already
            used. What it does not borrow is the heading: this page labels its
            fields `.espn-label`, and the popover's small-caps section label
            would be a second vocabulary on one screen.

            A press applies immediately and saves itself — the page changing
            color under the reader is the whole confirmation, and there is
            nothing here for the button below to commit. */}
        {phase === 'ready' && (
          <div className="espn-field onboard-field onboard-scheme">
            <span className="espn-label">Color scheme</span>
            <ThemeSwatches theme={theme} onPick={onTheme} />
          </div>
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
                /* The one control on the page, so it says what pressing it does
                   rather than `OK`: it names the team *and* leaves.

                   **Pressing it disables it and changes nothing else.** It drew
                   a spinning baseball beside the label while the save was in
                   flight, and that is a loading indicator on a control whose
                   whole job is to be pressed once — it widened the button by the
                   ball and its gap under the finger that had just pressed it,
                   and dragged `Not now` along with it. `:disabled` is the state,
                   and `.espn-submit:disabled` already draws it (0.45, and no
                   pointer); the press is over in a round trip, and the page
                   itself going away is the confirmation.

                   `aria-busy` stays. It draws nothing — no rule in the
                   stylesheet reads it — and it is the honest thing to tell a
                   screen reader about a control that is disabled *because* it
                   is working rather than because it is unavailable. */
                disabled={picked === '' || saving}
                aria-busy={saving}
                onClick={confirm}
              >
                Start using the app
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

        {/* **Last, and an aside rather than a step.** The page is one question
            and its answer; this is neither, so it comes after the note that
            closes them off and is drawn as a card on its own ground rather than
            as another line of the flow — a reader who is done here can leave
            without reading it.

            **Shown to everyone, worded for the phone.** The alternative was a
            user-agent sniff, and it buys nothing here: the one reader this has
            nothing for is the one already looking at the installed app, and
            that is a fact the platform will state (`INSTALLED`) rather than a
            guess off a string. A desktop reader gets a card whose first three
            words name its audience, and is past it in the time it takes to
            read them.

            The claim in the last sentence is `apple-mobile-web-app-capable`'s,
            declared in `client/index.html` — without that meta an added icon
            opens a Safari tab like any bookmark, and this would be describing
            something the app does not do.

            **`Open as Web App` is named because the sheet can contradict the
            meta.** iOS 18.2 put a switch on the Add to Home Screen sheet, and
            the meta decides which way it starts rather than what it does: a
            reader who has turned it off for something else, or who is handed a
            phone where it is off, adds an icon that opens a Safari tab while the
            page above it promises full screen. Naming the switch costs a clause
            and is the difference between a tip that holds whatever state the
            sheet is in and one that holds only in the default. `Leave … switched
            on` rather than `turn on` for the same reason — with the meta shipped
            it is on when the reader gets there, and telling somebody to turn on
            what is already on reads as a step they have missed. */}
        {phase !== 'loading' && !INSTALLED && (
          <aside className="onboard-tip">
            <p className="espn-label">Add it to your home screen</p>
            <p className="espn-note onboard-tip-note">
              On your iPhone, tap{' '}
              <strong>
                <ShareGlyph /> Share
              </strong>{' '}
              in Safari&rsquo;s toolbar, then <strong>Add to Home Screen</strong>.
              Leave <strong>Open as Web App</strong> switched on — that is what
              makes the icon open the way an app does: full screen, no address
              bar, no tab to find again.
            </p>
          </aside>
        )}
      </div>
      </div>
    </div>
  );
}
