import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { answersEscape, useLockBodyScroll, useOverlayFocus } from '../hooks';
import { BackButton } from './BackButton';
import {
  FloatControls,
  useFloatHeight,
  useHeadGone,
  useScrollToTop,
} from './FloatControls';
import { BaseballMark } from './BaseballMark';

/**
 * The how-to page: a full-screen overlay in the same shape as PlayerDetails —
 * fixed, its own scroller, the page behind it pinned, Escape or Back to leave —
 * so it reuses `.details-view` and `.details-back` rather than inventing a
 * second full-screen shell. Reached from the settings menu, from the empty
 * roster's `How does this work?`, and by `?help=1`.
 *
 * Once the head has scrolled off it carries a second `Back` in the bottom-left
 * corner and a `↑` in the bottom-right, both of them the app's own floating
 * shapes: nine chapters is a long way from either end of itself, and the strip
 * that is pinned through them jumps you *within* the page and never off it. See
 * `FloatControls.tsx`, which the league settings page shares.
 *
 * It's one continuous read rather than a set of tabs: a tutorial is written to
 * be gone through in order, and tabs would hide eight of the nine chapters
 * from someone who doesn't yet know what they're looking for. The chapter strip
 * at the top is a jump list, not a switch — it tracks whichever chapter is
 * under the top of the viewport (see `useActiveChapter`).
 *
 * ---------------------------------------------------------------------------
 * One chapter per surface, and the chapter is short
 * ---------------------------------------------------------------------------
 *
 * This was ten chapters written against an older app, and most of what had gone
 * stale had gone stale *silently* — the prose still read well, it just named
 * controls that are no longer on screen. A guide that sends a reader looking for
 * a button that isn't there is worse than a guide half the length, so the
 * rewrite is a rewrite rather than a patch. What went, and why:
 *
 * - **The `Games` tab**, which two chapters were built on ("Inside a card" was
 *   entirely about it). It is the Feed now, and the per-player grouping it
 *   carried is the player page's Overview tab.
 * - **"Two things are clickable and they go to two places."** They go to one:
 *   the name and the headshot both open the player page (`SummaryTable`'s own
 *   comment records the change). The bottom-left jump-back button that chapter
 *   ended on went with the jump.
 * - **`Collapse all`**, which went with the accordions it collapsed — the feed's
 *   openable shapes each raise a dialog now, so there is never more than one
 *   open.
 * - **Four color schemes**, where `theme.ts` has held six since `Dark` and
 *   `Light` were added.
 * - **The watchlist narrowing the board.** It widens it now, which is the
 *   opposite instruction.
 *
 * And what the page had never covered at all, each now a chapter or a run of a
 * chapter: the `Schedule` and `Projected` readings, the research board's
 * `Teams`, `Ranks` and `Schedule`, the outing page, the League and Matchup
 * tabs, and connecting an ESPN league in the first place.
 *
 * The test applied to every sentence below is whether it was read off the
 * component that draws the thing — not off this file's own previous draft.
 *
 * **And it is shorter while covering more.** Measured in the running app off
 * `.tut-body`'s own `innerText`: **3,564 words → 2,229**, and the rendered page
 * at 390px **14,206px → 9,698** (at 1440: 10,094 → 7,291) — figures from that
 * pass, and 30px light of what the page measures now (9,728 at 390), the foot
 * having since been given room for the floating pair. Four surfaces
 * that had no coverage at all gained a chapter each in that space, which is the
 * whole argument for cutting the enumerations: a reader does not need the
 * twelve pitcher column headings listed to know the pitchers are a second block
 * with headings of their own, and every word spent listing them was a word not
 * spent on the outing page.
 */

/** A control the reader will find on screen, named the way the app names it. */
function Ui({ children }: { children: ReactNode }) {
  return <span className="tut-ui">{children}</span>;
}

/** A step in a numbered how-to list. */
function Step({ children }: { children: ReactNode }) {
  return <li className="tut-step">{children}</li>;
}

/**
 * A non-interactive replica of a real control, built from the app's own classes
 * so it looks exactly like the thing being described. Those rules are written
 * against the class, not the element, so plain spans render identically; the
 * pointer events are turned off in `.tut-demo`, so nothing here invites a tap
 * that does nothing.
 */
function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tut-demo">
      <div className="tut-demo-stage" aria-hidden="true">
        {children}
      </div>
      <span className="tut-demo-label">{label}</span>
    </div>
  );
}

const GearIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="tut-inline-icon">
    <circle cx="12" cy="12" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M10.11 3.1A9.1 9.1 0 0 1 13.89 3.1L13.68 5.72A6.5 6.5 0 0 1 16.6 7.4L18.76 5.91A9.1 9.1 0 0 1 20.65 9.19L18.28 10.32A6.5 6.5 0 0 1 18.28 13.68L20.65 14.81A9.1 9.1 0 0 1 18.76 18.09L16.6 16.6A6.5 6.5 0 0 1 13.68 18.28L13.89 20.9A9.1 9.1 0 0 1 10.11 20.9L10.32 18.28A6.5 6.5 0 0 1 7.4 16.6L5.24 18.09A9.1 9.1 0 0 1 3.35 14.81L5.72 13.68A6.5 6.5 0 0 1 5.72 10.32L3.35 9.19A9.1 9.1 0 0 1 5.24 5.91L7.4 7.4A6.5 6.5 0 0 1 10.32 5.72L10.11 3.1Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
    className="tut-inline-icon"
  >
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.4 15.4 4.1 4.1" />
  </svg>
);

/** The date bar's own step, at the size the bar draws it. */
const ChevronIcon = ({ back }: { back?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={back ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);

const PencilIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="tut-inline-icon"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const RefreshIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="tut-inline-icon"
  >
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v4.5h-4.5" />
  </svg>
);

interface Chapter {
  id: string;
  /** Short label for the jump strip. */
  tab: string;
  /** Full heading over the chapter itself. */
  title: string;
  body: ReactNode;
}

const CHAPTERS: Chapter[] = [
  {
    id: 'tut-roster',
    tab: 'Roster',
    title: 'Start with your players',
    body: (
      <>
        <p>
          Nearly everything here is a read on the players <em>you</em> follow, so put
          some on the list first. The search is at the top right of every page — on a
          phone behind the{' '}
          <Ui>
            <SearchIcon />
          </Ui>
          , which opens a bar across the top with the cursor already in it.
        </p>
        <ol className="tut-steps">
          <Step>
            Type a name into <Ui>Search for a player</Ui> — it matches the whole
            season, first name or last.
          </Step>
          <Step>
            Press the <Ui>+</Ui> beside a result to add him.
          </Step>
          <Step>
            Or press the <strong>name</strong> and read his player page first;{' '}
            <Ui>Add to roster</Ui> is up there too.
          </Step>
        </ol>
        <p className="tut-note">
          <strong>Two lists, and the words matter.</strong> Your{' '}
          <strong>roster</strong> is this one — the players the Roster page and the
          Feed report on. Your <strong>watchlist</strong> is the <Ui>Watch</Ui> star:
          men you are keeping an eye on but have not taken on, read on the{' '}
          <Ui>Research</Ui> board.
        </p>
        <p>
          Your roster keeps the order you put it in.{' '}
          <Ui>
            <PencilIcon /> Edit players
          </Ui>{' '}
          in the{' '}
          <Ui>
            <GearIcon /> Settings
          </Ui>{' '}
          menu is where you drag a row to move it, or press its <Ui>✕</Ui> twice to
          drop him. Two-way players are two entries, rostered separately, and each
          gets his own row.
        </p>
      </>
    ),
  },
  {
    id: 'tut-dates',
    tab: 'Dates',
    title: 'Choose the days',
    body: (
      <>
        <p>
          The date bar under the tabs decides which days the Roster page is showing —
          a step back, the days, a step forward:
        </p>
        <Demo label="The date bar, under the tabs on the Roster page">
          <div className="date-bar">
            <div className="date-bar-row">
              <span className="date-step">
                <ChevronIcon back />
              </span>
              <span className="date-face">
                <span className="date-face-lead">Today</span>
                <span className="date-face-range">Mon, Aug 18</span>
              </span>
              <span className="date-step">
                <ChevronIcon />
              </span>
            </div>
          </div>
        </Demo>
        <ul className="tut-list">
          <li>
            The baseball day turns over at <strong>3am Eastern</strong>, so a
            west-coast game finishing after midnight still counts as tonight.
          </li>
          <li>
            <strong>The arrows move a window, not a day.</strong> On <Ui>Today</Ui> a
            press is a day either way; on a fortnight a press is a fortnight.{' '}
            <Ui>Tomorrow</Ui> is the look-ahead — first pitches and announced starters.
          </li>
          <li>
            <strong>Press the middle for a calendar.</strong> One day picked twice is
            that day, two days are the range between them, up to about two months.
          </li>
        </ul>
        <p className="tut-note">
          The face says what <em>kind</em> of days these are, so a link you share is
          about the reader's own day rather than yours: <Ui>Yesterday</Ui> where the
          days are exactly that, <Ui>Custom range</Ui> where you picked them, and{' '}
          <Ui>Schedule · Week 19</Ui> or <Ui>Projected</Ui> in the two readings that
          are not simply a range. The Feed keeps a range of its own.
        </p>
      </>
    ),
  },
  {
    id: 'tut-readings',
    tab: 'Readings',
    title: 'Four ways to read your roster',
    body: (
      <>
        <p>
          The tabs are the pages: <Ui>Roster</Ui> is your players, <Ui>Research</Ui> is
          the whole league, and <Ui>Matchup</Ui> and <Ui>League</Ui> appear once a
          fantasy league is connected. The row under them is <em>how</em> you read the
          Roster page — one at a time, and pressing the lit one puts you back on the
          table.
        </p>
        <Demo label="The tabs, and the reading buttons under them">
          <div className="tut-demo-stack">
            <div className="view-bar">
              <div className="main-tabs">
                <span className="main-tab is-active">Roster</span>
                <span className="main-tab">Matchup</span>
                <span className="main-tab">Research</span>
                <span className="main-tab">League</span>
              </div>
            </div>
            <div className="view-tools">
              <span className="feed-toggle on">Feed</span>
              <span className="schedule-toggle">Schedule</span>
              <span className="projected-toggle">Projected</span>
            </div>
          </div>
        </Demo>
        <dl className="tut-defs">
          <dt>The table — nothing lit</dt>
          <dd>
            A row per player over the days you picked, batters then pitchers, each half
            with its own headings. The opponent cell reads the matchup before the game,
            the score and inning during it, the final after. The <strong>Total</strong>{' '}
            row is a divider as well as a sum — it sits under whoever is starting today.
          </dd>
          <dt>
            <Ui>Feed</Ui>
          </dt>
          <dd>The same players and days read by the clock. Next chapter.</dd>
          <dt>
            <Ui>Schedule</Ui>
          </dt>
          <dd>
            The days <em>ahead</em> in place of the stats: a column per day naming that
            day's opponent, a count of the games in the span, and the days a pitcher is
            announced to start. How far ahead is in the date bar.
          </dd>
          <dt>
            <Ui>Projected</Ui>
          </dt>
          <dd>
            What these players are expected to do over the days still to be played,
            added to what they have done. A projected figure is always drawn broken
            rather than solid — an estimate never wears the same clothes as a
            measurement.
          </dd>
        </dl>
        <h3 className="tut-sub">While games are on</h3>
        <p>
          The page re-reads itself every 20 seconds while anyone on your roster is in a
          live game. Headshots pick up a colored ring for a man <strong>at bat</strong>,{' '}
          <strong>on deck</strong>, <strong>on base</strong> or{' '}
          <strong>on the mound</strong>, with his lineup spot — or <strong>SP</strong> /{' '}
          <strong>RP</strong> — in the corner.
        </p>
      </>
    ),
  },
  {
    id: 'tut-feed',
    tab: 'Feed',
    title: 'The day as it happened',
    body: (
      <>
        <p>
          <Ui>Feed</Ui> is your roster's day as one stream, newest first:{' '}
          <strong>Live</strong> pinned at the top, then <strong>Recent plays</strong>,{' '}
          <strong>Recent outings</strong> and <strong>Upcoming</strong>.
        </p>
        <ul className="tut-list">
          <li>
            <strong>A plate appearance</strong> gives the outcome, the pitcher and the
            contact. Press it for MLB's description, the pitch-by-pitch table and a
            strike-zone plot — hover or tap a pitch and it lights in both. A clip plays
            in place where there is film.
          </li>
          <li>
            <strong>Steals, pickoffs, balks and wild pitches</strong> get their own rows
            under the man they happened to.
          </li>
          <li>
            <strong>A pitcher's outing</strong> is one bar, and the bar opens his outing
            page.
          </li>
          <li>
            <strong>An upcoming game</strong> opens a batter's platoon splits, or the
            lineup a pitcher is about to face.
          </li>
        </ul>
        <p className="tut-note">
          The pills above the plays narrow them to one kind — <Ui>All</Ui>, <Ui>H</Ui>,{' '}
          <Ui>RBI</Ui>, <Ui>HR</Ui>, <Ui>SB</Ui>, <Ui>R</Ui>, <Ui>Video</Ui> — and touch
          nothing else; the live section and the outings are never filtered. A red{' '}
          <Ui>N new plays</Ui> button opens whatever has arrived since you last read.
          Every clip has a speaker in its corner, which is how you hear one clip with{' '}
          <Ui>Mute clip audio</Ui> still on.
        </p>
      </>
    ),
  },
  {
    id: 'tut-research',
    tab: 'Research',
    title: 'The whole league',
    body: (
      <>
        <p>
          <Ui>Research</Ui> is the one page that is not about your roster: every player
          in the league on a single sortable table, forty-odd columns wide. It needs
          nothing rostered, which makes it the one view that works before you have added
          anybody.
        </p>
        <Demo label="Which players the board includes — three switches, not a choice of one">
          <div className="research-include">
            <span className="research-toggle research-inc on">Free Agents</span>
            <span className="research-toggle research-inc">My Roster</span>
            <span className="research-toggle research-inc">Other Rosters</span>
          </div>
        </Demo>
        <p>
          Those three <strong>compose</strong> — each is separately on or off, so "my
          roster and the free agents" is a thing you can ask for. Without a fantasy
          league there is no ownership to read, so the first reads{' '}
          <Ui>Everyone Else</Ui> and the third is not offered. <Ui>Watchlist</Ui> beside
          them works the other way round: it <em>adds</em> your starred players,
          whoever owns them.
        </p>
        {/* Six of the eleven pills, which is what a 390px phone fits without the
            last one being cut in half. The real row scrolls sideways there; this
            one cannot, `.tut-demo` having turned its pointer events off, so a
            replica wider than the stage would be a control with a hidden half and
            no way to reach it. */}
        <Demo label="The position row — it picks the board and filters it at once">
          <div className="research-positions">
            <span className="research-pos-tab active">Batters</span>
            <span className="research-pos-tab">Pitchers</span>
            <span className="research-pos-tab">C</span>
            <span className="research-pos-tab">SS</span>
            <span className="research-pos-tab">OF</span>
            <span className="research-pos-tab">SP</span>
          </div>
        </Demo>
        <p>
          The position also decides <em>which board you are on</em>: <Ui>SS</Ui> puts
          you on the batting table, <Ui>RP</Ui> on the pitching one, and <Ui>IF</Ui> and{' '}
          <Ui>OF</Ui> overlap the single positions on purpose. Beside it,{' '}
          <Ui>Season · 7d · 15d · 30d · 60d</Ui> is the span every number is drawn from,
          and <Ui>Teams</Ui> re-reads the same board as thirty clubs.
        </p>
        <dl className="tut-defs">
          <dt>
            <Ui>Search</Ui> · <Ui>Filters</Ui>
          </dt>
          <dd>
            Search matches a name or a club. Filters is a builder — a stat, <Ui>≥</Ui>{' '}
            or <Ui>≤</Ui>, a number — and they stack as chips you can drop. A filter on
            a hidden column still applies.
          </dd>
          <dt>
            <Ui>Columns</Ui> · <Ui>Ranks</Ui>
          </dt>
          <dd>
            The board opens on the box score plus the headline Statcast numbers; the
            rest are a tick away, and their order is yours to set. <Ui>Ranks</Ui> puts a
            percentile badge under every value, 100 always the good end — dashed where
            the player is short of the qualifying bar.
          </dd>
          <dt>Sorting</dt>
          <dd>
            Press a header, press again to reverse. ERA, WHIP and a batter's K open
            small-first on their own, and a blank never outranks a real number.
          </dd>
        </dl>
        <p className="tut-note">
          After each name: the <strong>star</strong> is your watchlist, the{' '}
          <strong>baseball</strong> means he is on your roster, the{' '}
          <strong>padlock</strong> that a leaguemate has him, the{' '}
          <strong>newspaper</strong> that there is news about him today. The line above
          the table — "455 of 622 batters" — always says how much of the board you are
          looking at, so a short table reads as a tight filter rather than a short
          league.
        </p>
      </>
    ),
  },
  {
    id: 'tut-player',
    tab: 'Player page',
    title: "A player's page",
    body: (
      <>
        <p>
          A name or a headshot, anywhere in the app, opens the season-long view of that
          player — on your roster or not. The head carries a <Ui>Watch</Ui> star,{' '}
          <Ui>Add to roster</Ui> or <Ui>On roster</Ui>, and a link out to Baseball
          Savant. Its tabs:
        </p>
        <dl className="tut-defs">
          <dt>Overview</dt>
          <dd>
            What he is doing today — his at-bats, his outing, or the next game he has —
            then his news, his season line and his last five games. Each block links to
            the tab holding the whole of it.
          </dd>
          <dt>Arsenal</dt>
          <dd>
            Pitchers only: <strong>Pitch Usage</strong>, what he throws to each hand,
            and <strong>Movement Profile</strong>, where each pitch breaks against the
            league, with his arm angle in the corner. Pick a pitch in one and it lights
            in both. The same two pictures sit on each of his outings, drawn against
            this season instead of the league.
          </dd>
          <dt>Percentile Rankings</dt>
          <dd>
            Where he ranks in the league on each metric. A row pairing an actual with
            its expected (wOBA/xwOBA, ERA/xERA) shows the expected number; press it for
            both ends.
          </dd>
          <dt>Splits</dt>
          <dd>
            One bar per stat, running from the center toward the hand he is{' '}
            <em>stronger</em> against — so a platoon question is answered without any
            subtraction. Hatched means one side is too thin to lean on.
          </dd>
          <dt>News</dt>
          <dd>
            Beat reports — a lineup he is out of, a bullpen session, a job changing
            hands — interleaved with MLB's own IL placements, recalls and trades.
          </dd>
          <dt>Stats</dt>
          <dd>
            The research board turned on its side: season, then the last 7, 15, 30 and
            60 days down the page, under the board's own columns.
          </dd>
          <dt>Game Log</dt>
          <dd>
            Every game, newest first. Columns marked <strong>Szn</strong> are
            season-to-date <em>through</em> that game rather than the game's own. Press
            a row to open that afternoon.
          </dd>
          <dt>Schedule · Charts</dt>
          <dd>
            His club's next fortnight, or a starter's next turns; and a rolling average
            over the last 50, 100 or 250 plate appearances.
          </dd>
        </dl>
      </>
    ),
  },
  {
    id: 'tut-pitchers',
    tab: 'Pitchers',
    title: 'An outing, pitch by pitch',
    body: (
      <>
        <p>
          A pitcher's game opens as a page of its own — from his bar in the Feed, from
          his Overview, or from a row of his Game Log — in four sections.
        </p>
        <dl className="tut-defs">
          <dt>Line</dt>
          <dd>
            The outing: decision, IP, pitch count and strike rate, then the results, the
            rates and the contact he gave up.
          </dd>
          <dt>Arsenal</dt>
          <dd>
            The same two pictures his player page leads with — what he threw and where
            it moved — but drawn against <em>his own season</em> rather than the
            league, so the question is whether tonight was his usual stuff. Under them,
            a row per pitch type: usage, velo, spin and movement against that season,
            and what hitters have done against it.
          </dd>
          <dt>Innings</dt>
          <dd>
            A bar per half-inning. Press one and the inning opens as the batters he
            faced, clips and all; press a batter and you get the pitch sequence beside a
            strike-zone plot, the two lighting up together.
          </dd>
          <dt>Opponent</dt>
          <dd>
            How the lineup he is facing hits — overall and against his hand — with each
            number's league rank beneath it, over a span and a home/away cut you pick.
            On a pitcher who has not taken the ball yet, this <em>is</em> the page.
          </dd>
        </dl>
        <p className="tut-note">
          Line and Arsenal carry <Ui>Overall</Ui> / <Ui>vs RHB</Ui> / <Ui>vs LHB</Ui>,
          and only offer a hand he actually faced. Nothing here has a chevron on it: the
          bar is the thing to press.
        </p>
      </>
    ),
  },
  {
    id: 'tut-fantasy',
    tab: 'Fantasy',
    title: 'Connect your fantasy league',
    body: (
      <>
        <p>
          The{' '}
          <Ui>
            <BaseballMark size={14} width={2} />
          </Ui>{' '}
          button beside the gear is everything fantasy. With nothing connected it opens
          the league page: paste a <Ui>League URL or ID</Ui>, press{' '}
          <Ui>Connect league</Ui>, and say which team is yours. A private league also
          wants ESPN's <Ui>SWID</Ui> and <Ui>espn_s2</Ui> cookies, and the page walks
          through where they are — a laptop errand, once.
        </p>
        <p className="tut-note">
          Only one person in a league needs to do that. Whoever connects first turns on{' '}
          <Ui>Share this league</Ui> and hands out the link; everybody else opens it and
          picks their team — no cookies, no league ID.
        </p>
        <dl className="tut-defs">
          <dt>
            <Ui>Matchup</Ui>
          </dt>
          <dd>
            Your week. Each category runs from its label toward whoever leads it, under
            a meter for the matchup as a whole; press a category for a day-by-day chart,
            or <Ui>Projected</Ui> to carry every total to the end of the week. Both
            managers' rosters are at the ends of the strip.
          </dd>
          <dt>
            <Ui>League</Ui>
          </dt>
          <dd>
            <strong>Scoreboard</strong> is the week's matchups as cards;{' '}
            <strong>Rankings</strong> is every team against every category over a span
            you pick; <strong>Transactions</strong> is who has added, dropped and traded
            whom, with a dot for moves you have not seen.
          </dd>
          <dt>
            <Ui>Use my fantasy team</Ui>
          </dt>
          <dd>
            Swaps the Roster readings over to your ESPN roster, each player carrying
            today's slot — his position if he is starting, <Ui>BE</Ui> or <Ui>IL</Ui> if
            not. The roster you built here is untouched and comes back when you switch
            off.
          </dd>
        </dl>
        <p>
          A league also fills in <Ui>Free Agents</Ui> and <Ui>Other Rosters</Ui> on the
          research board and adds <Ui>Ros%</Ui> — the share of all ESPN leagues a man is
          rostered in — with <Ui>Δ7d</Ui> beside it. Sort by it once for the week's
          biggest adds, twice for the drops.
        </p>
        <p className="tut-note">
          The one thing the app cannot see for itself is a move you make on ESPN.{' '}
          <Ui>
            <RefreshIcon /> Refresh from ESPN
          </Ui>{' '}
          is what sends it to go and look.
        </p>
      </>
    ),
  },
  {
    id: 'tut-settings',
    tab: 'Settings',
    title: 'Settings, and a few shortcuts',
    body: (
      <>
        <ul className="tut-list">
          <li>
            <strong>
              <GearIcon /> Settings
            </strong>{' '}
            beside the title holds the color scheme, <Ui>Hide injured players</Ui>,{' '}
            <Ui>Mute clip audio</Ui>, <Ui>Edit players</Ui>, this guide and sign out.
            All of it is saved to your account, so it follows you to another device.
          </li>
          <li>
            <strong>Six color schemes.</strong> <Ui>Dark</Ui> and <Ui>Light</Ui> are the
            plain pair; <Ui>Midnight</Ui> is the navy original, <Ui>Lavender</Ui> is
            gray and violet, and <Ui>Maroon</Ui> and <Ui>Powder Blue</Ui> are the two
            halves of a 1980 road uniform. Each button is a swatch of the palette it
            picks.
          </li>
          <li>
            <strong>Give a table the whole page</strong> with the expand button in the
            corner cell above the headshots — the roster, the research board and a game
            log all have one.
          </li>
          <li>
            <strong>Back and Escape.</strong> Every page that opens over another has a{' '}
            <Ui>Back</Ui> button at the top left and answers <Ui>Esc</Ui>, and one press
            undoes exactly one thing. <strong>↑</strong> at the bottom right returns you
            to the top.
          </li>
          <li>
            <strong>The address bar is your state</strong> — the dates, the page, the
            reading, the player you have open, the board's whole setup. Reload and you
            are where you left off; send the link and someone else lands on the same
            screen. A link saved under <Ui>Today</Ui> opens on the new today.
          </li>
        </ul>
      </>
    ),
  },
];

/**
 * The chapter under the top of the scroller, for the jump strip's highlight.
 * The observation band is pulled down past the sticky strip and up off the
 * bottom of the viewport, so the active chip changes as a heading passes under
 * the strip rather than when a chapter merely peeks into view.
 */
function useActiveChapter(rootRef: RefObject<HTMLElement | null>): string {
  const [active, setActive] = useState(CHAPTERS[0].id);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const inBand = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target.id);
          else inBand.delete(e.target.id);
        }
        // Topmost chapter still in the band wins. With none in it — mid-chapter,
        // where the heading has scrolled past the top — whatever was last set is
        // still the chapter being read, so leave it alone.
        const first = CHAPTERS.find((c) => inBand.has(c.id));
        if (first) setActive(first.id);
      },
      { root, rootMargin: '-56px 0px -75% 0px', threshold: 0 },
    );
    for (const c of CHAPTERS) {
      const el = root.querySelector(`#${c.id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [rootRef]);
  return active;
}

/**
 * The strip follows the chapter it is marking.
 *
 * Measured at 390px with nine chapters: five chips fit, so a reader on
 * `Settings` was being shown a lit chip four positions off the right end of a
 * strip that had never moved — a jump list saying nothing about where you are,
 * which is the one job it has beyond jumping.
 *
 * **`scrollLeft` on the strip rather than `scrollIntoView` on the chip.** That
 * call walks every scrollable ancestor, and this one's nearest is the overlay
 * itself — so nudging the strip sideways would also have moved the page the
 * reader is scrolling, which is what raises the highlight in the first place.
 * Written as "bring it just inside whichever edge it is past", so a chip
 * already in view is left exactly where it is and no press ever costs a jolt.
 */
function useFollowActive(navRef: RefObject<HTMLElement | null>, active: string) {
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-chapter="${active}"]`);
    if (!nav || !chip) return;
    const pad = 16;
    const left = chip.offsetLeft - pad;
    const right = chip.offsetLeft + chip.offsetWidth + pad;
    if (left < nav.scrollLeft) nav.scrollTo({ left, behavior: 'smooth' });
    else if (right > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: right - nav.clientWidth, behavior: 'smooth' });
    }
  }, [navRef, active]);
}

export function Tutorial({ onClose }: { onClose: () => void }) {
  // Same as the player page: this covers the app but scrolls in its own box, so
  // the page behind it has to be frozen or the scroll chains straight through.
  useLockBodyScroll();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const active = useActiveChapter(scrollRef);
  useFollowActive(navRef, active);
  // The floating pair, and the room kept for it at the foot of the page.
  const headGone = useHeadGone(headRef, scrollRef);
  useFloatHeight(scrollRef, backRef);
  // The background inert and the focus in here, as every overlay in this app
  // now does — measured before the fix, 10 of 10 tab stops off this page and
  // into the chrome behind it. See `hooks.ts::useOverlayFocus`.
  useOverlayFocus(scrollRef);

  // Close on Escape, as every other full-screen view does — through the shared
  // test, so this page claims the press rather than leaving it for the player
  // page underneath to answer as well. See `hooks.ts::answersEscape`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answersEscape(e, scrollRef.current)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const jump = (id: string) => {
    scrollRef.current
      ?.querySelector(`#${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toTop = useScrollToTop(scrollRef);

  return (
    <div className="details-view tutorial-view" ref={scrollRef} tabIndex={-1}>
      <div className="tut-head" ref={headRef}>
        <BackButton onClose={onClose} />
        <div className="tut-title-block">
          <h1 className="tut-title">
            How to use <span className="brand-sicko">Statcast Sicko</span>
          </h1>
          <p className="tut-lede">
            Follow a handful of players, pick a stretch of days, and read them four
            ways — as a stat table, as the day's plays, as the fixtures ahead, or as
            what those fixtures are worth. Here is the whole app in nine short
            chapters.
          </p>
        </div>
      </div>

      <div className="tut-nav-wrap">
        <nav className="tut-nav" aria-label="Chapters" ref={navRef}>
          {CHAPTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              data-chapter={c.id}
              className={`tut-nav-chip${active === c.id ? ' is-active' : ''}`}
              onClick={() => jump(c.id)}
              aria-current={active === c.id ? 'true' : undefined}
            >
              {c.tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="tut-body">
        {CHAPTERS.map((c, i) => (
          <section key={c.id} id={c.id} className="tut-section">
            <h2 className="tut-heading">
              <span className="tut-num" aria-hidden="true">
                {i + 1}
              </span>
              {c.title}
            </h2>
            {c.body}
          </section>
        ))}
        <div className="tut-end">
          <button type="button" className="tut-done" onClick={onClose}>
            Got it — back to the games
          </button>
        </div>
      </div>

      <FloatControls shown={headGone} backRef={backRef} onTop={toTop} onClose={onClose} />
    </div>
  );
}
