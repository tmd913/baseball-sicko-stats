import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { PercentileSection, PlayerKind, PlayerPercentiles, ResearchRow } from '../types';
import { headshotUrl } from '../lib';
import { useDelayedFlag } from '../hooks';
import { DetailsShell } from './DetailsShell';
import { LoadingBlock } from './Loading';
import type { Column } from './researchColumns';
import { isRankable } from './columnRanks';

/**
 * **Two to six players, side by side** — the research board transposed.
 *
 * The board answers *who* out of six hundred, and it answers it by scanning:
 * forty columns across, one row per man, and the comparison a reader is
 * actually making happens in their head between two rows forty pixels apart. By
 * the time the field is down to three names that is the wrong shape. This is
 * the same numbers with the axes swapped — **one row per stat, one column per
 * player** — which is the shape a two-way comparison wants and the shape the
 * player page's Stats tab already uses for one man across five spans.
 *
 * ### It is the board's own columns, and that is the whole design
 *
 * Nothing here has a stat vocabulary of its own. The rows are exactly the
 * columns the reader has turned on, in the order they turned them on, drawn by
 * the same `Column.cell` the board draws them with — so a number on this page
 * and the same number on the board behind it cannot come to disagree, and a
 * column added to `researchColumns.tsx` appears here having been told nothing.
 * The reader's own Columns picker is therefore this page's picker too.
 *
 * **The rows are handed in rather than fetched.** The board is holding them:
 * it is what the reader selected them *on*, at whatever window, position and
 * ownership sets are in force. Re-reading here would be a second answer free to
 * disagree with the one on screen, and would have to invent an opinion about
 * which window a comparison is over — the answer being *the one the board is
 * on*, which the board already knows.
 *
 * ### The best value in each row is marked, and only where "best" means
 * something
 *
 * A comparison's whole job is *which of these is better at this*, and asking a
 * reader to do it down a row of six decimals is asking them to do the work the
 * page exists to save. So the leader is lit. But **`Column.better` is what says
 * whether the question is even askable**: a column has a direction (`'high'` or
 * `'low'`) or it has none, and the ones with none are the ones where a winner
 * would be a lie — a team abbreviation, a position, an opponent, a games count
 * that says nothing but how much a line rests on. Those rows are drawn plain.
 * That is the same field the board's own sort arrows read, so the two cannot
 * disagree about which way is up.
 *
 * **A tie lights every player in it**, rather than the first: two men on .284
 * are level, and lighting the leftmost would be an artifact of the order they
 * were picked in.
 *
 * ### The percentile tab, and why it is a second read rather than a second card
 *
 * The Stats tab is free — the rows are in hand. Percentiles are not: each
 * player is a Savant player-page scrape, **measured at 1.07s cold**, so six
 * players is six of the most expensive read this app makes. It is therefore a
 * tab of its own, lazy on first open like every tab on the player page, and the
 * reads go out **together** rather than in series: they are independent, and
 * six 1-second reads in series is six seconds of an empty pane.
 *
 * What it draws is **not** six percentile cards side by side, which would be
 * six columns of bars a reader has to align by eye. It is the same transpose
 * the Stats tab makes: one row per metric, one bar per player, so the
 * comparison is along the row where the reader is already looking. A metric
 * only one player has is still drawn — the others dash — because *he is the
 * only one Savant ranks for this* is itself an answer.
 */

/** How many may be compared at once. Six is where a phone stops being able to
 *  show a stat name and two numbers, and far past the two or three anybody
 *  actually lines up; the board's own control refuses past it rather than
 *  letting the table decide. */
export const MAX_COMPARE = 6;

type CompareTab = 'stats' | 'percentiles';

/** One man in the comparison: who he is, and his row off the board the reader
 *  picked him on. Null where the board no longer carries him — a link naming
 *  somebody the current window has no line for. */
export interface ComparePlayer {
  key: string;
  id: number;
  kind: PlayerKind;
  name: string;
  row: ResearchRow | null;
}

/**
 * The leader (or leaders) of one row, as a set of indexes.
 *
 * **Which way is good is `columnRanks.tsx`'s answer, not a second one.**
 * `isRankable` is the test that already decides whether the board may draw a
 * percentile badge under a column, and it is exactly the test this needs:
 * `Opp` holds words, `Ros%` and the trend columns are a fact about a *market*
 * rather than about a player, `Start` is an ordinal, and launch angle and the
 * GB/LD/FB split are "a profile, not a grade" — a leader on any of them would
 * be a claim nobody who reads this table believes. Direction is `ascFirst` and
 * nothing else, the same field the sort arrows and the rank badges read, so the
 * three cannot come to disagree about which end is the good one.
 *
 * Empty, too, when fewer than two players have a value — there is no
 * comparison to lead — and when **every** player is level: a row where all six
 * are tied has no leader to point at, and lighting all six would be six marks
 * meaning nothing, which is this app's rule that a mark on every row marks
 * nothing.
 *
 * A genuine tie between *some* of them lights **all** of the tied, rather than
 * the first: two men on .284 are level, and lighting the leftmost would be an
 * artifact of the order they happened to be picked in.
 */
function leadersOf(col: Column, rows: (ResearchRow | null)[]): Set<number> {
  const out = new Set<number>();
  if (!isRankable(col)) return out;
  const values = rows.map((r) => (r ? col.value(r) : null));
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length < 2) return out;
  const best = col.ascFirst ? Math.min(...present) : Math.max(...present);
  if (present.every((v) => v === best)) return out;
  values.forEach((v, i) => {
    if (v !== null && v === best) out.add(i);
  });
  return out;
}

/** The head of a column: the man it is about, and a door onto his page. */
function PlayerHead({
  player,
  onOpen,
  onDrop,
}: {
  player: ComparePlayer;
  onOpen: (key: string) => void;
  onDrop: (key: string) => void;
}) {
  return (
    <th className="cmp-head" scope="col">
      <div className="cmp-head-inner">
        <button
          type="button"
          className="cmp-head-open"
          onClick={() => onOpen(player.key)}
          title={`${player.name} — his own page`}
        >
          <img className="cmp-photo" src={headshotUrl(player.id)} alt="" />
          <span className="cmp-head-name">{player.name}</span>
          {player.row && (
            <span className="cmp-head-sub">
              {player.row.team}
              {player.row.position ? ` · ${player.row.position}` : ''}
            </span>
          )}
        </button>
        {/* **Taking a man out of the comparison is done here**, not back on the
            board. The reader is looking at the answer and deciding *this one is
            not in it any more*, and sending them back to a table of six hundred
            rows to un-tick him is sending them away from the thought they are
            having. */}
        <button
          type="button"
          className="cmp-drop"
          onClick={() => onDrop(player.key)}
          title={`Take ${player.name} out of the comparison`}
          aria-label={`Take ${player.name} out of the comparison`}
        >
          ✕
        </button>
      </div>
    </th>
  );
}

function StatsTab({
  players,
  columns,
  onOpen,
  onDrop,
}: {
  players: ComparePlayer[];
  columns: Column[];
  onOpen: (key: string) => void;
  onDrop: (key: string) => void;
}) {
  const rows = useMemo(() => players.map((p) => p.row), [players]);
  /**
   * **A row nobody has a value in is a row that says nothing** — the app's rule
   * that a mark on every row marks nothing, read sideways: on a comparison the
   * unit is the *row*, and one that dashes for all three is three dashes and no
   * information.
   *
   * It is common rather than exotic. The board's column set is one list for a
   * whole board, so `W%` is team-only and null on every player, `Opp` is empty
   * once the day's games are done, and `Ros%` and the trend columns are null
   * for anyone with no ESPN league connected. Measured on a three-man
   * comparison of batters: **four of twenty-nine rows** were dashes all the way
   * across.
   *
   * The test is the column's own `value` and `text` rather than what `format`
   * printed, because `format` returns a node — and those two are precisely what
   * the board's sort and filter read, so a row kept here is a row those two
   * would have something to say about.
   */
  const shown = useMemo(
    () =>
      columns.filter((col) =>
        rows.some((r) => {
          if (!r) return false;
          return col.value(r) !== null || (col.text?.(r) ?? null) !== null;
        }),
      ),
    [columns, rows],
  );
  if (columns.length === 0) {
    return (
      <div className="details-status">
        No columns are turned on, so there is nothing to line up. The board&rsquo;s{' '}
        <strong>Columns</strong> picker is what this page draws — turn some on and come back.
      </div>
    );
  }
  // Every column dashed for everybody, which is not the same fact as no columns
  // at all and says so: the picker is still the control that answers it.
  if (shown.length === 0) {
    return (
      <div className="details-status">
        None of these players has a value in any of the columns on the board, so there is nothing to
        line up. The board&rsquo;s <strong>Columns</strong> picker is what this page draws.
      </div>
    );
  }
  return (
    <div className="cmp-wrap">
      <table className="cmp-table stats-table">
        <thead>
          <tr>
            {/* The stat name's column, and it is sticky: the whole point of the
                transpose is reading along a row, which needs the row's own name
                on screen at every horizontal offset. */}
            <th className="cmp-corner" scope="col">
              Stat
            </th>
            {players.map((p) => (
              <PlayerHead key={p.key} player={p} onOpen={onOpen} onDrop={onDrop} />
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((col) => {
            const leaders = leadersOf(col, rows);
            return (
              <tr key={col.key}>
                <th className="cmp-stat" scope="row" title={col.title}>
                  {col.label}
                </th>
                {players.map((p, i) => (
                  <td
                    key={p.key}
                    className={`cmp-cell${leaders.has(i) ? ' is-best' : ''}`}
                    /* The `title` says why a cell is lit, which a color alone
                       cannot — and identity never rests on hue: the leader is
                       bolder and tinted, not merely tinted. */
                    title={leaders.has(i) ? `${p.name} leads on ${col.label}` : undefined}
                  >
                    {p.row ? col.format(p.row) : '–'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One metric, across the players — the percentile tab's row. */
interface MetricRow {
  key: string;
  label: string;
  /** Per player, in the page's own order; null where he has no bar for it. */
  cells: ({ percentile: number | null; value: string | null; estimated?: boolean } | null)[];
}

/**
 * Turn N cards into rows, keeping **each card's own section order** and
 * unioning the metrics.
 *
 * Section and metric order come from the first card that has them, which is the
 * server's order and therefore Savant's; a metric only later cards carry is
 * appended to its section rather than sorted in, since there is no order to
 * sort it into that is not invented. A section nobody has anything in is
 * dropped, which is how a batter's `Catching` stays off a comparison of
 * outfielders without a test for it.
 */
function toMetricRows(
  cards: (PlayerPercentiles | null)[],
): { title: string; metrics: MetricRow[] }[] {
  const order: string[] = [];
  const bySection = new Map<string, { keys: string[]; labels: Map<string, string> }>();
  for (const card of cards) {
    for (const sec of card?.summary ?? []) {
      if (!bySection.has(sec.title)) {
        order.push(sec.title);
        bySection.set(sec.title, { keys: [], labels: new Map() });
      }
      const s = bySection.get(sec.title)!;
      for (const m of sec.metrics) {
        if (!s.labels.has(m.key)) {
          s.keys.push(m.key);
          s.labels.set(m.key, m.label);
        }
      }
    }
  }
  // One lookup per card so the fill below is not N² over the metric list.
  const index = cards.map((card) => {
    const map = new Map<string, PercentileSection['metrics'][number]>();
    for (const sec of card?.summary ?? []) for (const m of sec.metrics) map.set(m.key, m);
    return map;
  });
  return order
    .map((title) => {
      const s = bySection.get(title)!;
      return {
        title,
        metrics: s.keys.map((key) => ({
          key,
          label: s.labels.get(key) ?? key,
          cells: index.map((m) => m.get(key) ?? null),
        })),
      };
    })
    .filter((s) => s.metrics.length > 0);
}

/**
 * The surname, for a label 88px wide.
 *
 * **A suffix is not a surname**, which the obvious `split(' ').pop()` gets
 * wrong on every Jr. and every III in the league — *Ronald Acuña Jr.* would
 * read as `Jr.` three bars running, and three bars labeled `Jr.` are three bars
 * nobody can tell apart. So a trailing suffix is kept *with* the name before
 * it, which is how anybody says it out loud.
 *
 * A one-word name is itself, and a name that is still too long for the box
 * ellipsizes there — the `title` on every bar carries the whole of it.
 */
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1];
  if (SUFFIXES.has(last.toLowerCase())) {
    return parts.slice(-2).join(' ');
  }
  return last;
}

const POOR: [number, number, number] = [50, 90, 161];
const AVG: [number, number, number] = [138, 143, 153];
const GREAT: [number, number, number] = [210, 45, 73];
function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}
/** Savant's diverging scale, the same one the player page's card draws with.
 *  Duplicated rather than imported because `PlayerDetails.tsx` is a 2,000-line
 *  page and importing it here to reach eight lines of color would pull the
 *  whole of it into this chunk. If a third surface needs it, it moves to
 *  `lib.ts` — two is not yet a family. */
function pctColor(p: number): string {
  return p <= 50 ? mix(POOR, AVG, p / 50) : mix(AVG, GREAT, (p - 50) / 50);
}

function PercentilesTab({
  players,
  cards,
  loading,
  error,
}: {
  players: ComparePlayer[];
  cards: (PlayerPercentiles | null)[];
  loading: boolean;
  error: string | null;
}) {
  const wait = useDelayedFlag(loading);
  const sections = useMemo(() => toMetricRows(cards), [cards]);
  /**
   * **The surname column, measured rather than declared.**
   *
   * It was `flex: 0 0 88px`, which is a number about a font this app does not
   * choose — and it was wrong in both directions: `Crow-Armstrong` truncated to
   * `Crow-Armstr…` at 1440 with 1,000px of unused row beside it, while a
   * comparison of three short names left 40px of it empty on every row. It has
   * to be *one* width (each bar is its own flex row, so a per-row width would
   * start the tracks at different offsets down the column), and the honest one
   * is the widest name actually in the set.
   *
   * `scrollWidth` is what makes that a measurement rather than an estimate: it
   * reports the full content width even where `overflow: hidden` is clipping
   * it, so the names can be measured *in place*, at the real font, without a
   * ghost to lay out. Capped at 150px, past which a name is genuinely too long
   * for a label and its `title` carries the rest.
   */
  const barsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const box = barsRef.current;
    if (!box) return;
    const measure = () => {
      const names = box.querySelectorAll<HTMLElement>('.cmp-pct-who');
      let widest = 0;
      names.forEach((n) => {
        widest = Math.max(widest, n.scrollWidth);
      });
      if (widest > 0) {
        box.style.setProperty('--cmp-who-w', `${Math.min(150, Math.ceil(widest) + 2)}px`);
      }
    };
    measure();
    // The font can land after the first paint, and a comparison can gain or
    // lose a player without remounting — so re-measure on both.
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [sections, players]);
  const anyCard = cards.some((c) => c && c.summary.length > 0);
  if (wait && !anyCard) return <LoadingBlock>Reading the percentile cards</LoadingBlock>;
  if (error && !anyCard) {
    return (
      <div className="details-status details-error">
        Couldn’t read the percentile cards: {error}. That is this read failing rather than anything
        about these players — leave the tab and come back to try it again.
      </div>
    );
  }
  if (!loading && !anyCard) {
    return (
      <div className="details-status">
        None of these players has a Statcast card this season, so there is nothing to rank them
        against.
      </div>
    );
  }
  return (
    /* **A card, capped, like the one on a player's own page.** It was a bare
       list on the page background running the full width: at 1440 that is a
       1,140px percentile track, which is a bar so long the bubble's position
       stops being readable as a position. `.pct-card` is the shape this
       already is on the player page, so it is that class with a modifier
       widening the cap — a comparison carries N bars per metric where that one
       carries one, so 680 is too narrow and 1,140 far too wide. */
    <div className="pct-card pct-card--cmp" ref={barsRef}>
      {/* **Savant's fifteen bars, not this app's thirty-nine.** A comparison is
          read across, so every metric costs N bars rather than one — and the
          summary card is the set a reader means by "the Savant card". The
          detailed one is a door away, on each man's own page. */}
      <p className="cmp-note">
        Savant’s own card, one bar per player. A dotted bubble is a rank this app worked out rather
        than one Savant published.
      </p>
      {sections.map((sec) => (
        <div className="cmp-pct-section" key={sec.title}>
          <h2 className="pct-section-title">{sec.title}</h2>
          {sec.metrics.map((m) => (
            <div className="cmp-pct-row" key={m.key}>
              <span className="cmp-pct-label">{m.label}</span>
              <div className="cmp-pct-bars">
                {m.cells.map((cell, i) => {
                  const p = cell?.percentile ?? null;
                  const color = p !== null ? pctColor(p) : undefined;
                  return (
                    <div
                      className="cmp-pct-bar"
                      key={players[i].key}
                      title={
                        p !== null
                          ? `${players[i].name} — ${m.label} ${p}th percentile${cell?.value ? ` (${cell.value})` : ''}`
                          : `${players[i].name} — no ${m.label}`
                      }
                    >
                      <span className="cmp-pct-who">{shortName(players[i].name)}</span>
                      <div className="pct-track">
                        {p !== null && (
                          <>
                            <span
                              className="pct-fill"
                              style={{ width: `${p}%`, background: color }}
                            />
                            <span
                              className={`pct-bubble${cell?.estimated ? ' pct-bubble--est' : ''}`}
                              style={{ left: `${p}%`, background: color }}
                            >
                              {p}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="pct-value">{cell?.value ?? '–'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ComparePage({
  players,
  columns,
  onOpenPlayer,
  onDrop,
  onClose,
}: {
  players: ComparePlayer[];
  /** The columns the reader has on, from the board — see the note at the head
   *  of this file on why this page has no vocabulary of its own. */
  columns: Column[];
  onOpenPlayer: (key: string) => void;
  onDrop: (key: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<CompareTab>('stats');
  const [cards, setCards] = useState<(PlayerPercentiles | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The read's own mark, carrying **who** is being compared — so adding or
   * dropping a player re-reads and the same set never asks twice. Not a cleanup
   * flag: the rule this app has found four times over is that an effect
   * teardown must never unmark a read in flight, which leaves the wait up for
   * ever.
   */
  const req = useRef<string | null>(null);
  const signature = players.map((p) => p.key).join(',');

  useEffect(() => {
    if (tab !== 'percentiles' || req.current === signature) return;
    req.current = signature;
    setLoading(true);
    setError(null);
    // **Together, not in series.** Each is an independent Savant scrape at
    // ~1.07s cold, so six in series is six seconds of an empty pane. One
    // player's failure costs his own column and not the tab — the standing rule
    // that a failure costs its own column, never the request — so each is
    // caught into a null and the error is raised only if *every* one failed.
    Promise.all(
      players.map((p) =>
        api.percentiles(p.id, p.kind === 'pitcher' ? 'pitcher' : 'batter').catch(() => null),
      ),
    ).then(
      (got) => {
        if (req.current !== signature) return;
        setCards(got);
        setLoading(false);
        if (got.every((c) => c === null)) setError('every card failed to load');
      },
      (e: unknown) => {
        if (req.current !== signature) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setLoading(false);
        req.current = null; // allow a retry on re-entry
      },
    );
  }, [tab, signature, players]);

  const title =
    players.length === 2
      ? `${players[0].name} vs ${players[1].name}`
      : `${players.length} players compared`;

  return (
    <DetailsShell
      /* **The Stats tab makes its own pane the scroller, and that is the whole
         of why its header sticks.** `.cmp-wrap` scrolls sideways, and a box with
         `overflow-x: auto` computes `overflow-y: auto` too — so it *is* the
         nearest scrollport for a `position: sticky` header, and with no height
         of its own it never scrolls, so the header never stuck to anything. The
         Game Log tab met this first and answers it the same way: the overlay
         becomes a fixed-height flex column for that tab alone, the chrome holds
         its place, and the table's box is the only thing that moves.

         The Percentile tab keeps the ordinary page scroll — it is a card, not a
         table, and it has no header to hold. */
      className={tab === 'stats' ? 'cmp-mode' : undefined}
      tab={tab}
      /* **What makes this a different page** — the set being compared. Changing
         it is a new page in the sense that matters here (the scroll goes back
         to the top), where changing the tab is a different reading of one. */
      resetKey={signature}
      onClose={onClose}
      tabsLabel="Comparison"
      head={
        <div className="cmp-title">
          <span className="cmp-title-text">{title}</span>
        </div>
      }
      tabs={
        <>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'stats'}
            className={`details-tab${tab === 'stats' ? ' is-active' : ''}`}
            onClick={() => setTab('stats')}
          >
            Stats
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'percentiles'}
            className={`details-tab${tab === 'percentiles' ? ' is-active' : ''}`}
            onClick={() => setTab('percentiles')}
          >
            Percentile Rankings
          </button>
        </>
      }
    >
      {tab === 'stats' && (
        <StatsTab players={players} columns={columns} onOpen={onOpenPlayer} onDrop={onDrop} />
      )}
      {tab === 'percentiles' && (
        <PercentilesTab players={players} cards={cards} loading={loading} error={error} />
      )}
    </DetailsShell>
  );
}
