import { InfoKey } from './InfoKey';
import { SpinningBaseball } from './Loading';

/**
 * **The two pieces every projection in the app shares** — the mark on its
 * toggle and the key that explains the method.
 *
 * They are here rather than in either caller because there are two callers now
 * and neither owns the idea: the League page projects a *matchup* and the Roster
 * view projects a *player*, and both are the same engine
 * (`server/src/projection.ts`) asked a different question. Two copies of a glyph
 * would be two marks for one concept, and two copies of the key would be two
 * accounts of one method — free to drift the next time the engine moves, with
 * nothing on screen to say which of them was stale.
 */

/** A rising line, which is what a projection is. `flex: none` for the reason
 *  every glyph on a control in this app carries it. */
export function ProjectedGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

/**
 * **How the projection works**, in a manager's words rather than the engine's.
 *
 * Four paragraphs, and they are the four questions somebody actually asks of a
 * projection: what is it made of, what does it take account of, what adjusts it,
 * and — the one a projection most owes its reader — **what does it not know**.
 * Every figure it names is a measured constant from the engine (the 40% cap on
 * the recent month, the league's own ~5% platoon edge, the 20% clamp on any one
 * adjustment) and not one is named as a constant.
 *
 * **How many days are left comes off the projection itself** rather than from a
 * count of its own, so the sentence cannot come to disagree with the figures it
 * introduces.
 *
 * `categories` is the League page's half and is absent on the Roster view: there
 * the figures are a player's line rather than a side's score in the league's own
 * categories, so a sentence about them would be a sentence about nothing.
 */
export function ProjectionKey({
  days,
  categories,
  className,
  drop,
}: {
  days: number;
  categories?: number;
  className?: string;
  /** Which way the panel opens — `up` where the caller has put the control near
   *  the foot of a long page, and the caller's own CSS anchors it to match. */
  drop?: 'up' | 'down';
}) {
  const over =
    days > 0 ? `over the ${days} ${days === 1 ? 'day' : 'days'} left` : 'over the days left';
  return (
    <InfoKey label="How the projection works" className={className} drop={drop}>
      {categories != null ? (
        <p>
          <b>Every figure is what the team has already scored</b> plus what its players should
          add {over} in the week. All {categories} categories are worked out separately, and the
          record beside the team names is those {categories} compared.
        </p>
      ) : (
        <p>
          <b>Every figure is what he has already done over the days in view</b> plus what he
          should add {over} to play. A day that has been played is his real line; a day still to
          come is the estimate below.
        </p>
      )}
      <p>
        <b>A player's rate is his season, pulled toward his last 30 days</b> — recent form counts
        for at most 40% of it, and less if he has hardly played lately. That rate is then applied
        to the chances he has left: for a hitter, his club's remaining games and how often he is
        in the lineup for one; for a starter, the turns he is due; for a reliever, his usual
        workload. <b>Anybody on the injured list is projected at nothing</b>, and a stretch he
        spent there is left out of how often he plays rather than counted against him.
      </p>
      <p>
        <b>Each figure is then adjusted for the opposition.</b> A hitter moves with the pitcher
        he is likely to face and with the handedness matchup, which is worth about 5% across the
        league; a pitcher moves with how that club has been hitting against his throwing arm. No
        one adjustment changes a figure by more than 20%.
      </p>
      <p>
        <b>What it cannot know is what happens next.</b> A game already under way counts as it
        stands, nobody is projected into a game his club has not got, and nobody is projected
        back off the injured list however close a return looks. This is one likely outcome
        rather than a probability, so a figure it puts within a run or two of another is not one
        to count on.
      </p>
    </InfoKey>
  );
}

/**
 * **The Roster view's `Projected` toggle** — the plain switch, where the League
 * page's is a button and its key as one row (`ProjectedTools` there).
 *
 * The glyph is the shared one above, so the two say the same thing with the
 * same mark. It is folded onto `.research-toggle` in the class list rather than
 * styled anew, which makes it the same object as `Starters` and `Schedule`
 * beside it by construction; a plain switch with no panel of its own, so it
 * takes `.on` and never `.active`.
 */
export function ProjectedToggle({
  on,
  loading,
  onToggle,
  title,
}: {
  on: boolean;
  /** The projection is being read. **Nothing blanks while it is** — the table
   *  goes on drawing what it has until the answer lands, which is rule 1 of the
   *  app's loading system, so the only mark a press leaves is here inside the
   *  control that started it. */
  loading?: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`projected-toggle${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
      title={title}
    >
      {loading ? <SpinningBaseball size="sm" /> : <ProjectedGlyph size={19} />}
      {/* Visually hidden under 640px with the rest of this run, so the button
          still names itself to a screen reader rather than being a lone glyph. */}
      <span className="projected-toggle-label">Projected</span>
    </button>
  );
}
