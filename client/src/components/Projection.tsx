import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { InfoKey } from './InfoKey';
import { LoadingBlock, SpinningBaseball } from './Loading';
import { api } from '../api';
import { useDelayedFlag } from '../hooks';
import { eraOf, formatRate, lineOps, whipOf } from '../lib';
import type { BattingLine, GameProjection, PitchingLine, PlayerKind } from '../types';

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
   * **The research board's reading, which is the one of the four that is
   * *only* a projection.** See `ProjectionNote`, which carries the argument.
   */
  board?: boolean;
  /** **One man in one game** — the game preview's reading, where there is no
   *  span at all and `days` says nothing. See `ProjectionNote`. */
  game?: boolean;
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
  game,
}: {
  days: number;
  categories?: number;
  board?: boolean;
  game?: boolean;
}) {
  const over =
    days > 0 ? `over the ${days} ${days === 1 ? 'day' : 'days'} left` : 'over the days left';
  return (
    <>
      {game ? (
        /* **The one reading with no span in it.** The other three are asked
           about days — a week, a range, a board's own window — and every one of
           them opens by saying how many are left. This is asked about a single
           fixture, so `over` would be a sentence about nothing; what takes its
           place is the fraction, which is the thing a reader of *one* game is
           most likely to misread as a rounding error. */
        <p>
          <b>Every figure here is an estimate</b> — what he is expected to be worth in this
          one game, and nothing he has already done. <b>A fraction is the answer, not a
          rounding of one.</b> A hitter who sits one start in five is four fifths of a game
          and four fifths of a line; a reliever nobody knows will warm up carries the share
          of an appearance he is usually good for. <b>The ballpark below is not in it</b> —
          that is a reading of its own, and this one moves with the arm he faces rather than
          the ground he faces it on.
        </p>
      ) : board ? (
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
          half his club&rsquo;s games is worth, and the line beside it is worth the same share.{' '}
          <b>Pick a single day and the table names each man&rsquo;s opponent for it</b> — over a
          run of days it does not, a week being a week of fixtures and naming one of them a
          summary of none.
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

/**
 * ---------------------------------------------------------------------------
 * One man, one game
 * ---------------------------------------------------------------------------
 *
 * **The projected line a game preview draws** — what this player is expected to
 * be worth in the one fixture the reader pressed.
 *
 * It is the **fourth** surface to draw this engine and the narrowest: the
 * Roster's toggle is sixteen men over a range, the League's is two sides over a
 * week, the board's lens is six hundred over a span, and this is one man over
 * one game. It lives here for the same reason the glyph and the key do — the
 * dialog has **two callers** (`SchedulePreview`, off a fixture nobody has been
 * named for, and `UpcomingPreview`, off a game with a probable on it), and a
 * copy in each would be two accounts of one engine free to drift the next time
 * it moves.
 *
 * **The figures are the wide tables' own**, in their own order: a batter's
 * `H/AB · R · HR · RBI · SB · OPS · BB · K` is `SummaryTable::StatCells` and a
 * pitcher's twelve are `PitchStatCells`. A dialog is not a table row and could
 * have had a shorter list picked for it — which would have made *this* the one
 * place in the app where a reader has to work out which columns went missing.
 * The same argument the row's own lens makes: a projected reading is the
 * existing reading over different numbers.
 *
 * **It sits under the man on the mound and over the ballpark**, which is a
 * placement rather than an ordering accident and both halves are argued.
 *
 * *Under the starter*, because the starter is what the answer is about: the
 * engine moves with the arm he faces, so a line drawn above that name would be
 * a figure with nothing yet attached to it — and the dialog's own head has
 * always opened with him.
 *
 * *Over the park*, because the park is a reading of its own and is **not** in
 * these figures. Under them it reads as one of their inputs; over them it reads
 * as what it is, a second fact about the night. The key says so in words for
 * the same reason — what a headline reading owes the readings beneath it is a
 * word about what it does not contain.
 *
 * **Lazy on the press.** The read is started by the dialog opening and nothing
 * else pays for it — the same bargain the pitcher's opposing-lineup read makes
 * one block down, and the reason the projection is a route of its own rather
 * than a field on anything.
 */
export function ProjectedGameLine({
  kind,
  playerId,
  gamePk,
  date,
}: {
  kind: PlayerKind;
  playerId: number;
  gamePk: number;
  /** The fixture's own date, which is what the projection's context is built
   *  for. The `gamePk` is the narrowing — a doubleheader is two games on one
   *  day — and the server checks the two against each other. */
  date: string;
}) {
  const { proj, error, retry } = useGameProjection(kind, playerId, gamePk, date);
  const waiting = useDelayedFlag(!proj && !error);

  if (error) {
    return (
      <div className="details-error opp-status">
        Couldn&rsquo;t read his projection.{' '}
        <button type="button" className="ovw-link" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  if (!proj) {
    return waiting ? <LoadingBlock>Reading his projection for this game</LoadingBlock> : null;
  }

  const line = kind === 'pitcher' ? proj.pitching : proj.batting;
  /**
   * **Nothing to project, and the block says which of the three reasons it is**
   * rather than drawing a line of noughts — the app's rule that an empty state
   * names its own cause.
   *
   * The three are genuinely different facts and a reader acts differently on
   * each: a **starter whose turn is elsewhere** is a man to leave on the bench
   * tonight and start on Thursday; a man **off the active roster** is one the
   * projection refuses on principle (the injured list is projected at nothing);
   * and **no fixture at all** is the game having started under the reader's
   * finger, which is the one of the three that is about the game rather than
   * the man.
   */
  if (!line || proj.chances <= 0) {
    return (
      <p className="ovw-none">
        {!proj.fixture
          ? 'There’s nothing left to project — first pitch has been and gone, or this isn’t a game his club still has.'
          : kind === 'pitcher'
            ? 'He isn’t due to take the ball in this one — his rotation turn falls on another day.'
            : 'He isn’t on his club’s active roster, and an injured or optioned player is projected at nothing.'}
      </p>
    );
  }

  const figs =
    kind === 'pitcher' ? pitchingFigures(line as PitchingLine) : battingFigures(line as BattingLine);
  return (
    <div className="pgl-card">
      <div className="pgl-head">
        <ProjectedGlyph size={15} />
        <span className="pgl-title">Projected line</span>
        <ChanceChip proj={proj} />
        {/* The one account of the method, in the words every other projection in
            the app explains itself with — `days` is 0 here and the `game`
            reading is the branch that has no span to name. */}
        <ProjectionKey className="pgl-key" days={0} game />
      </div>
      <div className="pgl-figs" style={{ '--pgl-figs': figs.length } as CSSProperties}>
        {figs.map((f) => (
          <span key={f.label} className="pgl-fig" title={f.title}>
            <span className="pgl-fig-label">{f.label}</span>
            <span className="pgl-fig-val">{f.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * **What the line was drawn over**, said in the head rather than as a
 * thirteenth figure — it is the *size* of the reading and not one of its
 * numbers, and a reader who misses it reads every figure below as a certainty.
 *
 * Three shapes, because a game means three different things to three kinds of
 * player: a **start** is a whole outing and says so in a word; a **reliever's**
 * is a share of an appearance; a **batter's** is a share of a game. The last
 * two are the fractions `ProjectionNote`'s game reading opens by explaining.
 */
function ChanceChip({ proj }: { proj: GameProjection }) {
  if (proj.kind === 'pitcher' && proj.starts > 0) {
    return (
      <span className="pgl-chance" title="His turn in the rotation — a whole outing, at his own workload.">
        Start
      </span>
    );
  }
  const n = projFraction(proj.chances);
  return proj.kind === 'pitcher' ? (
    <span
      className="pgl-chance"
      title="Nobody knows which nights he warms up, so this game carries the share of an appearance he is usually good for — and the line is worth the same share."
    >
      {n} app
    </span>
  ) : (
    <span
      className="pgl-chance"
      title="His share of this game — how often he is in his club’s lineup. The line beside it is worth the same share."
    >
      {n} G
    </span>
  );
}

/** A projected count, to a tenth with a whole number left whole — the summary
 *  table's own `projCount`, which the server has already rounded each component
 *  to, so what is printed here is what a reader would total. */
function projFraction(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Zero is dashed on the three credit figures, exactly as the table's
 *  `CreditCell` dashes them: they are empty for almost every line, and a nought
 *  reads as data when it is not. */
const credit = (n: number): string => (n > 0 ? projFraction(n) : '—');

/** Projected innings — `17.4` outs is `5.8` innings, and deliberately not
 *  `formatIp`'s `5.2`: that form is thirds, and a projected decimal read as one
 *  would be off by a factor of five. The summary table's projected reading
 *  writes them the same way and for the same reason. */
const projIp = (outs: number): string => (outs / 3).toFixed(1);

interface Figure {
  label: string;
  value: string;
  title: string;
}

function battingFigures(line: BattingLine): Figure[] {
  const ops = lineOps(line);
  return [
    { label: 'H/AB', value: `${projFraction(line.hits)}/${projFraction(line.ab)}`, title: 'Hits and at-bats' },
    { label: 'R', value: projFraction(line.runs), title: 'Runs' },
    { label: 'HR', value: projFraction(line.hr), title: 'Home runs' },
    { label: 'RBI', value: projFraction(line.rbi), title: 'Runs batted in' },
    { label: 'SB', value: projFraction(line.sb), title: 'Stolen bases' },
    { label: 'OPS', value: ops !== null ? formatRate(ops) : '—', title: 'On-base plus slugging' },
    { label: 'BB', value: projFraction(line.bb), title: 'Walks' },
    { label: 'K', value: projFraction(line.so), title: 'Strikeouts' },
  ];
}

function pitchingFigures(line: PitchingLine): Figure[] {
  return [
    { label: 'IP', value: line.outs > 0 ? projIp(line.outs) : '—', title: 'Innings pitched' },
    { label: 'H', value: projFraction(line.hits), title: 'Hits allowed' },
    { label: 'R', value: projFraction(line.runs), title: 'Runs allowed' },
    { label: 'ER', value: projFraction(line.earnedRuns), title: 'Earned runs' },
    { label: 'BB', value: projFraction(line.walks), title: 'Walks' },
    { label: 'K', value: projFraction(line.strikeouts), title: 'Strikeouts' },
    { label: 'HR', value: projFraction(line.hr), title: 'Home runs allowed' },
    { label: 'W', value: credit(line.wins), title: 'His chance of the win' },
    { label: 'SV', value: credit(line.saves), title: 'His chance of the save' },
    { label: 'HD', value: credit(line.holds), title: 'His chance of a hold' },
    { label: 'ERA', value: eraOf(line), title: 'Earned run average' },
    { label: 'WHIP', value: whipOf(line), title: 'Walks and hits per inning pitched' },
  ];
}

/**
 * **The read, and the two guards every supersedable read in this app carries.**
 *
 * A **sequence number**, so an answer for the fixture the reader has left cannot
 * land in the box they have moved on to — the dialog is one component reused a
 * game at a time, and a slow read on a doubleheader's opener would otherwise
 * write itself over the nightcap. And the mark is set **before** the request
 * and tested by the sequence rather than by a boolean that an effect cleanup
 * clears, which is the StrictMode trap `RULES.md` records four sightings of.
 */
function useGameProjection(kind: PlayerKind, playerId: number, gamePk: number, date: string) {
  const [read, setRead] = useState<{ proj?: GameProjection; error?: boolean }>({});
  const seq = useRef(0);
  const load = useCallback(() => {
    const mine = ++seq.current;
    setRead({});
    api
      .gameProjection(kind, playerId, gamePk, date)
      .then((proj) => {
        // The server echoes the game it was asked about, so a response that has
        // somehow crossed with another is dropped on the fact rather than on
        // the counter alone.
        if (seq.current === mine && proj.gamePk === gamePk) setRead({ proj });
      })
      .catch(() => {
        if (seq.current === mine) setRead({ error: true });
      });
  }, [kind, playerId, gamePk, date]);
  useEffect(load, [load]);
  return { ...read, retry: load };
}
