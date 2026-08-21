/**
 * The League page's **Transactions** tab — who added, dropped and traded whom,
 * most recent first.
 *
 * **It is a feed, which is why it is neither of the two tabs beside it.** The
 * Scoreboard is one period and the Rankings are one span; this is a stream with
 * no period on it at all, read from the top and paged the way the app's other
 * two streams are (`PAGE_SIZE` 25, the same idiom the Feed and the Game Log
 * use).
 *
 * **A row is one transaction and its players are what moved in it**, which is
 * ESPN's own shape rather than one imposed here: a pickup and the drop that
 * paid for it are one act by one manager and arrive as one topic, and a trade
 * is one topic carrying three to nine players. Drawing them as separate rows
 * would have read as five things happening where one did.
 *
 * **Every name opens the player page**, on the app's one route into it, wherever
 * the name-and-club join found exactly one major leaguer. Where it didn't the
 * name is plain text — `matchMlbPlayer`'s standing rule rather than a new one:
 * an ambiguity neither name nor club resolves is left unmatched rather than
 * guessed, and the row still says what happened.
 *
 * **A player row says who he is, not only that he moved**: his headshot, his
 * club and where his league will let him start him, plus how widely he is
 * rostered. Which of those four earn a place, and where, is argued at
 * `PlayerLine` below.
 */
import { useMemo, useState } from 'react';
import type {
  EspnStandingsTeam,
  EspnTransaction,
  EspnTransactionPlayer,
  EspnTransactions,
  PlayerKind,
  SeasonPlayer,
  TrendWindow,
} from '../types';
import { eligibleForKind, headshotUrl, positionCell } from '../lib';
import { LoadingBlock } from './Loading';
import { PlayerIdentity } from './PlayerIdentity';
import { TeamLogo } from './LeagueView';

const PAGE_SIZE = 25;

/**
 * One entry per span the ownership read found a baseline for, keyed by window.
 * `App` holds it for the research board and the player page; this tab is the
 * third reader and takes the raw deltas because it asks after one player at a
 * time rather than merging a column onto every row.
 */
export type TrendDeltas = readonly {
  window: TrendWindow;
  days: number;
  /** Absent is flat, `null` is withheld — see `RosterTrendWindow.delta` in
   *  `types.ts`, whose three-way reading this map carries unchanged. */
  delta: Map<number, number | null>;
}[];

/**
 * **The three spans a row draws, of the five the server can send.**
 *
 * The board offers 1, 3, 7, 15 and 30 and defaults four of them off, on the
 * argument that five near-identical signed columns at the front of the app's
 * widest table is a resolution nobody asked for. A feed is the opposite case:
 * every row here is *dated*, so how a player's ownership moved **since then**
 * is the reading, and the three short spans are the ones a move a week old can
 * still be read against. 15 and 30 would be a fortnight and a month of drift
 * over a transaction from Tuesday.
 *
 * A window with no baseline is simply absent from the response, so a young
 * install draws whichever of the three it has and no empty columns.
 */
const TREND_SPANS: readonly TrendWindow[] = [1, 3, 7];

/**
 * **Added players lead, whatever order ESPN sent them in.**
 *
 * A pickup and the drop that paid for it arrive as one topic, and the order
 * inside it is arbitrary: measured over the live league's 250 most recent
 * moves, **79 of the 149 two-player transactions arrive drop-first and 70
 * add-first**. So half the feed read backwards — the man who left above the man
 * who arrived — for no reason a reader could see. The add is the news (it is
 * what the manager went and did; the drop is what it cost), so it leads.
 *
 * `sort` is **stable** by specification, which is what makes this safe on a
 * trade: every player in one is an `add` (ESPN's message type 244 files them
 * that way, each to the team receiving him), so the comparator is flat across
 * all nine and the order ESPN sent — which pairs the two halves of the deal —
 * survives untouched.
 */
function addsFirst(players: EspnTransactionPlayer[]): EspnTransactionPlayer[] {
  return [...players].sort((a, b) => (a.move === 'drop' ? 1 : 0) - (b.move === 'drop' ? 1 : 0));
}

/** What the season roster knows about a transacted player: which board he is on
 *  and MLB's own word for where he plays. Both are only ever the *fallback* for
 *  the position cell — a connected league answers with ESPN's eligibility — but
 *  the kind is what narrows that list to the half this player speaks. */
interface MlbFacts {
  kind: PlayerKind;
  position: string | null;
}

/**
 * `Today · 9:43 AM`, `Yesterday · 7:21 PM`, `Aug 11 · 12:14 PM`.
 *
 * A transaction is an *instant* and is printed at that resolution — the same
 * split the player page's News tab makes between an article and a dated
 * transaction, from the other side: what the reader wants from this list is how
 * long ago, and for anything inside two days the day's name says it faster than
 * its date does.
 */
function stamp(ms: number, now: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const dayOf = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const today = new Date(now);
  const yesterday = new Date(now - 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (dayOf(d) === dayOf(today)) return `Today · ${time}`;
  if (dayOf(d) === dayOf(yesterday)) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`;
}

/** The word for the move, in the manager's own vocabulary rather than ESPN's
 *  message-type numbering. A waiver claim is worth telling from a free pickup:
 *  one cost him a bid and his place in the order and the other cost him
 *  nothing.
 *
 *  Exported because the matchup page's Moves section names the same four moves
 *  and must name them the same way — one vocabulary rather than two lists of
 *  words that will one day disagree about what a claim is called. */
export function moveLabel(p: EspnTransactionPlayer): string {
  if (p.via === 'trade') return 'Traded';
  if (p.move === 'drop') return 'Dropped';
  return p.via === 'waiver' ? 'Claimed' : 'Added';
}

/** The color for the move, **keyed exactly as `moveLabel` keys the word** —
 *  same four cases, same order, same tests. That is the point of writing it as
 *  a twin rather than folding the color into the label function: the mark says
 *  one thing in two registers, and a reader who learns that purple is a trade
 *  has learned what the `title` would have told them.
 *
 *  The four are the app's own play palette, borrowed for their *feel* rather
 *  than their play meaning: `--hit` for a man arriving off the pool for
 *  nothing, `--hr` for one who cost a bid and a place in the waiver order,
 *  `--strikeout` for one leaving, and `--live-purple` — the on-base purple —
 *  for either side of a trade, which is the one move that is neither an
 *  arrival off the pool nor a departure to it.
 *
 *  **A trade is purple on both sides**, and that is deliberate: `move` says
 *  which way *this* row went and the row's own `to <Team>` says where, so the
 *  color is free to say the thing neither of them does — that this was a deal
 *  between two managers rather than a move against the pool. */
export function moveTone(p: EspnTransactionPlayer): 'traded' | 'dropped' | 'claimed' | 'added' {
  if (p.via === 'trade') return 'traded';
  if (p.move === 'drop') return 'dropped';
  return p.via === 'waiver' ? 'claimed' : 'added';
}

function PlayerName({
  player,
  onOpenPlayer,
}: {
  player: EspnTransactionPlayer;
  onOpenPlayer: (mlbId: number) => void;
}) {
  if (player.mlbId == null) {
    return (
      <span
        className="lg-tx-name lg-tx-name-plain"
        title={`${player.name} — no major leaguer this season matches that name and club, so there is no page to open.`}
      >
        {player.name}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="lg-tx-name"
      onClick={() => onOpenPlayer(player.mlbId as number)}
      title={`Open ${player.name}'s page`}
    >
      {player.name}
    </button>
  );
}

/**
 * The headshot, with the initials fallback `OrderPhoto` already extends to one:
 * a handful of ids have no image on file, and a broken frame in a list of
 * thirty rows is louder than the picture it fails to be.
 *
 * **It opens his page, which reverses what stood here.** The argument was that
 * "the name is 8px away and is the press, so a 32px target beside it would only
 * be a smaller version of the same one, at the cost of a tab stop on every one
 * of up to nine players in a trade". The first half of that is true of every
 * table in the app and is not how any of them is built: the summary table's
 * `PhotoCell`, the research board's and the feed's `FeedHeadshot` all wrap the
 * circle in its own button beside a name that opens the same page, because a
 * face is the thing a reader aims at when scanning a list of people. A row that
 * looks like every other row in the app and is the one that does not answer a
 * press is worse than a duplicated target.
 *
 * The tab-stop cost is real and is what it is everywhere else: `aria-label`
 * names it the way `sum-photo-wrap` and `feed-photo-link` name theirs, so a
 * screen reader hears two routes to one page rather than an unnamed control.
 *
 * A player the join could not place stays a plain mark, which is `PlayerName`'s
 * own rule one element to the right: there is no page to open, so there is
 * nothing to press.
 */
function TxPhoto({
  id,
  name,
  onOpenPlayer,
}: {
  id: number | null;
  name: string;
  onOpenPlayer: (mlbId: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  // The slot is held rather than dropped for a player with no id and for one
  // whose image is missing: it is what keeps every name in the list starting at
  // one x, which is the whole reason the move word is a fixed width two
  // elements to its left.
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  const face =
    id == null || failed ? (
      <span className="lg-tx-photo lg-tx-photo-empty" aria-hidden="true">
        {initials}
      </span>
    ) : (
      <img
        className="lg-tx-photo"
        src={headshotUrl(id)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  if (id == null) return face;
  return (
    <button
      type="button"
      className="lg-tx-photo-link"
      title={`Open ${name}'s page`}
      aria-label={`Open ${name}'s page`}
      onClick={() => onOpenPlayer(id)}
    >
      {face}
    </button>
  );
}

/**
 * One player in one transaction: what happened to him, who he is, and how
 * widely he is rostered.
 *
 * **Three of the four facts are on the row and the fourth is a tooltip**, which
 * is a judgment about what a *feed* is for rather than a shortage of room. A
 * reader here is scanning events, so what earns a place is what changes whether
 * this event matters to them:
 *
 * - **The headshot** — recognition, and the app's own way of naming a player
 *   everywhere else, which is why it **opens his page** as the circle does on
 *   the summary table, the research board and the feed. See `TxPhoto`, which is
 *   where that reverses the "plain image" this used to be and says why.
 * - **The positions** — the single most actionable thing a waiver feed can say
 *   (*somebody just dropped a shortstop*), and ESPN's own eligibility wherever a
 *   league is connected, which on this page it always is.
 * - **The roster %** — how big a deal the move is. A 78%-rostered player being
 *   dropped is news and a 2% one is noise. It is **labeled `Rostered`**, in
 *   `--faint` and lighter than the figure: a bare `78.4%` at the end of a row
 *   is a percentage of nothing in particular, and this page has no header row
 *   to say what its columns are the way the research board's `Ros%` does. The
 *   whole block stays right-aligned so it is out of the scan path down the
 *   names.
 * - **The club** is the cap logo alone, which is `PlayerIdentity`'s own
 *   sub-line: on a *fantasy* feed it is the least decision-relevant of the four,
 *   and at 15px of mark with the abbreviation on its tooltip it costs the row no
 *   text at all. Drawing it as `MIL` beside the positions would have been a
 *   third string on a line that already carries two.
 *
 * **What is deliberately absent is today's status** — the lineup pip and the
 * `IL10` code the two wide tables put on a headshot. Those come off
 * `/api/statuses`, which this page does not read, and they answer a question
 * about *this afternoon* where every row here is dated: a call-up's pip says
 * nothing about the trade that moved him three weeks ago.
 */
function PlayerLine({
  player,
  teams,
  facts,
  rosterPct,
  rosterTrend,
  eligibility,
  onOpenPlayer,
}: {
  player: EspnTransactionPlayer;
  teams: Map<number, EspnStandingsTeam>;
  facts: Map<number, MlbFacts>;
  rosterPct: Map<number, number> | null;
  rosterTrend: TrendDeltas | null;
  eligibility: Map<number, string[]> | null;
  onOpenPlayer: (mlbId: number) => void;
}) {
  const mlb = player.mlbId == null ? undefined : facts.get(player.mlbId);
  const pct = player.mlbId == null ? undefined : rosterPct?.get(player.mlbId);
  const kind: PlayerKind = mlb?.kind ?? 'batter';
  const espn = eligibleForKind(
    player.mlbId == null ? null : eligibility?.get(player.mlbId),
    kind,
  );
  // `lib.ts::positionCell` is the app's one definition of what a position is,
  // and its pitching *fallback* is `starter` — a fact about how a man has been
  // used, which a transaction does not carry. So where ESPN has said nothing the
  // kind is read as a batter's for that one branch, which routes a pitcher to
  // MLB's own word (`P`) rather than to a guess between SP and RP; where ESPN
  // *has* spoken, the real kind narrows his list, which is what stops a
  // mis-joined pitcher reading `2B/SS`.
  const pos = positionCell({
    eligible: espn,
    kind: espn ? kind : 'batter',
    position: mlb?.position ?? null,
    starter: false,
    starterSource: 'off his appearances this season',
    unknownTitle: (p) => `${p} — MLB's listed position`,
  });

  const name = (
    <>
      <PlayerName player={player} onOpenPlayer={onOpenPlayer} />
      {/* A trade's direction belongs on the player rather than on the header:
          which way *he* went is the fact, and in a five-player trade the two
          teams' names above say nothing about any one of them. */}
      {player.via === 'trade' && player.toTeamId != null && (
        <span className="lg-tx-to">
          to {teams.get(player.toTeamId)?.name ?? `Team ${player.toTeamId}`}
        </span>
      )}
    </>
  );

  // Absent from a delta map means "hasn't moved", not "unknown" — the server
  // drops zeroes to keep the blob small — so a player with a roster % and no
  // entry really is flat, and the 0.0 is filled back in here. An id stored as
  // an explicit `null` is the third answer, withheld, and is drawn as a dash;
  // `has` is what tells the two apart. Gated on the percentage itself: a move
  // with no figure to have moved is nothing to draw.
  const trends =
    pct == null || player.mlbId == null || !rosterTrend
      ? []
      : rosterTrend
          .filter((w) => TREND_SPANS.includes(w.window))
          .map((w) => ({
            window: w.window,
            days: w.days,
            change: w.delta.has(player.mlbId as number)
              ? w.delta.get(player.mlbId as number) ?? null
              : 0,
          }));

  return (
    <li className={`lg-tx-player lg-tx-${player.move}`}>
      {/* The mark is the direction and nothing else — the word itself stays,
          for the tooltip and for a screen reader. */}
      <span className={`lg-tx-move lg-tx-move-${moveTone(player)}`} title={moveLabel(player)}>
        <span aria-hidden="true">{player.move === 'drop' ? '−' : '+'}</span>
        <span className="sr-only">{moveLabel(player)}</span>
      </span>
      <TxPhoto id={player.mlbId} name={player.name} onOpenPlayer={onOpenPlayer} />
      {player.mlbId == null ? (
        // Nothing joined, so there is no club and no eligibility: the row keeps
        // what it has rather than drawing an identity block of two em dashes.
        <span className="lg-tx-bare">{name}</span>
      ) : (
        <PlayerIdentity
          teamId={player.mlbTeamId}
          team={player.team ?? ''}
          pos={pos}
          playerId={player.mlbId}
          kind={kind}
        >
          {name}
        </PlayerIdentity>
      )}
      {pct != null && (
        <span className="lg-tx-own">
          <span
            className="lg-tx-pct"
            title={`Rostered in ${pct.toFixed(1)}% of all ESPN leagues`}
          >
            {/* The word before the figure, not after it: it is the order the
                player page's own line already puts them in (`Rostered 63.4%`),
                and this page is one press from that one. `78.4% rostered` reads
                as the tail of a sentence where every other number on the row is
                a label and a value, and it would put the word — the part that
                is the same on every row — where the eye is scanning for the
                part that differs. */}
            <span className="lg-tx-pct-word">Rostered</span> {pct.toFixed(1)}%
          </span>
          {/* The move under the figure it moved, which is the shape the player
              page's own header already gives these — the span up front and the
              change behind it, so three of them read across rather than as
              three sentences. The classes are folded onto that header's, so the
              up/down vocabulary has one definition. */}
          {trends.length > 0 && (
            <span className="lg-tx-trends">
              {trends.map((t) => (
                <span
                  key={t.window}
                  className={`lg-tx-trend${
                    t.change === null ? '' : t.change > 0 ? ' up' : t.change < 0 ? ' down' : ''
                  }`}
                  title={
                    t.change === null
                      ? `No reading over ${t.days} day${t.days === 1 ? '' : 's'} — two ESPN players share this name, so the figure that far back is the other one's`
                      : `Rostered ${
                          t.change === 0
                            ? 'in the same share of leagues as'
                            : `${Math.abs(t.change).toFixed(1)} points ${
                                t.change > 0 ? 'more' : 'fewer'
                              } than`
                        } ${t.days} day${t.days === 1 ? '' : 's'} ago`
                  }
                >
                  <span className="lg-tx-trend-span">{t.days}d</span>
                  {t.change === null
                    ? '—'
                    : t.change === 0
                      ? '0.0'
                      : `${t.change > 0 ? '▲' : '▼'}${Math.abs(t.change).toFixed(1)}`}
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </li>
  );
}

function TransactionRow({
  tx,
  teams,
  myTeamId,
  now,
  facts,
  rosterPct,
  rosterTrend,
  eligibility,
  onOpenPlayer,
}: {
  tx: EspnTransaction;
  teams: Map<number, EspnStandingsTeam>;
  myTeamId: number | null;
  now: number;
  facts: Map<number, MlbFacts>;
  rosterPct: Map<number, number> | null;
  rosterTrend: TrendDeltas | null;
  eligibility: Map<number, string[]> | null;
  onOpenPlayer: (mlbId: number) => void;
}) {
  const mine = tx.teamIds.includes(myTeamId ?? -1);
  const named = tx.teamIds.map((id) => teams.get(id));

  return (
    <li className={`lg-tx${mine ? ' lg-tx-mine' : ''}`}>
      <div className="lg-tx-head">
        {/* The teams, with their logos — the same mark the scoreboard and the
            rankings table draw them by, so a manager is one object across the
            three tabs. A trade names both and joins them with an arrow that
            says nothing about direction, the per-player rows below carrying
            that. */}
        <span className="lg-tx-teams">
          {named.map((t, i) => (
            <span className="lg-tx-team" key={tx.teamIds[i]}>
              {i > 0 && <span className="lg-tx-swap" aria-hidden="true">⇄</span>}
              <TeamLogo team={t} />
              <span className="lg-tx-team-name">{t?.name ?? `Team ${tx.teamIds[i]}`}</span>
            </span>
          ))}
        </span>
        <span className="lg-tx-date">{stamp(tx.date, now)}</span>
      </div>
      <ul className="lg-tx-players">
        {addsFirst(tx.players).map((p, i) => (
          <PlayerLine
            key={`${p.espnId}-${i}`}
            player={p}
            teams={teams}
            facts={facts}
            rosterPct={rosterPct}
            rosterTrend={rosterTrend}
            eligibility={eligibility}
            onOpenPlayer={onOpenPlayer}
          />
        ))}
      </ul>
    </li>
  );
}

export default function LeagueTransactions({
  data,
  loading,
  error,
  players,
  rosterPct,
  rosterTrend,
  eligibility,
  onOpenPlayer,
}: {
  data: EspnTransactions | null;
  loading: boolean;
  error: string | null;
  /** The season roster the header search already holds — read for the *kind* a
   *  player is and MLB's own listed position, which are the two things the
   *  position cell falls back to where ESPN has said nothing. First entry wins,
   *  which is `App.tsx::openLeaguePlayer`'s own rule for a two-way player. */
  players: SeasonPlayer[];
  /** Both off the `/api/espn/ownership` response App already holds for the
   *  research board — no read of this tab's own, and null before it lands. */
  rosterPct: Map<number, number> | null;
  /** How each of those percentages has moved, one entry per span the read found
   *  a baseline for. Null without a league and until a second day of history
   *  exists — see `TREND_SPANS` for which of them a row draws. */
  rosterTrend: TrendDeltas | null;
  eligibility: Map<number, string[]> | null;
  onOpenPlayer: (mlbId: number) => void;
}) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const facts = useMemo(() => {
    const map = new Map<number, MlbFacts>();
    for (const p of players) {
      if (!map.has(p.id)) map.set(p.id, { kind: p.kind, position: p.position });
    }
    return map;
  }, [players]);

  if (error && !data) {
    return (
      <div className="empty-state">
        <h3>Couldn't read your league</h3>
        <p>{error}</p>
      </div>
    );
  }

  // Never over data, and the block wait only for a pane with nothing in it yet.
  if (!data) {
    return loading ? <LoadingBlock>Reading your league's transactions</LoadingBlock> : null;
  }

  if (data.transactions.length === 0) {
    return (
      <div className="empty-state">
        <h3>No moves in this league yet</h3>
        <p>
          ESPN's activity feed has nothing in it — nobody has added, dropped or traded a player
          since the draft.
        </p>
      </div>
    );
  }

  const teams = new Map(data.teams.map((t) => [t.id, t]));
  const now = Date.now();
  const rest = data.transactions.length - shown;

  return (
    <div className="lg-transactions">
      <ul className="lg-tx-list">
        {data.transactions.slice(0, shown).map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            teams={teams}
            myTeamId={data.myTeamId}
            now={now}
            facts={facts}
            rosterPct={rosterPct}
            rosterTrend={rosterTrend}
            eligibility={eligibility}
            onOpenPlayer={onOpenPlayer}
          />
        ))}
      </ul>
      {rest > 0 && (
        // The app has one Load-more button and this is it: `.lg-tx-more` is
        // folded onto the feed's own rule rather than restyled to resemble it,
        // count badge and all. It had been an unstyled `.load-more`, which no
        // rule in the stylesheet answered — a bare browser button at the foot of
        // the one tab that is a stream.
        <button type="button" className="lg-tx-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Load more
          <span className="lg-tx-more-count">{rest}</span>
        </button>
      )}
      {/* What the list *is*, said when it is at the server's own limit rather
          than implied. A complete record it isn't, and a reader scrolling to
          the bottom of a season deserves to know that rather than to conclude
          the league was quiet in April. */}
      {rest <= 0 && data.capped && (
        <p className="lg-tx-cap">
          The {data.transactions.length} most recent moves. ESPN's activity feed goes back
          further than this page reads it.
        </p>
      )}
    </div>
  );
}
