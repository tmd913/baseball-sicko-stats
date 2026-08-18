import { useState } from 'react';
import type { ReactNode } from 'react';
import { handCell, teamColor, teamLogoUrl } from '../lib';
import { useHandedness } from '../hooks';
import type { PlayerKind } from '../types';

/**
 * A name over its club and positions — the identity block, in the one place
 * both tables that draw it can read it from.
 *
 * It started on the research board, where `Tm` and `Pos` were two columns of
 * their own and moving them under the name bought back ~110px of a row on the
 * app's widest table. The summary table wants the same thing for a different
 * reason: nothing on it said which club a man plays for or where his league
 * will let you start him, and the one column with slack to spare — the name's,
 * which absorbs the table's surplus at every width — was already carrying a
 * fact of exactly that kind.
 *
 * Shared rather than copied, on the rule `PhotoStatus` follows for the marks on
 * a headshot: two tables that merely resemble each other are two tables that
 * will one day differ, and the identity block is the thing a reader is meant to
 * recognise as *the same block* moving between two pages. Both boards are 58px
 * rows built from a 42px circle, so the sizing is shared too and there is no
 * per-caller class — where `PhotoStatus` needs one, because a row circle and a
 * 64px header portrait want the same mark at different sizes.
 */

/**
 * A club's cap logo, standing in for the abbreviation.
 *
 * **The abbreviation is not lost, it is moved off the pixel grid**: it is the
 * image's `alt` and its tooltip, it is what the research board's search still
 * matches on, and it is what shows outright when there is no logo to draw. A
 * player MLB files under no club at all — a leaderboard row for a man between
 * organisations — keeps the three letters, and so does one whose SVG fails to
 * load; that second case is why this holds a `failed` flag rather than trusting
 * the CDN, the same courtesy `OrderPhoto` extends to a headshot.
 */
export function TeamMark({ teamId, team }: { teamId: number | null; team: string }) {
  const [failed, setFailed] = useState(false);
  if (teamId === null || failed) {
    return <span className="row-id-team">{team || '—'}</span>;
  }
  return (
    <img
      className="row-id-logo"
      src={teamLogoUrl(teamId)}
      /* The club's own colour, inline rather than as a token for the reason the
         theme picker's swatches are: it is one of thirty values keyed by club,
         not one value the page has. See `teamColor`, which is also where the
         `on-dark` cut's need for a dark ground is argued. */
      style={{ background: teamColor(teamId) }}
      alt={team}
      title={team}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The block itself: whatever the caller draws as the name line, over the club
 * mark and the position list.
 *
 * The name line is a `children` rather than a `name` string because the two
 * callers hang different things off it and both belong on that line: the
 * research board trails a name with the roster baseball and the watchlist star,
 * where the summary table leads it with the fantasy slot chip. What is shared
 * is the column, the sub-line and the fact that neither of them wraps.
 */
export function PlayerIdentity({
  teamId,
  team,
  pos,
  playerId,
  kind,
  children,
}: {
  teamId: number | null;
  team: string;
  /** The text and tooltip `lib.ts::positionCell` computed. */
  pos: { text: string; title: string };
  /** Whose handedness to look up, and which half of him to say — see below. */
  playerId: number;
  kind: PlayerKind;
  children: ReactNode;
}) {
  /* **Read here rather than passed in**, which is where this parts from `pos`.
     That one is a prop because the three callers genuinely disagree about it —
     different sources, different fallbacks, different tooltips — where this is
     the same lookup and the same rule for all of them, so a prop would be three
     copies of one line waiting to drift. It also has to be read here to work at
     all on the research board, whose rows are drawn inside a `map` where no
     hook can be called; that is why the board takes eligibility as a prop, and
     it is why a context read from inside the block is the one shape that serves
     every caller. Null until the boot request lands, and for a man MLB lists
     neither hand for — both draw nothing. */
  const hand = handCell(kind, useHandedness(playerId));
  return (
    <div className="row-id">
      <div className="row-id-name">{children}</div>
      <div className="row-id-sub">
        <TeamMark teamId={teamId} team={team} />
        <span className="row-id-pos" title={pos.title}>
          {pos.text}
        </span>
        {/* **Last on the line, and it never gives way.** The order is club →
            where he plays → which way he does it, which reads outward from the
            cap; and it leaves the pair that was here before this exactly where
            it was. The position list is the one thing on this line allowed to
            ellipsize, so the hand is `flex: none` behind it: on a row narrow
            enough to truncate `1B/2B/3B/SS/OF` the three characters that say
            he is a lefty survive, which is the right way round — a truncated
            list still reads as a list, where half a hand reads as nothing. */}
        {hand && (
          <span className="row-id-hand" title={hand.title}>
            {hand.text}
          </span>
        )}
      </div>
    </div>
  );
}
