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
} from '../types';
import { eligibleForKind, headshotUrl, positionCell } from '../lib';
import { LoadingBlock } from './Loading';
import { PlayerIdentity } from './PlayerIdentity';
import { TeamLogo } from './LeagueView';

const PAGE_SIZE = 25;

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
 *  nothing. */
function moveLabel(p: EspnTransactionPlayer): string {
  if (p.via === 'trade') return 'Traded';
  if (p.move === 'drop') return 'Dropped';
  return p.via === 'waiver' ? 'Claimed' : 'Added';
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

/** The headshot, with the initials fallback `OrderPhoto` already extends to one:
 *  a handful of ids have no image on file, and a broken frame in a list of
 *  thirty rows is louder than the picture it fails to be. */
function TxPhoto({ id, name }: { id: number | null; name: string }) {
  const [failed, setFailed] = useState(false);
  // A player the join could not place has no id to draw a face from, and the
  // slot is held rather than dropped: it is what keeps every name in the list
  // starting at one x, which is the whole reason the move word is a fixed width
  // two elements to its left.
  if (id == null || failed) {
    const initials = name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('');
    return (
      <span className="lg-tx-photo lg-tx-photo-empty" aria-hidden="true">
        {initials}
      </span>
    );
  }
  return (
    <img
      className="lg-tx-photo"
      src={headshotUrl(id)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * One player in one transaction: what happened to him, who he is, and how
 * widely he is rostered.
 *
 * **Three of the four facts are on the row and the fourth is a tooltip**, which
 * is a judgement about what a *feed* is for rather than a shortage of room. A
 * reader here is scanning events, so what earns a place is what changes whether
 * this event matters to them:
 *
 * - **The headshot** — recognition, and the app's own way of naming a player
 *   everywhere else. It is a plain image rather than a second link: the name is
 *   8px away and is the press, and a 32px target beside it would only be a
 *   smaller version of the same one, at the cost of a tab stop on every one of
 *   up to nine players in a trade.
 * - **The positions** — the single most actionable thing a waiver feed can say
 *   (*somebody just dropped a shortstop*), and ESPN's own eligibility wherever a
 *   league is connected, which on this page it always is.
 * - **The roster %** — how big a deal the move is. A 78%-rostered player being
 *   dropped is news and a 2% one is noise, and it is four characters,
 *   right-aligned so it stays out of the scan path down the names.
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
  eligibility,
  onOpenPlayer,
}: {
  player: EspnTransactionPlayer;
  teams: Map<number, EspnStandingsTeam>;
  facts: Map<number, MlbFacts>;
  rosterPct: Map<number, number> | null;
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
      {player.bid != null && player.bid > 0 && (
        <span className="lg-tx-bid" title="ESPN's own waiver bid">
          ${player.bid}
        </span>
      )}
    </>
  );

  return (
    <li className={`lg-tx-player lg-tx-${player.move}`}>
      <span className={`lg-tx-move lg-tx-move-${player.move}`}>{moveLabel(player)}</span>
      <TxPhoto id={player.mlbId} name={player.name} />
      {player.mlbId == null ? (
        // Nothing joined, so there is no club and no eligibility: the row keeps
        // what it has rather than drawing an identity block of two em dashes.
        <span className="lg-tx-bare">{name}</span>
      ) : (
        <PlayerIdentity teamId={player.mlbTeamId} team={player.team ?? ''} pos={pos}>
          {name}
        </PlayerIdentity>
      )}
      {pct != null && (
        <span
          className="lg-tx-pct"
          title={`Rostered in ${pct.toFixed(1)}% of all ESPN leagues`}
        >
          {pct.toFixed(1)}%
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
  eligibility,
  onOpenPlayer,
}: {
  tx: EspnTransaction;
  teams: Map<number, EspnStandingsTeam>;
  myTeamId: number | null;
  now: number;
  facts: Map<number, MlbFacts>;
  rosterPct: Map<number, number> | null;
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
        {tx.players.map((p, i) => (
          <PlayerLine
            key={`${p.espnId}-${i}`}
            player={p}
            teams={teams}
            facts={facts}
            rosterPct={rosterPct}
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
