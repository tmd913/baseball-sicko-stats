import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useLockBodyScroll } from '../hooks';

/**
 * The how-to page: a full-screen overlay in the same shape as PlayerDetails —
 * fixed, its own scroller, the page behind it pinned, Escape or Back to leave —
 * so it reuses `.details-view` and `.details-back` rather than inventing a
 * second full-screen shell.
 *
 * It's one continuous read rather than a set of tabs: a tutorial is written to
 * be gone through in order, and tabs would hide nine of the ten chapters from
 * someone who doesn't yet know what they're looking for. The chapter strip at
 * the top is a jump list, not a switch — it tracks whichever chapter is under
 * the top of the viewport (see `useActiveChapter`).
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

const CalendarIcon = () => (
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
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
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

const CollapseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="tut-inline-icon"
  >
    <path d="M7 6 12 10 17 6M7 18 12 14 17 18" />
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
    id: 'tut-watchlist',
    tab: 'Roster',
    title: 'Build your roster',
    body: (
      <>
        <p>
          Everything on the <Ui>Roster</Ui> page is a read on the players{' '}
          <em>you</em> follow every day, so the first thing to do is put some there.
          The search sits at the top right of every page — it belongs to your roster
          rather than to any one view, so it is in the same place wherever you are.
        </p>
        <p className="tut-note">
          Two lists, and it's worth getting the words straight now.{' '}
          <strong>Your roster</strong> is this one: the players the Summary, Games and
          Feed views report on.{' '}
          <strong>Your watchlist</strong> is a separate list you build on the{' '}
          <Ui>Research</Ui> board, out of players you're keeping an eye on but haven't
          taken on — a free agent you might pick up belongs there and not here.
        </p>
        <ol className="tut-steps">
          <Step>
            Type a name into <Ui>Search for a player</Ui>. It matches the whole
            season's roster, first name or last. On a phone there's no room for the
            field, so it hides behind the{' '}
            <Ui>
              <SearchIcon />
            </Ui>{' '}
            — press that and a search bar opens across the top with the cursor
            already in it, and <Ui>Escape</Ui> or the <Ui>✕</Ui> closes it again.
          </Step>
          <Step>
            Tap the <Ui>+</Ui> at the right of a result to add them. They appear in
            the list straight away.
          </Step>
          <Step>
            Tap the <strong>name</strong> instead and you get their player page
            without adding them — season line, percentile rankings, game log. There's
            an <Ui>Add to roster</Ui> button up there if you like what you see, and a{' '}
            <Ui>Watch</Ui> star beside it if you'd rather just keep an eye on him.
          </Step>
        </ol>
        <p className="tut-note">
          Two-way players appear twice in the search — once as a batter, once as a
          pitcher — and are rostered separately. Add one, the other, or both; each gets
          its own card.
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
          The date control decides what every view is showing. The presets cover most
          of it:
        </p>
        <Demo label="The presets, behind the calendar button on the Roster row">
          <div className="date-presets">
            <span className="date-preset active">Today</span>
            <span className="date-preset">Tomorrow</span>
            <span className="date-preset">Yesterday</span>
            <span className="date-preset">This week</span>
          </div>
        </Demo>
        <ul className="tut-list">
          <li>
            <strong>Today</strong> is where you start. The baseball day turns over at
            3am Eastern, so a west-coast game finishing after midnight still counts as
            tonight.
          </li>
          <li>
            <strong>Tomorrow</strong> is the look-ahead: scheduled first pitches,
            announced starters, and how your hitters have done against that hand.
          </li>
          <li>
            <strong>This week</strong> and <strong>Last 15 days</strong> roll several
            days into one card per player — every game stacked into one line.
          </li>
        </ul>
        <p>
          For anything else, the dated button beside them opens a range picker. A
          range can run up to 62 days.
        </p>
        <p className="tut-note">
          All of that lives behind the calendar button at the end of the{' '}
          <Ui>Roster</Ui> tab row — it is the widest control in the app and you set
          it once, so it stays out of the way until you want it. Press it and the
          presets and the range picker open on a line of their own; picking a preset
          closes them again. Meanwhile the button says which days you are looking at:
          the preset's own word while one is on, and the dates themselves once you
          pick a range by hand.
        </p>
      </>
    ),
  },
  {
    id: 'tut-views',
    tab: 'Views',
    title: 'Two ways to read the day',
    body: (
      <>
        <p>
          <Ui>Roster</Ui> and <Ui>Feed</Ui> are two takes on the same thing: your own
          players over the dates you picked. One is a table you read across, the other
          a stream you read down. Pick whichever answers the question you actually
          have. (<Ui>Research</Ui> at the end is the other thing entirely: the whole
          league, covered in the next chapter.)
        </p>
        <Demo label="The view bar — the groups wrap as the window allows">
          <div className="view-bar">
            <div className="view-bar-tabs">
              <div className="view-switch">
                <span className="view-tab active">Roster</span>
                <span className="view-tab">Feed</span>
                <span className="view-tab">Research</span>
              </div>
              <div className="kind-switch">
                <span className="kind-tab active">Batters</span>
                <span className="kind-tab">Pitchers</span>
              </div>
              <span className="date-toggle">
                <CalendarIcon />
                <span className="date-toggle-label">Today</span>
              </span>
            </div>
          </div>
        </Demo>
        <dl className="tut-defs">
          <dt>Roster</dt>
          <dd>
            The default. One row per player — opponent, H/AB, R, HR, RBI, SB, OPS, BB,
            K — with a <strong>Total</strong> row pinned at the bottom. The opponent
            column reads the matchup and first pitch before the game, the live score
            and inning during it, the final after. Scroll it sideways on a phone; the
            headshot column stays put.
          </dd>
          <dt>Feed</dt>
          <dd>
            Everything that happened, newest first, across everyone you watch, in three
            sections: <strong>Live</strong> (whoever is at bat, on deck, on base or on
            the mound), <strong>Recent plays</strong> — <strong>Recent outings</strong>{' '}
            on the pitcher side — and <strong>Upcoming</strong> games that haven't
            started yet. Tap any row to open it; the recent section pages 20 at a time
            behind a <Ui>Load more</Ui> button.
          </dd>
          <dt>
            Feed, <Ui>By player</Ui>
          </dt>
          <dd>
            The same day sorted by who rather than by when: one card per player,
            holding his live at-bat, his plays or his outing and his next game. This is
            the deep read — every plate appearance, every pitch, the video — and it is
            where the old <strong>Games</strong> tab went, that page having been this
            grouping and nothing else. Cards start collapsed; tap a header to open one.
          </dd>
        </dl>
        <p className="tut-note">
          Both show one kind at a time. Once you watch both batters and pitchers, the{' '}
          <Ui>Batters</Ui> / <Ui>Pitchers</Ui> tabs appear beside them and follow you
          from page to page. <Ui>Research</Ui>, at the end of the row, is a different
          animal — the whole league rather than your roster — and has the next chapter
          to itself.
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
          <Ui>Research</Ui> is the one page that isn't about your roster: every
          player in the league on a single sortable table. It answers the other
          question — not "how did my guys do tonight" but "who else is doing this".
          It needs nothing watched, which makes it the one view that works before
          you've added anybody.
        </p>
        <Demo label="Which players the board includes — three buttons, not a choice of one">
          <div className="research-include">
            <span className="research-toggle research-inc">My Roster</span>
            <span className="research-toggle research-inc">Other Rosters</span>
            <span className="research-toggle research-inc on">Free Agents</span>
          </div>
        </Demo>
        <p>
          Those three say <em>whose</em> players are on the board, and they{' '}
          <strong>compose</strong> — each one is separately on or off, so "my roster
          and the free agents" is a thing you can ask for. It opens on{' '}
          <Ui>Free Agents</Ui>, which is the question the board is usually being asked;
          turn all three on for the whole league. Without a fantasy league connected
          there is no way to know who is on somebody else's team, so the third button
          reads <Ui>Everyone Else</Ui> and means exactly that, and the middle one
          isn't offered at all.
        </p>
        <Demo label="The position row — it picks the board and filters it at once">
          <div className="research-positions">
            <span className="research-pos-tab active">Batters</span>
            <span className="research-pos-tab">Pitchers</span>
            <span className="research-pos-tab">C</span>
            <span className="research-pos-tab">1B</span>
            <span className="research-pos-tab">SS</span>
            <span className="research-pos-tab">OF</span>
            <span className="research-pos-tab">SP</span>
            <span className="research-pos-tab">RP</span>
          </div>
        </Demo>
        <p>
          That row is the main control, and it does two jobs at once: the position you
          pick decides <em>which board you're on</em>. <Ui>SS</Ui> puts you on the
          batting table, <Ui>RP</Ui> on the pitching one. <Ui>IF</Ui> and{' '}
          <Ui>OF</Ui> are the whole infield and outfield, so they overlap the single
          positions on purpose, and <Ui>SP</Ui> / <Ui>RP</Ui> split the pitchers by
          whether most of their appearances are starts. On a phone the row scrolls
          sideways rather than wrapping — a table wants every pixel of height it can
          get, and eleven pills over three lines would push the first name off the
          bottom of the screen.
        </p>
        <ul className="tut-list">
          <li>
            <strong>Sort by any column.</strong> Tap a header; tap again to reverse
            it. Columns whose good end is the low one — ERA, WHIP, a batter's K —
            open small-first on their own. Players with no value for that stat sink
            to the bottom either way, so a blank never outranks a real number.
          </li>
          <li>
            <strong>Season · 7d · 15d · 30d · 60d.</strong> Every number on the board
            is drawn from the span you pick here, so it's out in the open rather than
            behind a button. It's also the one research setting the address bar
            carries.
          </li>
          <li>
            <strong>The star beside a name.</strong> That's your{' '}
            <strong>watchlist</strong> — nothing to do with your roster, and the
            reason both exist. Star the free agent you're thinking about, the
            leaguemate's shortstop you're eyeing for a trade, anybody. The{' '}
            <Ui>Watchlist</Ui> button up top then narrows the board to them, and it
            composes with everything else: the position, the window, the filters.
            Players who are on your <em>roster</em> carry a small baseball instead,
            wherever the board is showing more than just them.
          </li>
          <li>
            <strong>Connect a fantasy league</strong> from the baseball button beside
            the gear and the board learns who owns whom: <Ui>Free Agents</Ui> becomes
            the players nobody in your league has, and <Ui>Other Rosters</Ui> the ones
            they do. That page walks through where ESPN keeps the two cookies it
            needs, and it's also where you say which team in the league is yours. With
            that set, the button's <Ui>Use my fantasy team</Ui> swaps the other three
            views over to it — same tables, your fantasy team instead of the roster
            you built here, each player carrying the slot he's in today (his position
            if he's in the lineup, <Ui>BE</Ui> or <Ui>IL</Ui> if he isn't). The roster
            you built is untouched and comes back when you switch off — untouched
            being the point, so while the fantasy team is in view nothing in the app
            offers to edit it or the saved one: the reorder screen is away, the search
            finds players but no longer adds them, and a player's page shows no add or
            remove. And you only
            need one person in a league to do any of this: whoever connects first can
            turn on a share link, and everyone else joins by opening it — no cookies,
            no league ID. Connecting also adds a <Ui>Ros%</Ui> column to the board and
            a rostered figure to each player's page: the share of all ESPN leagues
            he's on a roster in, which sorts and filters like any other column — and a{' '}
            <Ui>Δ7d</Ui> beside it for which way that has been moving. Sort by it once
            for the week's biggest adds, twice for the drops. Four more spans are a
            tick away in <Ui>Columns</Ui> — <Ui>Δ1d</Ui>, <Ui>Δ3d</Ui>,{' '}
            <Ui>Δ15d</Ui> and <Ui>Δ30d</Ui> — and they often disagree: the
            man everyone dropped last month can be the one they're picking back up
            today. Each label says the span it actually measured, and a span with no
            history behind it yet isn't offered at all.
          </li>
        </ul>
        <h3 className="tut-sub">The four buttons</h3>
        <dl className="tut-defs">
          <dt>Search</dt>
          <dd>Find one player by name, anywhere in the league.</dd>
          <dt>Filters</dt>
          <dd>
            Pick a stat, <Ui>≥</Ui> or <Ui>≤</Ui>, a number, <Ui>Add</Ui>. Stack as
            many as you like — "300+ PA" and ".350+ xwOBA" is two of them — and each
            shows as a chip under the bar that stays put whether the panel is open or
            shut. A filter on a column you've hidden still applies.
          </dd>
          <dt>Watchlist</dt>
          <dd>
            Narrows the board to the players you've starred. The number on the button
            is how many of them are on this board — batters or pitchers, whichever
            you're looking at.
          </dd>
          <dt>Columns</dt>
          <dd>
            The two boards carry about forty columns each, so they open on the
            box-score line plus the headline Statcast numbers and the rest are a tick
            away. Each group has an <Ui>All</Ui> / <Ui>None</Ui>. Your choice is saved
            to your account, per board.
          </dd>
        </dl>
        <p className="tut-note">
          The count above the table — "622 of 622 batters" — always says how much of
          the board you're looking at, so a short table reads as a tight filter rather
          than a short league. Tap any name to open that player's page, which is where
          the <Ui>Add to roster</Ui> button is.
        </p>
      </>
    ),
  },
  {
    id: 'tut-navigate',
    tab: 'Navigation',
    title: 'Getting around',
    body: (
      <>
        <p>
          Two things are clickable on a player wherever they appear, and they go to
          two different places. It's worth learning once:
        </p>
        <ul className="tut-list">
          <li>
            <strong>The headshot</strong> opens the <strong>player page</strong> — the
            season-long view: percentile rankings, splits, game log, arsenal. That
            works from the summary table, the feed, a card header and the search
            results alike.
          </li>
          <li>
            <strong>The name</strong>, in the summary table or the feed, jumps to that
            player's card on the <Ui>Games</Ui> view, expands it and scrolls it to
            the top — so you get from "he had a good night" to the pitch-by-pitch in
            one tap.
          </li>
        </ul>
        <p>
          After a jump like that, a <Ui>Back</Ui> button appears at the{' '}
          <strong>bottom left</strong>. It returns you to the view you came from, at
          the scroll position you left it at. Using the view tabs clears it — an
          explicit navigation means you're no longer on a detour.
        </p>
        <p className="tut-note">
          The player page closes with its own <Ui>Back</Ui> button, top left, or the{' '}
          <Ui>Esc</Ui> key.
        </p>
      </>
    ),
  },
  {
    id: 'tut-cards',
    tab: 'Cards',
    title: 'Inside a card',
    body: (
      <>
        <p>
          On the <Ui>Games</Ui> view, a card's header is the whole summary: name,
          season line, the game's score, and a tag for anything live. Tap the header
          to expand it — and tap it again to close.
        </p>
        <h3 className="tut-sub">Batters</h3>
        <p>
          An open card is one block per game, and inside it one card per plate
          appearance: the outcome, the pitch-by-pitch table, and a strike-zone plot of
          where those pitches went. Hover a pitch — or tap it on a phone — and it
          lights up in the table and the zone at once.
        </p>
        <p>
          Batted balls carry exit velocity, launch angle and distance. Where a clip
          exists it plays right there in the at-bat, and the <Ui>Highlights</Ui>{' '}
          button on a finished game plays every one of that player's at-bats back to
          back.
        </p>
        <p className="tut-note">
          Every clip has a speaker button in its top-left corner. If you have{' '}
          <Ui>Mute clip audio</Ui> on in settings, that is where you turn the sound
          back on for one clip without changing the setting — handy on a phone, where
          the browser's own controls disappear while a clip is playing.
        </p>
        <h3 className="tut-sub">Pitchers</h3>
        <p>A pitcher's card opens onto four sections, each its own bar:</p>
        <dl className="tut-defs">
          <dt>Line</dt>
          <dd>
            The outing: decision, IP, pitch count and strike rate, then the results
            (H/R/ER/BB/K), the rates (ERA, WHIP, K%, whiff, CSW) and the contact he
            gave up. Open by default — it's what you came for.
          </dd>
          <dt>Innings</dt>
          <dd>
            Every batter faced, grouped by inning. An inning header carries BF/H/R/K
            and opens to the results; a result opens again to the full pitch sequence.
          </dd>
          <dt>Opponent</dt>
          <dd>
            How the lineup he's facing hits — season, and against his hand — with each
            number's league rank beside it. On a pitcher who hasn't taken the ball
            yet, this <em>is</em> the card.
          </dd>
          <dt>Arsenal</dt>
          <dd>
            One row per pitch type: usage, strike rate, velo, spin and movement, each
            with an arrow against his own season, then what hitters did against it.
          </dd>
        </dl>
        <p className="tut-note">
          The Line and Arsenal sections carry <Ui>Overall</Ui> / <Ui>vs RHB</Ui> /{' '}
          <Ui>vs LHB</Ui> tabs, and only offer a hand he actually faced.
        </p>
      </>
    ),
  },
  {
    id: 'tut-details',
    tab: 'Player page',
    title: 'The player page',
    body: (
      <>
        <p>
          Tapping any headshot opens the season-long view of that player. It works for
          anyone on the season roster, on your list or not, and its tabs are:
        </p>
        <dl className="tut-defs">
          <dt>Percentile Rankings</dt>
          <dd>
            The Savant card — where he ranks in the league on each metric. Rows that
            pair an actual with its expected counterpart (wOBA/xwOBA, ERA/xERA) read
            as the expected number at rest; hover or tap one to reveal both ends and
            see how far over or under he's been running.
          </dd>
          <dt>Season</dt>
          <dd>
            The whole line, then the same line against left-handers and against
            right-handers, stacked so each split reads column-for-column against the
            overall row above it.
          </dd>
          <dt>Game Log</dt>
          <dd>
            Every regular-season game, newest first, with a season total row at the
            bottom. Columns marked <strong>Szn</strong> are season-to-date{' '}
            <em>through</em> that game, not the game's own — that's what a game log
            means by AVG.
          </dd>
          <dt>Arsenal</dt>
          <dd>Pitchers only: the season's pitch mix, with its own platoon splits.</dd>
          <dt>Rolling xwOBA</dt>
          <dd>
            A rolling average over the last 50, 100 or 250 plate appearances — the
            shape of a hot or cold stretch.
          </dd>
        </dl>
        <p>
          The header carries <Ui>Add to roster</Ui> when he isn't on it and a remove
          button when he is, a <Ui>Watch</Ui> star for the other list, and a link out
          to his Baseball Savant page. While the views are reading your fantasy team
          the first two step aside — ESPN owns that list, so the page says{' '}
          <Ui>On roster</Ui> for a player who is on it and leaves the adding and
          dropping to ESPN. The star stays either way; the watchlist is yours.
        </p>
      </>
    ),
  },
  {
    id: 'tut-editing',
    tab: 'Editing',
    title: 'Reorder and remove',
    body: (
      <>
        <p>
          Your roster keeps the order you put it in, and that order is what every
          view reads down. Once you're watching more than one player,{' '}
          <Ui>
            <PencilIcon /> Edit players
          </Ui>{' '}
          appears in the{' '}
          <Ui>
            <GearIcon /> Settings
          </Ui>{' '}
          menu beside the title. Press it from anywhere and it takes you to{' '}
          <Ui>Games</Ui>, where the reordering happens.
        </p>
        <ol className="tut-steps">
          <Step>
            Tap <Ui>Edit players</Ui>. The edit screen takes the whole page — the
            tabs, the dates and the search all step out of the way, leaving the list
            and the title above it, with <Ui>Done</Ui> beside that title as the way
            back.
          </Step>
          <Step>
            Drag a row to move it. On a phone, drag from the <Ui>⠿</Ui> grip — the
            rest of the row scrolls the page as usual. With a mouse you can grab
            anywhere on the row. The new order saves as soon as you let go.
          </Step>
          <Step>
            Tap a row's <Ui>✕</Ui> to remove that player. It arms first, turning into{' '}
            <Ui>Remove?</Ui>; tap again to confirm. There's no undo, which is why it
            takes two.
          </Step>
          <Step>
            Tap <Ui>Done</Ui> beside the title to go back to the cards.
          </Step>
        </ol>
        <p className="tut-note">
          Batters and pitchers are ordered independently — you're only ever reordering
          the tab you're on, and the other kind stays where it was, so the{' '}
          <Ui>Batters · Pitchers</Ui> switch comes along to the edit screen and sits
          beside its title. A player can also be removed from their player page.
        </p>
      </>
    ),
  },
  {
    id: 'tut-live',
    tab: 'Live',
    title: 'While games are on',
    body: (
      <>
        <p>
          When any watched player is in a game that's in progress, the app re-polls
          every 20 seconds on its own — no refreshing. That poll is only for live
          games, so anything else that changes during the day — a lineup posting, an
          IL move, a trade on your fantasy league — waits for the{' '}
          <Ui>
            <RefreshIcon /> Refresh
          </Ui>{' '}
          button at the top right, which re-reads whatever the page you're on is made
          of and leaves it on screen while it does.
        </p>
        <ul className="tut-list">
          <li>
            Headshots pick up a coloured ring for a player who's{' '}
            <strong>at bat</strong>, <strong>on deck</strong>,{' '}
            <strong>on base</strong> or <strong>on the mound</strong>, on the cards
            and in the summary table alike, with a matching tag beside the name.
          </li>
          <li>
            The feed's <strong>Live</strong> section pins exactly those players at the
            top, so whatever is happening right now never scrolls away.
          </li>
          <li>
            A batter's headshot carries his <strong>lineup spot</strong> in the
            corner; a pitcher's carries <strong>SP</strong>, or <strong>RP</strong>{' '}
            with the inning he entered.
          </li>
          <li>
            On a pitcher's card, the half-inning he's currently throwing is outlined
            in purple and tagged <strong>Live</strong>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'tut-tips',
    tab: 'Tips',
    title: 'Shortcuts worth knowing',
    body: (
      <>
        <ul className="tut-list">
          <li>
            <strong>
              <CollapseIcon /> Collapse all
            </strong>{' '}
            — bottom right, whenever anything is open. It clears whichever view you're
            on.
          </li>
          <li>
            <strong>↑ Back to top</strong> — bottom right too, once you've scrolled a
            screenful.
          </li>
          <li>
            <strong>The address bar is your state.</strong> The dates, the view, the
            kind, which cards are open, which player page you're on, and on the league
            board the position, the time span and the columns — all of it lives in the
            URL. Reload and you're where you left off; send the link and someone else
            lands on the same screen. A link saved under <Ui>Today</Ui> opens on the
            new today, not the day you saved it.
          </li>
          <li>
            <strong>
              <GearIcon /> Settings
            </strong>{' '}
            — beside the title: hiding injured players, muting clip audio, editing
            your player order, this guide, and sign out. The two toggles are saved to
            your account, so they follow you to another device.
          </li>
          <li>
            <strong>Expanding scrolls.</strong> Whatever you open — a card, a game, an
            inning, an at-bat — lands at the top of the screen, so you never open
            something and then have to go looking for it.
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

export function Tutorial({ onClose }: { onClose: () => void }) {
  // Same as the player page: this covers the app but scrolls in its own box, so
  // the page behind it has to be frozen or the scroll chains straight through.
  useLockBodyScroll();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const active = useActiveChapter(scrollRef);

  // Close on Escape, as every other full-screen view does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const jump = (id: string) => {
    scrollRef.current
      ?.querySelector(`#${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="details-view tutorial-view" ref={scrollRef}>
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
          <h1 className="tut-title">
            How to use <span className="brand-sicko">Statcast Sicko</span>
          </h1>
          <p className="tut-lede">
            Watch a handful of players, pick a stretch of days, and read the night
            three ways — as a table, a card per player, or a live stream. Here's the
            whole app in nine short chapters.
          </p>
        </div>
      </div>

      <div className="tut-nav-wrap">
        <nav className="tut-nav" aria-label="Chapters">
          {CHAPTERS.map((c) => (
            <button
              key={c.id}
              type="button"
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
    </div>
  );
}
