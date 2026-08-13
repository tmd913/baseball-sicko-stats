import { useState } from 'react';
import type { ReactNode } from 'react';
import { teamLogoUrl } from '../lib';

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
  children,
}: {
  teamId: number | null;
  team: string;
  /** The text and tooltip `lib.ts::positionCell` computed. */
  pos: { text: string; title: string };
  children: ReactNode;
}) {
  return (
    <div className="row-id">
      <div className="row-id-name">{children}</div>
      <div className="row-id-sub">
        <TeamMark teamId={teamId} team={team} />
        <span className="row-id-pos" title={pos.title}>
          {pos.text}
        </span>
      </div>
    </div>
  );
}
