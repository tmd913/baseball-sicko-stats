import { useMemo } from 'react';
import type { MlbScoreboard, MlbScoreboardGame, MlbScoreboardTeam } from '../types';
import { teamLogoUrl, wideRange } from '../lib';
import { BaseDiamond } from './BaseDiamond';
import { LoadingBlock } from './Loading';
import { DateBar, DateCalendar, stepRange, stepTitle } from './DateControls';
import type { DatePreset } from './DateControls';
import { EmptyState } from './EmptyState';

/**
 * # The day's games, as thirty clubs played them
 *
 * The MLB view's first tab: every game on one ET day, each card a door into
 * that game's own page. It is the league's own scoreboard beside the fantasy
 * one — `LeagueView`'s Scoreboard is *your* league's matchups, this is the
 * baseball.
 *
 * ## One day, and the bar says so
 *
 * The app's date control is a **range** everywhere else, because everywhere
 * else is a stat line summed over days. A scoreboard is not: a game is played
 * on a date, and two days of games in one list would be a list that has to
 * repeat the date on every card to stay readable. So this bar carries
 * `start === end` and the calendar behind it is in `single` mode — one press
 * picks one day, rather than a press to anchor and a press to close.
 *
 * **It is `DateBar` rather than a control of its own**, which is what buys the
 * arrows their wording for free: `stepRange` over a one-day span steps one day
 * and `stepTitle` calls it `Previous day`, both of them the same functions the
 * roster's bar reads. The presets it is handed are **the app's own three
 * single-day rules** — `Today`, `Tomorrow`, `Yesterday`, filtered out of
 * `datePresets` rather than written again here, because a second list of the
 * same three days is two lists that will one day disagree about which day
 * `Yesterday` is. They are *rules* and not ranges, so a link shared from
 * `Yesterday` re-derives on the recipient's own today, which is the whole
 * reason the URL carries a label. See `client-dates.md`.
 *
 * ## What a card says, and what it deliberately does not
 *
 * The status pill leads, because on a scoreboard the first question is *is this
 * over*: `Final`, a live half-inning, or the first pitch. Then both clubs with
 * their records and the score, the home side second — the way a line score is
 * written. Under them the one line that changes with the state: the two
 * announced starters before a game, the pitcher and the batter while it is
 * being played, the winning and losing pitcher after it, MLB's own reason on a
 * postponement.
 *
 * **No line score and no box.** Both are on the game's own page, which every
 * card opens, and drawing nine columns of runs across fifteen cards would be
 * that page at a resolution nobody can read on a phone.
 */

export default function MlbScoreboardTab({
  board,
  date,
  preset,
  onDate,
  presets,
  maxDate,
  open,
  onToggleCalendar,
  onCloseCalendar,
  loading,
  error,
  onOpenGame,
}: {
  board: MlbScoreboard | null;
  /** The day on screen, `YYYY-MM-DD`. */
  date: string;
  /** Which rule it came from, where it came from one — the bar's lead line. */
  preset: string | null;
  onDate: (date: string, preset: string | null) => void;
  presets: DatePreset[];
  /** The picker's ceiling, which is also the arrows' — the two must reach the
   *  same last day or the bar holds two controls that disagree about the end of
   *  the season. `DateBar`'s own rule. */
  maxDate: string;
  open: boolean;
  onToggleCalendar: () => void;
  onCloseCalendar: () => void;
  loading: boolean;
  error: string | null;
  onOpenGame: (gamePk: number) => void;
}) {
  const step = (delta: -1 | 1) => {
    const to = stepRange(date, date, delta, presets, maxDate);
    return to === null ? null : () => onDate(to.start, to.preset);
  };
  const bar = (
    <DateBar
      /* **The `label` reading rather than `dates`**, and the difference is one
         word the bar would otherwise get wrong. `dates` derives its two lines
         from the range it is handed and calls a hand-picked one `Custom range`
         — which is true of five days in the roster's table and false of one
         day's games, a day not being a range of anything. This reading is the
         one that exists for a bar whose lines are *stated*: the lead is the
         rule where the day came from one and `Chosen day` where the reader
         picked it off the calendar, and the range line is `wideRange`'s own
         single-day form, which is character-for-character what `dateBarFace`
         would have produced. */
      reading={{ kind: 'label', lead: preset ?? 'Chosen day', range: wideRange(date, date) }}
      start={date}
      end={date}
      open={open}
      onToggle={onToggleCalendar}
      onClose={onCloseCalendar}
      onPrev={step(-1)}
      onNext={step(1)}
      /* A disabled arrow keeps its title rather than going silent: the reason
         it is off is that there is nowhere to go, and the tooltip is where a
         reader finds that out. */
      prevTitle={stepTitle(date, date, -1)}
      nextTitle={stepTitle(date, date, 1)}
      popover={
        <DateCalendar
          start={date}
          end={date}
          max={maxDate}
          /* One press, one day — see the file's note and `DateCalendar`'s
             `single`. */
          single
          onChange={(s) => {
            // A day the reader picked himself is a *range* rather than a rule,
            // so the preset goes — except where the day he picked happens to be
            // one of the three, which `stepRange`'s own test decides one line
            // up and this one restates for the calendar.
            onDate(s, presets.find((p) => p.start === s)?.label ?? null);
            onCloseCalendar();
          }}
        />
      }
      popoverLabel="Pick a day on the calendar"
    />
  );
  return (
    <div className="mlb-board">
      {bar}
      <Body board={board} loading={loading} error={error} onOpenGame={onOpenGame} />
    </div>
  );
}

function Body({
  board,
  loading,
  error,
  onOpenGame,
}: {
  board: MlbScoreboard | null;
  loading: boolean;
  error: string | null;
  onOpenGame: (gamePk: number) => void;
}) {
  // Never over data: a re-read leaves what is on screen standing, and the block
  // wait is only for a pane with nothing in it yet.
  if (!board) {
    if (error) {
      return (
        <EmptyState title="Couldn’t read the day’s games">
          <p>{error}</p>
        </EmptyState>
      );
    }
    return loading ? <LoadingBlock>Reading the day&rsquo;s games</LoadingBlock> : null;
  }
  if (board.games.length === 0) {
    // An empty state names its own cause and the control that caused it. The
    // cause here is the date, and the control is the bar directly above.
    return (
      <EmptyState title="No games on this day">
        <p>
          MLB has nothing scheduled for it &mdash; an off day, the All-Star break, or a
          date the season has not reached. Step the date above to a day that has some.
        </p>
      </EmptyState>
    );
  }
  return (
    <div className="mlb-games">
      {board.games.map((g) => (
        <GameCard key={g.gamePk} game={g} onOpen={onOpenGame} />
      ))}
    </div>
  );
}

/** MLB's own half-inning, said the way a scoreboard says it — `Top 6`. The
 *  state word is MLB's (`Top`, `Bottom`, `Middle`, `End`) and is printed as it
 *  comes; inventing a shorter one is how this row comes to disagree with the
 *  game page it opens. */
function halfInning(game: MlbScoreboardGame): string | null {
  if (game.inning === null) return null;
  const state = game.inningState ? `${game.inningState} ` : '';
  return `${state}${game.inning}`;
}

function startTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * The card, whole, as one press.
 *
 * **A `<button>` rather than a div with a handler**, so it is in the tab order
 * and answers a keyboard — the rule every other full-row door in this app
 * follows (`.lg-team-press`, the opponent cell, a fixture row).
 */
function GameCard({ game, onOpen }: { game: MlbScoreboardGame; onOpen: (pk: number) => void }) {
  const half = halfInning(game);
  const time = startTime(game.startTime);
  const label = useMemo(() => {
    const clubs = `${game.away.name} at ${game.home.name}`;
    return game.state === 'final'
      ? `${clubs}, final ${game.away.score}–${game.home.score}. Open the game.`
      : `${clubs}. Open the game.`;
  }, [game]);
  return (
    <button type="button" className="mlb-game" onClick={() => onOpen(game.gamePk)} aria-label={label}>
      <span className="mlb-game-head">
        <span className={`lg-state${game.state === 'live' ? ' lg-state-live' : ''}`}>
          {/* One word per state, and the live one is the only one that is a
              *reading* rather than a label — which is why it is the only one
              that takes a color. The app's rule: color is spent on state. */}
          {game.state === 'final'
            ? game.detailedState || 'Final'
            : game.state === 'postponed'
              ? game.detailedState || 'Postponed'
              : game.state === 'live'
                ? half ?? (game.detailedState || 'Live')
                : time ?? (game.detailedState || 'Scheduled')}
        </span>
        {/* **The situation, drawn rather than said.** This was `2 out` in
            words, which is half of what a reader watching a live card wants and
            the half that is already implied by the next pitch; the diamond is
            the feed's own glyph (`BaseDiamond`, out dots and all) and says the
            same thing plus who is on base. One mark rather than a word beside a
            picture that would repeat it. */}
        {game.state === 'live' && game.bases !== null && (
          <BaseDiamond bases={game.bases} outs={game.outs ?? 0} className="mlb-game-bases" />
        )}
        {game.seriesGame !== null && game.seriesLength !== null && game.seriesLength > 1 && (
          <span className="mlb-game-series">
            Game {game.seriesGame} of {game.seriesLength}
          </span>
        )}
      </span>
      <span className="mlb-sides">
        <Side team={game.away} state={game.state} />
        <Side team={game.home} state={game.state} />
      </span>
      <Foot game={game} />
    </button>
  );
}

function Side({
  team,
  state,
}: {
  team: MlbScoreboardTeam;
  state: MlbScoreboardGame['state'];
}) {
  return (
    <span className={`mlb-side${team.winner === true ? ' mlb-side-won' : ''}`}>
      {/* The crest is the club, so it carries no label of its own — the name is
          the next cell and a screen reader reads that one. */}
      <img className="mlb-crest" src={teamLogoUrl(team.id)} alt="" aria-hidden="true" />
      <span className="mlb-side-name">{team.name || team.abbreviation}</span>
      {team.wins !== null && team.losses !== null && (
        <span className="mlb-side-rec">
          {team.wins}-{team.losses}
        </span>
      )}
      {/* **A dash rather than a zero before first pitch.** A game nobody has
          played has no score, and `0` is a claim that both clubs have failed to
          score — which on a card that also says `7:05 PM` reads as a result. */}
      <span className="mlb-side-score">
        {state === 'scheduled' || team.score === null ? '–' : team.score}
      </span>
    </span>
  );
}

/**
 * The one line under the score, and **which line it is is the state**: two
 * announced starters before a game, **the two men in the middle of it while it
 * is being played**, the decisions after it, MLB's own reason on a
 * postponement, and nothing at all where there is nothing to say — an absent
 * child rather than an empty one, which is what keeps a card of one height from
 * standing beside a card of another for no reason.
 *
 * The live line takes the slot the probables had, which is the whole of why it
 * is here: that slot already means *the pitching matchup on this card*, and
 * before first pitch the two announced starters are what it is. Once somebody
 * is on the mound, the man there and the man facing him are the same fact
 * measured rather than promised — the card's own reason for dropping the
 * probables at first pitch, answered instead of merely obeyed.
 *
 * **`P` and `AB` rather than two bare names**, which is the vocabulary the
 * final line already uses one state along (`W`, `L`, `S`): a role, then who.
 * Two names either side of a `vs` would read as the two clubs' starters, which
 * is exactly what the line says before the game and exactly what it no longer
 * means after it.
 */
function Foot({ game }: { game: MlbScoreboardGame }) {
  if (game.state === 'postponed') {
    return <span className="mlb-game-foot">{game.reason ?? 'No make-up date announced'}</span>;
  }
  if (game.state === 'live' && game.onMound && game.atBat) {
    // **`DUE` between halves.** MLB swaps its offense and defense blocks on the
    // third out, so a card on `Middle 6` carries the bottom's pitcher and its
    // leadoff man — a true and useful pair that nobody is yet batting in.
    // `Top`/`Bottom` is the half being played; anything else is the gap.
    const batting = game.inningState === 'Top' || game.inningState === 'Bottom';
    return (
      <span className="mlb-game-foot">
        <span className="mlb-game-role">P</span> {game.onMound.name}{' '}
        <span className="mlb-vs">vs</span>{' '}
        <span className="mlb-game-role">{batting ? 'AB' : 'DUE'}</span> {game.atBat.name}
      </span>
    );
  }
  if (game.state === 'final') {
    const parts: string[] = [];
    if (game.winPitcher) parts.push(`W ${game.winPitcher.name}`);
    if (game.lossPitcher) parts.push(`L ${game.lossPitcher.name}`);
    if (game.savePitcher) parts.push(`S ${game.savePitcher.name}`);
    return parts.length === 0 ? null : <span className="mlb-game-foot">{parts.join(' · ')}</span>;
  }
  const away = game.away.probableName;
  const home = game.home.probableName;
  if (!away && !home) {
    // A club names its starter about three days out, so an absence here is the
    // schedule rather than the card — `ScheduleGame`'s own measurement. It says
    // so in words rather than drawing two dashes, which would read as a pair of
    // pitchers nobody could identify.
    return game.state === 'scheduled' ? (
      <span className="mlb-game-foot mlb-game-foot-none">Starters not announced</span>
    ) : null;
  }
  return (
    <span className="mlb-game-foot">
      {away ?? 'TBD'} <span className="mlb-vs">vs</span> {home ?? 'TBD'}
    </span>
  );
}
