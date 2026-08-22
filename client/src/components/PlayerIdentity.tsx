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
 * recognize as *the same block* moving between two pages. Both boards are 58px
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
 * organizations — keeps the three letters, and so does one whose SVG fails to
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
      /* The club's own color, inline rather than as a token for the reason the
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

/**
 * **The same block, for a club.**
 *
 * The research board's team reading puts thirty clubs where six hundred players
 * were, and the identity column has to answer the same question of a row that
 * is not a person: who is this, and in what context do you read the numbers
 * beside it. So the block keeps its shape — a name line over a sub-line, in the
 * classes `PlayerIdentity` uses — and swaps what each holds.
 *
 * **The name line is the club's name**, where a player's is his. The cap mark
 * is *not* on the sub-line here, unlike the player block: on a team row it has
 * moved into the photo column, where the headshot was, and drawing it twice on
 * one row would be one fact competing with itself.
 *
 * **The sub-line is the club's record**, which is the position list's place —
 * and it is the honest thing to put there, because it is the one fact about a
 * club that stands to the numbers beside it the way a position list stands to a
 * player's. There is no handedness on it, a club having none.
 *
 * `.row-id-record` is folded onto `.row-id-pos` in the stylesheet for the slot's
 * typography rather than given rules that agree today, but it is its own class:
 * a record and a position list are two different objects, and only one of them
 * ellipsizes.
 */
export function TeamIdentity({
  record,
  children,
}: {
  /** Wins and losses over the span the row's numbers cover, or null where the
   *  standings could not be read — an em dash, as every other unreadable value
   *  on this board is, rather than a `0-0` that would claim a winless club. */
  record: { wins: number; losses: number } | null;
  children: ReactNode;
}) {
  return (
    <div className="row-id">
      <div className="row-id-name">{children}</div>
      <div className="row-id-sub">
        <span
          className="row-id-record"
          title={record ? `${record.wins}-${record.losses} over the span on screen` : undefined}
        >
          {record ? `${record.wins}-${record.losses}` : '—'}
        </span>
      </div>
    </div>
  );
}

/**
 * The cap mark at headshot size — what a team row carries where a player row
 * carries a face.
 *
 * **It is a button wherever there is a page behind it**, which there now is.
 * This note used to read the other way round — "an image rather than a button
 * because there is nothing behind it: the page a headshot opens is a page about
 * a person, and this app has no club page" — and every word of it was right
 * about the app it was written in. What changed is the premise: a club has a
 * page, so the mark that names a club opens it, exactly as a headshot opens the
 * man it draws.
 *
 * The old rule survives as the fallback: **with no `onOpen`, it is still a
 * plain `<span>`**, because "a row that looks pressable and is not is worse
 * than one that plainly is not" is true whatever is on the other side. A caller
 * with nowhere to send the reader passes nothing and gets the inert cell back.
 */
export function TeamPhoto({
  teamId,
  team,
  onOpen,
}: {
  teamId: number | null;
  team: string;
  /** Open this club's page. Absent where the caller has none to open — see
   *  above; and it takes the id it was given, so a row filed under no club is
   *  inert by construction rather than by a second test. */
  onOpen?: (teamId: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  /* The wrapper is a `<button>` when it does something and a `<span>` when it
     does not — the *same box* either way, which is what keeps the image cell
     one cell across both readings rather than two that measure alike today.
     `line-height: 0` on it is what keeps the image out of the cell's inline
     flow (in it, the reserved descender took every club row to 60px against the
     board's 58), and it comes off the shared class rather than off the tag. */
  const Box = teamId !== null && onOpen ? 'button' : 'span';
  const press =
    teamId !== null && onOpen
      ? { type: 'button' as const, onClick: () => onOpen(teamId), title: `${team} — the club’s page` }
      : {};
  return (
    <Box
      {...press}
      className={`sum-photo-wrap${teamId !== null && onOpen ? '' : ' sum-photo-wrap-static'}`}
    >
      {teamId === null || failed ? (
        <span className="sum-photo sum-photo-team sum-photo-team-none" title={team}>
          {team || '—'}
        </span>
      ) : (
        <img
          className="sum-photo sum-photo-team"
          src={teamLogoUrl(teamId)}
          /* The club's own color, for the reason `TeamMark` gives: thirteen of
             the thirty `on-dark` cuts are drawn in white alone and would be
             invisible on a light theme's page. */
          style={{ background: teamColor(teamId) }}
          alt={team}
          title={team}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </Box>
  );
}
