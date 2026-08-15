/**
 * The League page's **Rankings** tab — where every team stands in each of the
 * league's own scoring categories, over one of four spans.
 *
 * **This is the season table the page opened with, read the other way round.**
 * That table was the raw values, and a value on its own is only half of what a
 * manager wants from it: 232 home runs is a lot or a little depending on the
 * eleven numbers beside it, and the reader was doing that comparison by eye
 * down a column of twelve. So each cell carries the **rank** under the figure —
 * and carries the figure, because a rank with no number behind it cannot be
 * acted on. `1st` is what you are looking for and `12th` is what you are
 * looking for; the value is what you do about it.
 *
 * **Which spans it offers is the league's business, not this file's.** The
 * server answers with the spans it can serve honestly (`spans`) and the strip
 * is drawn from that — so a season whose All-Star break ESPN's calendar does
 * not show has no halves at all, and April has no second half, rather than
 * either being drawn empty. See `espn.ts`, **The Rankings tab**, for what each
 * span is made of and what was measured to establish that it could be.
 */
import { useMemo, useState } from 'react';
import type {
  EspnCategory,
  EspnRankSpan,
  EspnRankSpanInfo,
  EspnRankings,
} from '../types';
import { LoadingBlock } from './Loading';
import { TeamLogo, fmtValue, prettyDate, record } from './LeagueView';

/** `1st`, `2nd`, `3rd`, `12th` — the ordinal a league table is read in. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * What a span actually covers, in one line under the strip.
 *
 * It is not decoration. `First half` is a phrase, and which weeks and which
 * days it is made of is the whole of what makes the numbers under it readable —
 * the same argument the scoreboard's own header makes for printing its dates
 * beside `Week 19` rather than the week number alone. `so far` is the other
 * half of it: a span reaching into the week being played is a total to date,
 * and saying `Season` over a figure that stops on Tuesday would be a claim.
 */
function spanDetail(info: EspnRankSpanInfo | undefined): string {
  if (!info) return '';
  const days =
    info.start && info.end
      ? info.start === info.end
        ? prettyDate(info.start)
        : `${prettyDate(info.start)} – ${prettyDate(info.end)}`
      : null;
  const weeks =
    info.periods == null
      ? null
      : info.periods[0] === info.periods[1]
        ? `Week ${info.periods[0]}`
        : `Weeks ${info.periods[0]}–${info.periods[1]}`;
  const parts = [weeks, days].filter(Boolean) as string[];
  if (info.span === 'season' && parts.length === 0) parts.push("ESPN's own season line");
  if (info.live) parts.push('so far');
  return parts.join(' · ');
}

type SortKey = { kind: 'team' } | { kind: 'cat'; statId: number };

function sameKey(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'cat' || b.kind !== 'cat' || a.statId === b.statId;
}

/**
 * The table.
 *
 * The sort is the season table's own, moved across with it and unchanged in
 * substance — `ascFirst` per category so ERA and WHIP open on their good end,
 * nulls to the bottom in both directions — with one thing added: **sorting is
 * on the rank rather than the value**, which is the same order for every
 * category and is the order the tab is about. It comes to the same thing where
 * every team has a figure, and where one doesn't it keeps that team out of the
 * order rather than filing him at one end of it.
 */
function RankTable({
  rankings,
  categories,
}: {
  rankings: EspnRankings;
  categories: EspnCategory[];
}) {
  const [sort, setSort] = useState<SortKey>({ kind: 'team' });
  const [asc, setAsc] = useState(true);

  const teams = useMemo(
    () => new Map(rankings.teams.map((t) => [t.id, t])),
    [rankings.teams],
  );

  const rows = useMemo(() => {
    const out = [...rankings.rows];
    out.sort((a, b) => {
      let d = 0;
      if (sort.kind === 'team') {
        d = ((teams.get(a.teamId)?.seed || 99) - (teams.get(b.teamId)?.seed || 99)) as number;
      } else {
        const ar = a.ranks[sort.statId];
        const br = b.ranks[sort.statId];
        // Nulls to the bottom in **both** directions, the board's own rule: a
        // team with no figure has not got the worst one.
        const an = typeof ar !== 'number';
        const bn = typeof br !== 'number';
        if (an && bn) d = 0;
        else if (an) return 1;
        else if (bn) return -1;
        else d = ar - br;
      }
      return asc ? d : -d;
    });
    return out;
  }, [rankings.rows, sort, asc, teams]);

  const toggle = (key: SortKey) => {
    if (sameKey(key, sort)) setAsc((v) => !v);
    else {
      setSort(key);
      // Every column opens on **first place**, whichever direction the
      // category itself runs — which is the one thing a rank column buys over
      // a value column: `ascFirst` per category stops being something the
      // reader has to know.
      setAsc(true);
    }
  };

  const head = (key: SortKey, label: string, title: string, cls = '') => {
    const active = sameKey(key, sort);
    return (
      <th
        scope="col"
        className={`${cls} research-sort${active ? ' active' : ''}`}
        aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" onClick={() => toggle(key)} title={title}>
          <span className="research-arrow" aria-hidden="true">
            {active ? (asc ? '▲' : '▼') : ''}
          </span>
          {label}
        </button>
      </th>
    );
  };

  const spanInfo = rankings.spans.find((s) => s.span === rankings.span);
  const spanWords = spanInfo ? spanInfo.label.toLowerCase() : 'this span';

  return (
    <div className="league-scroll">
      <table className="glog-table league-table">
        <thead>
          <tr>
            {head({ kind: 'team' }, 'Team', 'The league standing', 'lg-team-col')}
            {categories.map((c) =>
              head(
                { kind: 'cat', statId: c.statId },
                c.label,
                // The direction is stated because a bare abbreviation cannot
                // say it and it differs per category.
                `${c.name} — ${spanWords}${c.lowerBetter ? ', lower is better' : ''}`,
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = teams.get(r.teamId);
            return (
              <tr key={r.teamId} className={r.teamId === rankings.myTeamId ? 'lg-row-mine' : undefined}>
                <th scope="row" className="lg-team-col glog-date">
                  <TeamLogo team={t} />
                  <span className="lg-row-name">
                    {t?.name ?? `Team ${r.teamId}`}
                    <span className="lg-row-sub">{t ? record(t) : ''}</span>
                  </span>
                </th>
                {categories.map((c) => {
                  const v = r.values[c.statId];
                  const rank = r.ranks[c.statId];
                  return (
                    <td key={c.statId} className="glog-num">
                      {fmtValue(v, c)}
                      {/* The rank under the value, in the slot and the type the
                          research board's own percentile badge takes — folded
                          onto `.col-rank` rather than restyled, so a second
                          line under a number is one object in this app. */}
                      {typeof rank === 'number' && (
                        <span
                          className={`col-rank${rank === 1 ? ' lg-rank-best' : ''}`}
                          title={`${c.name}: ${ordinal(rank)} of ${
                            rows.filter((x) => typeof x.ranks[c.statId] === 'number').length
                          } — ${spanWords}`}
                        >
                          {ordinal(rank)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function LeagueRankings({
  rankings,
  span,
  loading,
  error,
  onSpan,
}: {
  rankings: EspnRankings | null;
  span: EspnRankSpan;
  loading: boolean;
  error: string | null;
  onSpan: (span: EspnRankSpan) => void;
}) {
  if (error && !rankings) {
    return (
      <div className="empty-state">
        <h3>Couldn't read your league</h3>
        <p>{error}</p>
      </div>
    );
  }

  // Never over data: a span change leaves the previous table standing while the
  // next is in flight, and the block wait is only for a pane with nothing in it.
  if (!rankings) {
    return loading ? <LoadingBlock>Reading your league's rankings</LoadingBlock> : null;
  }

  const shown = rankings.spans.some((s) => s.span === span) ? span : rankings.span;
  const info = rankings.spans.find((s) => s.span === shown);

  return (
    <div className="lg-rankings">
      {/* The span strip. Folded onto `.view-switch` / `.view-tab` in the
          stylesheet rather than restyled to resemble the research board's
          window tabs — it *is* that control, asking the same shape of question
          about a different thing. */}
      <div className="lg-span-head">
        <div className="lg-span-row" role="tablist" aria-label="Which span">
          {rankings.spans.map((s) => (
            <button
              key={s.span}
              type="button"
              role="tab"
              aria-selected={s.span === shown}
              className={`lg-span-tab${s.span === shown ? ' active' : ''}`}
              onClick={() => onSpan(s.span)}
              title={spanDetail(s) || s.label}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="lg-span-detail">{spanDetail(info)}</span>
      </div>

      {rankings.categories.length === 0 ? (
        <div className="empty-state">
          <h3>No scoring categories</h3>
          <p>
            ESPN scores this league as <code>{rankings.scoringType}</code>, which has no
            categories to rank teams in — so there is nothing for this tab to draw. The
            Scoreboard tab is what the league has.
          </p>
        </div>
      ) : rankings.rows.every((r) => Object.keys(r.values).length === 0) ? (
        <div className="empty-state">
          <h3>Nothing played in {info?.label.toLowerCase() ?? 'this span'} yet</h3>
          <p>ESPN has no category totals for these weeks, so there is nothing to rank.</p>
        </div>
      ) : (
        <RankTable rankings={rankings} categories={rankings.categories} />
      )}
    </div>
  );
}
