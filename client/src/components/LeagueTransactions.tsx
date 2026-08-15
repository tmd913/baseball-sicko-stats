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
 */
import { useState } from 'react';
import type { EspnStandingsTeam, EspnTransaction, EspnTransactionPlayer, EspnTransactions } from '../types';
import { LoadingBlock } from './Loading';
import { TeamLogo } from './LeagueView';

const PAGE_SIZE = 25;

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

function TransactionRow({
  tx,
  teams,
  myTeamId,
  now,
  onOpenPlayer,
}: {
  tx: EspnTransaction;
  teams: Map<number, EspnStandingsTeam>;
  myTeamId: number | null;
  now: number;
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
          <li key={`${p.espnId}-${i}`} className={`lg-tx-player lg-tx-${p.move}`}>
            <span className={`lg-tx-move lg-tx-move-${p.move}`}>{moveLabel(p)}</span>
            <PlayerName player={p} onOpenPlayer={onOpenPlayer} />
            {/* A trade's direction belongs on the player rather than on the
                header: which way *he* went is the fact, and in a five-player
                trade the two teams' names above say nothing about any one of
                them. */}
            {p.via === 'trade' && p.toTeamId != null && (
              <span className="lg-tx-to">
                to {teams.get(p.toTeamId)?.name ?? `Team ${p.toTeamId}`}
              </span>
            )}
            {p.bid != null && p.bid > 0 && (
              <span className="lg-tx-bid" title="ESPN's own waiver bid">
                ${p.bid}
              </span>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function LeagueTransactions({
  data,
  loading,
  error,
  onOpenPlayer,
}: {
  data: EspnTransactions | null;
  loading: boolean;
  error: string | null;
  onOpenPlayer: (mlbId: number) => void;
}) {
  const [shown, setShown] = useState(PAGE_SIZE);

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
            onOpenPlayer={onOpenPlayer}
          />
        ))}
      </ul>
      {rest > 0 && (
        <button type="button" className="load-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Load more · {rest} older
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
