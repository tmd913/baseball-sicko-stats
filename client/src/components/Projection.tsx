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
export function ProjectionKey(props: {
  days: number;
  categories?: number;
  /**
   * **The research board's reading, which is the one of the three that is
   * *only* a projection.** See `ProjectionNote`, which carries the argument.
   */
  board?: boolean;
  className?: string;
  /** Which way the panel opens — `up` where the caller has put the control near
   *  the foot of a long page, and the caller's own CSS anchors it to match. */
  drop?: 'up' | 'down';
}) {
  return (
    <InfoKey label="How the projection works" className={props.className} drop={props.drop}>
      <ProjectionNote {...props} />
    </InfoKey>
  );
}

/**
 * **The sentences themselves, without the ⓘ around them.**
 *
 * Split out because a fourth caller cannot use the popover at all: the research
 * board's panels are drawn in `.research-head`, which is `overflow: hidden` —
 * a sticky box in a pane that scrolls sideways must not slide with it — so an
 * absolutely-positioned panel opened from inside it is clipped to the head.
 * Measured there: a 320px key painting as a 46px sliver. That board renders
 * this in flow instead, as an accordion inside the lens's own span panel, which
 * is what every other panel that head holds already is.
 *
 * Split rather than copied, the rule this codebase keeps everywhere: four
 * surfaces explaining one engine in four sets of words is four sets that will
 * one day disagree about what the engine does.
 */
export function ProjectionNote({
  days,
  categories,
  board,
}: {
  days: number;
  categories?: number;
  board?: boolean;
}) {
  const over =
    days > 0 ? `over the ${days} ${days === 1 ? 'day' : 'days'} left` : 'over the days left';
  return (
    <>
      {board ? (
        <p>
          <b>Every figure here is an estimate</b> — what he is expected to do {over} to play,
          and nothing he has already done. Days that have been played are not projected at all,
          which is why the season and window tabs are off while this is on: the measured board
          is one press of this button away. <b>Games</b> is how many he appears in over those
          days — the ones he bats in, or for a pitcher his outings, a start and a relief
          appearance alike. <b>A reliever&rsquo;s Games is a fraction on purpose.</b> Nobody
          knows which nights he warms up, so every game his club has left carries the share of
          an outing he is usually good for. Pick a single day and the board names each
          man&rsquo;s opponent for it, and the arm the other club is throwing.
        </p>
      ) : categories != null ? (
        <p>
          <b>Every figure is what the team has already scored</b> plus what its players should
          add {over} in the week. All {categories} categories are worked out separately, and the
          record beside the team names is those {categories} compared.
        </p>
      ) : (
        <p>
          <b>Every figure is what he has already done over the days in view</b> plus what he
          should add {over} to play. A day that has been played is his real line; a day still to
          come is the estimate below. <b>Games</b> is how many he appears in over those days —
          the ones he bats in, or for a pitcher his outings, a start and a relief appearance
          alike — and <b>Starts</b> is how many of the days his club plays your fantasy lineup
          has room for him. <b>A reliever&rsquo;s Games is a fraction on purpose.</b> Nobody
          knows which nights he warms up, so every game his club has left carries the share of
          an outing he is usually good for — half an appearance tonight is what a man used in
          half his club&rsquo;s games is worth, and the line beside it is worth the same share.
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
    </>
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
  active,
  loading,
  onToggle,
  title,
}: {
  on: boolean;
  /**
   * **This control's panel is open** — the research board alone, where the lens
   * has to bring a span with it and so has a disclosure to open.
   *
   * The class pair is the app's own and the two halves mean different things:
   * `.on` is *this control is doing something* and `.active` is *its panel is
   * showing*. The Roster's copy has no panel and so never passes this, which is
   * why it is optional rather than a second component — one button, two callers,
   * and the caller that has a panel says so.
   */
  active?: boolean;
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
      className={`projected-toggle${active ? ' active' : ''}${on ? ' on' : ''}`}
      /* A disclosure says `aria-expanded`; a plain switch says `aria-pressed`.
         The board's copy is both — it holds a span *and* opens a panel — so it
         says both, and the caller with no panel says only the second. */
      aria-expanded={active === undefined ? undefined : active}
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
