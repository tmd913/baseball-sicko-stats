import { useEffect, useMemo, useRef, useState } from 'react';
import { playerKey } from '../types';
import type { SeasonPlayer, TeamInfo, WatchPlayer } from '../types';
import { searchFold } from '../lib';
import { api } from '../api';
import { useDelayedFlag } from '../hooks';
import { SpinningBaseball } from './Loading';
import { TeamMark } from './PlayerIdentity';

/**
 * **How long the field waits after a keystroke before asking MLB.**
 *
 * The local match is free and runs on every letter; the remote one is a request
 * per query, so it runs on the pause that says the reader has finished a word.
 * 250ms is `WAIT_DELAY`'s number and it is the same idea from the other end —
 * that is how long a reader will not notice something not having happened yet.
 * Measured on the live server: `walker jenk` answers in 180-320ms cold and
 * ~2ms warm, so a typed name is on screen inside half a second of the last
 * keystroke and instantly on the second reader to type it.
 */
const SEARCH_DEBOUNCE = 250;

/** Below this the query is not sent — the server's own `PLAYER_SEARCH_MIN`,
 *  mirrored here so the field can hold its wait without a round trip to be told
 *  the answer is empty. `names=an` comes back capped at 50 rows of nobody in
 *  particular; the local list already answers a two-letter query. */
const SEARCH_MIN = 3;

/** **The whole menu, players and prospects together.** It was the local
 *  matches' own cap and it stays the same number: eight names is already the
 *  most this dropdown can be without reading as a page (the menu has no
 *  max-height and no scroller of its own — it is a list, at the width of the
 *  field), and the men MLB lists beyond the season roster arrive *into* that
 *  budget rather than beside it. Measured before the cap covered both:
 *  `griff` drew **13 rows** on a 430px phone, running past the fold and over
 *  the page behind it. */
const MENU_ROWS = 8;

export function PlayerAdder({
  players,
  watchlist,
  recent = [],
  canAdd = true,
  onAdd,
  onOpenDetails,
  teams = [],
  onOpenTeam,
  onPick,
  loading,
  autoFocus = false,
  onClose,
}: {
  players: SeasonPlayer[];
  watchlist: WatchPlayer[];
  /**
   * The players picked out of this search most recently, newest first, as the
   * app's `${kind}-${id}` keys — what the menu offers while the field is
   * focused and empty.
   *
   * **Keys rather than rows**, resolved here against `players`: this component
   * is already holding the whole season roster to match against, so the name,
   * the club and the position a row draws are one lookup away and can never be
   * a staler copy of them. A key that resolves to nobody is dropped rather than
   * drawn as a bare id — a player the roster list has forgotten is one this
   * search could not find by typing either, so a row for him would open on
   * nothing.
   *
   * **That last clause stopped being true when the field learned to reach past
   * the season list**, and the rule survives because `App` answers for it
   * instead: a remembered key nothing on the client can name is looked up by id
   * (`foundPlayers`) and arrives in `players` here, so a prospect picked
   * yesterday is a row today rather than a name that quietly vanished. The
   * drop is still the right behavior for what it is now left holding — a key
   * MLB itself cannot name.
   */
  recent?: string[];
  /**
   * Whether this search can put a player on the roster. False in fantasy mode,
   * where ESPN owns that list: the ＋ goes and the field becomes what it always
   * also was, a way of opening a player's page.
   *
   * It could have kept adding to the *saved* list — the one the app goes back
   * to when the fantasy toggle is turned off — and that was the standing
   * argument for leaving it alone. What it costs is a button whose entire
   * effect is invisible: the player joins a list no view on screen is showing,
   * and the only sign anything happened is that his row quietly stops appearing
   * in this very search. The app had already decided the other half of this —
   * the reorder screen is hidden in fantasy mode for exactly the reason ESPN
   * owns the list — so the ＋ was the last surviving limb of an editing path
   * whose other end was already gone.
   */
  canAdd?: boolean;
  onAdd: (p: WatchPlayer) => void;
  onOpenDetails: (key: string) => void;
  /**
   * **The thirty clubs, searched beside the players** — because a club is now a
   * subject with a page, and this field is the app's one way of reaching a
   * subject by typing its name.
   *
   * Absent (or empty) is the field as it was: the club rows simply are not
   * drawn, which is what a failed teams read leaves behind and is the right
   * answer for it — a search that quietly finds no clubs beats one that offers
   * a row opening on nothing.
   */
  teams?: TeamInfo[];
  onOpenTeam?: (teamId: number) => void;
  /**
   * Called with the key of whichever player was picked, by either route — the
   * ＋ that rosters him and the name that opens his page both *complete* a
   * search, which is the act worth remembering. Absent where nothing is
   * keeping a history.
   */
  onPick?: (key: string) => void;
  loading: boolean;
  // Set when the search bar has just been opened from the header icon: the
  // press that revealed the field should also put the cursor in it.
  autoFocus?: boolean;
  // Dismiss the bar. Escape does it, and so does opening a player's page —
  // the overlay takes the screen, and a search bar waiting underneath it is
  // a control left open behind a door.
  onClose?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // `loading` is in the deps because the field is disabled until the roster
  // lands and a disabled input cannot take focus — on a cold open the first
  // attempt is a no-op and this is what lands the cursor once it can.
  useEffect(() => {
    if (autoFocus && !loading) inputRef.current?.focus();
  }, [autoFocus, loading]);

  // Keyed by kind, not id: a two-way player is offered once per kind, and
  // watching him as a hitter shouldn't hide the pitcher row.
  //
  // The dedupe goes with the ＋ that justifies it. It is there so the menu shows
  // the state of the thing its button changes — a player already on the roster
  // has nothing left for this control to do — and with no button there is no
  // such state to show: hiding the rostered player would only be the search
  // declining to find someone, for a reason nothing on screen could explain.
  const watchedKeys = useMemo(
    () => (canAdd ? new Set(watchlist.map(playerKey)) : new Set<string>()),
    [watchlist, canAdd],
  );

  // Folded once per player rather than once per keystroke: the season roster is
  // ~1,400 rows and arrives once, where the query changes on every letter. Both
  // spellings are kept for the reason both were matched before — `savantName`
  // is "Last, First", which is what makes `ramirez jose` find him.
  const haystacks = useMemo(
    () => players.map((p) => searchFold(p.name) + ' ' + searchFold(p.savantName)),
    [players],
  );

  const matches = useMemo(() => {
    // `searchFold` on the query too, so an accented paste and a bare-ASCII typing
    // of the same name are one query — and so the punctuation in "J.T." or
    // "Crow-Armstrong" is gone from both sides before either is compared.
    const q = searchFold(query);
    if (!q) return [];
    const out: SeasonPlayer[] = [];
    for (let i = 0; i < players.length && out.length < MENU_ROWS; i++) {
      const p = players[i];
      if (watchedKeys.has(playerKey(p))) continue;
      if (haystacks[i].includes(q)) out.push(p);
    }
    return out;
  }, [query, players, haystacks, watchedKeys]);

  /**
   * **The clubs the query names**, matched on the same folded haystack the
   * players are — so `az` finds Arizona and a typed accent or a hyphen is gone
   * from both sides before either is compared, exactly as it is for a name.
   *
   * Both the full name and the abbreviation are in it, and the abbreviation is
   * the half that matters: every table in this app calls the club `MIL`, so
   * `MIL` is what a reader who has just read one of those rows will type.
   *
   * **Clubs lead the menu**, and are capped at three so they can never crowd
   * out the players — the field is a player search that also finds clubs, which
   * is the honest description of what a reader uses it for, and there are
   * thirty clubs against fourteen hundred players.
   */
  const teamHaystacks = useMemo(
    () => teams.map((t) => searchFold(t.name) + ' ' + searchFold(t.abbreviation)),
    [teams],
  );
  const teamMatches = useMemo(() => {
    const q = searchFold(query);
    if (!q || !onOpenTeam) return [];
    const out: TeamInfo[] = [];
    for (let i = 0; i < teams.length && out.length < 3; i++) {
      if (teamHaystacks[i].includes(q)) out.push(teams[i]);
    }
    return out;
  }, [query, teams, teamHaystacks, onOpenTeam]);

  // The season roster keyed the app's own way, so a remembered key becomes the
  // row it names. One pass over the ~1,400 players, held for as long as that
  // list is — the same economy `haystacks` above makes, and for the same
  // reason: the list arrives once where the recents move a few times a session.
  const byKey = useMemo(() => {
    const m = new Map<string, SeasonPlayer>();
    for (const p of players) m.set(playerKey(p), p);
    return m;
  }, [players]);

  // A key that resolves to nobody is dropped rather than drawn: see `recent`.
  const recentRows = useMemo(
    () => recent.map((k) => byKey.get(k)).filter((p): p is SeasonPlayer => !!p),
    [recent, byKey],
  );

  /**
   * **The half of the answer this field cannot hold** — every prospect and
   * minor leaguer MLB has an id for, asked for by name.
   *
   * `players` is `/api/players`: the season's ~1,400 **major leaguers**, fetched
   * once at boot, which is what lets every keystroke above be a pass over an
   * array rather than a request. A prospect is not on it. He was reachable only
   * if somebody in the reader's own fantasy league happened to roster him
   * (`EspnOwnership.beyondMlb`, merged into `players` upstream), so typing
   * `Walker Jenkins` found the Twins' first-round outfielder in one league and
   * nobody at all in the next — and a reader with no league connected could not
   * reach a prospect by any route this app has.
   *
   * MLB publishes no *list* of that population, only a search over it, so this
   * is the one search in the app that costs a request. It runs on the pause
   * after a keystroke rather than on the keystroke, at `SEARCH_MIN` characters
   * or more, and the server answers it out of an hour-long cache.
   *
   * **The rows land under the ones already drawn and never over them.** They
   * arrive a few hundred milliseconds after the local matches and are appended,
   * so nothing on screen moves — which is `Reserve the box, don't move the
   * page` read for a list that grows downward: the row under the reader's
   * finger is the row that was under it before the answer came back.
   *
   * **Sequence-numbered, because a slow query must not land on a fast one.**
   * `q` is stored beside the rows and compared against what is typed *now*, so
   * an answer for `walke` cannot be drawn under `walker jenk` even for a frame.
   */
  const [remote, setRemote] = useState<{ q: string; players: SeasonPlayer[] }>({
    q: '',
    players: [],
  });
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    const q = query.trim().replace(/\s+/g, ' ');
    if (q.length < SEARCH_MIN) {
      // Not "no answer yet" — there is no question. The mark comes down with
      // it, or a backspace to two letters leaves the field looking busy
      // forever.
      setSearching(false);
      setRemote({ q: '', players: [] });
      return;
    }
    // Marked before the timer rather than inside it, so the wait covers the
    // pause as well as the request — the reader has stopped typing and the
    // field owes an answer from that moment. The mark is cleared in an
    // unconditional `finally` and never in this effect's cleanup, which is the
    // rule a StrictMode remount is what tests.
    setSearching(true);
    const seq = ++searchSeq.current;
    const t = setTimeout(() => {
      api
        .searchPlayers(q)
        .then((r) => {
          if (seq === searchSeq.current) setRemote({ q, players: r.players });
        })
        .catch(() => {
          // A dead MLB search costs the prospects and nothing else: the men
          // this field already knows are still typed, found and pressable, and
          // a banner for half of a working control would be the louder error.
          if (seq === searchSeq.current) setRemote({ q, players: [] });
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE);
    return () => clearTimeout(t);
  }, [query]);

  /**
   * Those rows, minus anybody the list above already answered for.
   *
   * The server drops the season list's own players before it replies, so the
   * only overlap left is the league's rostered prospects — merged into
   * `players` upstream and therefore already drawn. `byKey` is the whole of
   * what this field knows, so one lookup settles it; `watchedKeys` then applies
   * the same rule the local matches do, a player already on the roster having
   * nothing left for the ＋ to do.
   *
   * **Drawn only while the answer is about what is typed now.** `remote.q` is
   * the query it was asked for, so a stale set simply is not rendered rather
   * than being cleared on every keystroke — which is what keeps the rows
   * standing while a *longer* query is in flight.
   */
  const extra = useMemo(() => {
    const q = query.trim().replace(/\s+/g, ' ');
    if (!q || remote.q !== q) return [];
    const room = MENU_ROWS - matches.length;
    if (room <= 0) return [];
    return remote.players
      .filter((p) => {
        const key = playerKey(p);
        return !byKey.has(key) && !watchedKeys.has(key);
      })
      .slice(0, room);
  }, [query, remote, byKey, watchedKeys, matches]);

  /** The wait, on the app's own 250ms delay so a warm answer never flashes one.
   *  It is drawn **only where the menu would otherwise be empty** — rule 1, a
   *  read over rows is a quiet read, and the rows here are the local matches
   *  that are already on screen. */
  const waiting = useDelayedFlag(searching);

  const select = (p: SeasonPlayer) => {
    onPick?.(playerKey(p));
    onAdd({ id: p.id, savantName: p.savantName, name: p.name, kind: p.kind });
    setQuery('');
  };

  const openDetails = (p: SeasonPlayer) => {
    onPick?.(playerKey(p));
    onOpenDetails(playerKey(p));
    setQuery('');
    onClose?.();
  };

  const openTeam = (t: TeamInfo) => {
    onOpenTeam?.(t.id);
    setQuery('');
    onClose?.();
  };

  /**
   * A club's row, in the player row's own shape: the name where a name goes and
   * the club's context line under it, which for a club is what it is — its
   * abbreviation, the three characters every table in the app calls it by.
   *
   * The cap mark leads it, because that is what distinguishes a club row from a
   * player's at a glance and it is the same mark the board's rows carry. There
   * is no ＋: a club joins no roster.
   */
  const teamRow = (t: TeamInfo) => (
    <li key={`team-${t.id}`} className="adder-row">
      <button
        className="adder-option adder-team"
        onMouseDown={() => openTeam(t)}
        title={`View ${t.name}'s page`}
      >
        <TeamMark teamId={t.id} team={t.abbreviation} />
        <span className="adder-team-text">
          <span className="opt-name">{t.name}</span>
          <span className="opt-meta">{t.abbreviation}</span>
        </span>
      </button>
    </li>
  );

  /**
   * One row, drawn once and used by both lists — which is the whole of what
   * "pressing a recent player does exactly what picking him from a live result
   * does" means: they are the same row rather than two that resemble each
   * other, so the ＋ and the name cannot come to behave differently.
   *
   * The ＋ is dropped for a player already on the roster. A match can never be
   * one (`watchedKeys` filters the results, and is empty in fantasy mode where
   * there is no ＋ at all), but a **recent** row very well can: he is on the
   * list precisely because he was picked, and adding him is what the pick often
   * was. The row stays rather than disappearing, since it still has a job — it
   * opens his page — and only the button whose state it would misreport goes.
   */
  const row = (p: SeasonPlayer) => {
    const key = playerKey(p);
    return (
      <li key={key} className="adder-row">
        {/* Tapping the name opens the details view (works without adding);
            the ＋ button adds the player to the roster, and is absent in
            fantasy mode — see `canAdd`. `.adder-option` is `flex: 1`, so
            it takes the whole row back without a rule of its own. */}
        <button
          className="adder-option"
          onMouseDown={() => openDetails(p)}
          title={`View ${p.name}'s details`}
        >
          <span className="opt-name">{p.name}</span>
          <span className="opt-meta">
            {p.team}
            {p.position ? ` \u00b7 ${p.position}` : ''}
          </span>
        </button>
        {canAdd && !watchedKeys.has(key) && (
          <button
            className="adder-add"
            onMouseDown={() => select(p)}
            title={`Add ${p.name} to your roster`}
            aria-label={`Add ${p.name} to your roster`}
          >
            +
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="adder">
      <div className="adder-input-wrap">
        <input
          ref={inputRef}
          className="adder-input"
          placeholder={loading ? 'Reading the season roster' : 'Search for a player'}
          value={query}
          disabled={loading}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            // One Escape backs out of what you typed, a second closes the bar
            // — so a mistyped name doesn't cost you the whole search.
            if (query) setQuery('');
            else onClose?.();
          }}
        />
        {/* The field is disabled until the roster lands, so the ball takes the
            clear button's slot — nothing can be typed for it to clear, and a
            disabled box with a grayed placeholder is otherwise the one wait in
            the app that says nothing is happening. */}
        {loading && (
          <span className="adder-busy" role="status">
            <SpinningBaseball />
          </span>
        )}
        {query && (
          <button className="adder-clear" onClick={() => setQuery('')}>
            ✕
          </button>
        )}
      </div>
      {focused && (matches.length > 0 || teamMatches.length > 0 || extra.length > 0) && (
        <ul className="adder-menu">
          {/* The clubs first, under a head that says what they are — without one
              a `Milwaukee Brewers` row among a run of players reads as a player
              this app has got badly wrong. The players need no such head: they
              are what the field says it searches. */}
          {teamMatches.length > 0 && (
            <li className="adder-head" role="presentation">
              Teams
            </li>
          )}
          {teamMatches.map(teamRow)}
          {matches.map(row)}
          {/* **The men MLB lists and this app's own list does not**, under the
              ones it does and drawn as the same row — no head over them and no
              mark on them, because they are not a different kind of thing. A
              reader typing `Walker Jenkins` wants Walker Jenkins; that he is at
              St. Paul rather than at Target Field is the club on his meta line
              and the empty Stats tab on his page, not a category this menu has
              to teach him before it will hand him the name. See `extra`. */}
          {extra.map(row)}
        </ul>
      )}
      {/* Before a character is typed, the players most recently picked out of
          this very field. A search here is *completed* by choosing somebody, so
          what is worth offering back is the player rather than the letters that
          found him — a list of strings could only be retyped, where these rows
          are pressable and do the thing. The moment anything is typed the
          ordinary results replace them, `matches` being empty on an empty query
          so the two branches can never both be on screen. */}
      {focused && !query.trim() && recentRows.length > 0 && (
        <ul className="adder-menu" aria-label="Recent searches">
          <li className="adder-head" role="presentation">
            Recent searches
          </li>
          {recentRows.map(row)}
        </ul>
      )}
      {focused &&
        query.trim() &&
        matches.length === 0 &&
        teamMatches.length === 0 &&
        extra.length === 0 && (
          <ul className="adder-menu">
            {/* **The empty state must not be told before the search is over.**
                A prospect matches nothing locally by construction, so the one
                query this field asks MLB for is exactly the query that has no
                rows to sit under while it is out — and `No players or teams match
                "Walker Jenkins"` is a claim about the league, printed a fifth of
                a second before his row arrives to contradict it. So the wait
                stands in that slot instead, and it names what is being read.

                The ball carries the tense, hence no trailing ellipsis; the
                sentence names the population rather than the endpoint, that being
                what the reader is actually waiting on. */}
            {waiting ? (
              <li className="adder-none adder-searching" role="status">
                <SpinningBaseball />
                Reading every player MLB lists
              </li>
            ) : (
              /* **What it says it searched.** The sentence named players alone
                 while players were all it had; with clubs in the field too, a
                 reader who typed a club name and read "No players match" would be
                 told the search does not do the thing it had just failed to
                 do. */
              <li className="adder-none">
                No {onOpenTeam ? 'players or teams' : 'players'} match &ldquo;{query}&rdquo;.
              </li>
            )}
          </ul>
        )}
    </div>
  );
}
