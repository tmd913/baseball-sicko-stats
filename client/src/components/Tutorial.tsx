import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useLockBodyScroll } from '../hooks';

/**
 * The how-to page: a full-screen overlay in the same shape as PlayerDetails —
 * fixed, its own scroller, the page behind it pinned, Escape or Back to leave —
 * so it reuses `.details-view` and `.details-back` rather than inventing a
 * second full-screen shell.
 *
 * It's one continuous read rather than a set of tabs: a tutorial is written to
 * be gone through in order, and tabs would hide eight of the nine chapters from
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
    tab: 'Watchlist',
    title: 'Build your watchlist',
    body: (
      <>
        <p>
          Everything in the app is a read on the players <em>you</em> follow, so the
          first thing to do is put some there. The roster search sits above the card
          list on the <Ui>Players</Ui> view — and, while your watchlist is still
          empty, at the top of whichever view you're on, since that's the only way out
          of an empty list.
        </p>
        <ol className="tut-steps">
          <Step>
            Type a name into <Ui>Search for a player</Ui>. It matches the whole
            season's roster, first name or last.
          </Step>
          <Step>
            Tap the <Ui>+</Ui> at the right of a result to add them. They appear in
            the list straight away.
          </Step>
          <Step>
            Tap the <strong>name</strong> instead and you get their player page
            without adding them — season line, percentile rankings, game log. There's
            an <Ui>Add to watchlist</Ui> button up there if you like what you see.
          </Step>
        </ol>
        <p className="tut-note">
          Two-way players appear twice in the search — once as a batter, once as a
          pitcher — and are watched separately. Add one, the other, or both; each gets
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
          The date control in the header decides what every view is showing. The
          presets cover most of it:
        </p>
        <Demo label="The header presets — a dropdown on a phone">
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
          For anything else, the calendar button opens a range picker. A range can run
          up to 62 days.
        </p>
      </>
    ),
  },
  {
    id: 'tut-views',
    tab: 'Views',
    title: 'Three ways to read the day',
    body: (
      <>
        <p>
          The tabs under the header switch between three takes on the same watchlist
          over the same dates. Pick whichever answers the question you actually have.
        </p>
        <Demo label="The view bar — the second tier appears once you watch both kinds">
          <div className="view-bar-tabs">
            <div className="view-switch">
              <span className="view-tab active">Summary</span>
              <span className="view-tab">Players</span>
              <span className="view-tab">Feed</span>
            </div>
            <div className="kind-switch">
              <span className="kind-tab active">
                Batters<span className="kind-tab-count">6</span>
              </span>
              <span className="kind-tab">
                Pitchers<span className="kind-tab-count">3</span>
              </span>
            </div>
          </div>
        </Demo>
        <dl className="tut-defs">
          <dt>Summary</dt>
          <dd>
            The default. One row per player — opponent, H/AB, R, HR, RBI, SB, OPS, BB,
            K — with a <strong>Total</strong> row pinned at the bottom. The opponent
            column reads the matchup and first pitch before the game, the live score
            and inning during it, the final after. Scroll it sideways on a phone; the
            headshot column stays put.
          </dd>
          <dt>Players</dt>
          <dd>
            One card per player, in your own order. This is the deep read: every plate
            appearance, every pitch, the video. Cards start collapsed — tap a header
            to open one.
          </dd>
          <dt>Feed</dt>
          <dd>
            A chronological stream across everyone you watch, in three sections:{' '}
            <strong>Live</strong> (whoever is at bat, on deck, on base or on the
            mound), <strong>Recent plays</strong> — <strong>Recent outings</strong> on
            the pitcher side — and <strong>Upcoming</strong> games that haven't started
            yet. Tap any row to open it. The recent section pages 20 at a time behind a{' '}
            <Ui>Load more</Ui> button.
          </dd>
        </dl>
        <p className="tut-note">
          Every view shows one kind at a time. Once you watch both batters and
          pitchers, the <Ui>Batters</Ui> / <Ui>Pitchers</Ui> tabs appear beside the
          view tabs and follow you from view to view.
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
            player's card on the <Ui>Players</Ui> view, expands it and scrolls it to
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
          On the <Ui>Players</Ui> view, a card's header is the whole summary: name,
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
          anyone on the season roster, watchlisted or not, and its tabs are:
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
          The header carries <Ui>Add to watchlist</Ui> when he isn't on it and a
          remove button when he is, plus a link out to his Baseball Savant page.
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
          Your watchlist keeps the order you put it in, and that order is what every
          view reads down. Once you're watching more than one player, an{' '}
          <Ui>
            <PencilIcon /> Edit
          </Ui>{' '}
          button appears beside the search box on the <Ui>Players</Ui> view.
        </p>
        <ol className="tut-steps">
          <Step>
            Tap <Ui>Edit</Ui>. The cards are replaced by one compact row per player.
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
            Tap <Ui>Done</Ui> to go back to the cards.
          </Step>
        </ol>
        <p className="tut-note">
          Batters and pitchers are ordered independently — you're only ever reordering
          the tab you're on, and the other kind stays where it was. A player can also
          be removed from their player page.
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
          every 20 seconds on its own — no refreshing.
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
        <p>
          Nothing on? Open the{' '}
          <Ui>
            <GearIcon /> settings
          </Ui>{' '}
          menu beside the title and turn on <Ui>Simulate live</Ui>. It overlays a
          synthetic live day on your watchlist so you can see all of the above without
          waiting for first pitch. It changes nothing on the server, and switching it
          off puts the real day back.
        </p>
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
            kind, which cards are open and which player page you're on all live in the
            URL. Reload and you're where you left off; send the link and someone else
            lands on the same screen. A link saved under <Ui>Today</Ui> opens on the
            new today, not the day you saved it.
          </li>
          <li>
            <strong>
              <GearIcon /> Settings
            </strong>{' '}
            — beside the title: the simulate toggle, this guide, and sign out.
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
