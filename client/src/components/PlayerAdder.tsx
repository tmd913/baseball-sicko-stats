import { useMemo, useState } from 'react';
import type { RosterEntry, WatchPlayer } from '../types';

export function PlayerAdder({
  roster,
  watchlist,
  onAdd,
  loading,
}: {
  roster: RosterEntry[];
  watchlist: WatchPlayer[];
  onAdd: (p: WatchPlayer) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const watchedIds = useMemo(() => new Set(watchlist.map((p) => p.id)), [watchlist]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return roster
      .filter((p) => !watchedIds.has(p.id))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.savantName.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, roster, watchedIds]);

  const select = (p: RosterEntry) => {
    onAdd({ id: p.id, savantName: p.savantName, name: p.name });
    setQuery('');
  };

  return (
    <div className="adder">
      <div className="adder-input-wrap">
        <input
          className="adder-input"
          placeholder={
            loading
              ? 'Loading roster…'
              : `Add a player (${roster.length} played this day)…`
          }
          value={query}
          disabled={loading}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {query && (
          <button className="adder-clear" onClick={() => setQuery('')}>
            ✕
          </button>
        )}
      </div>
      {focused && matches.length > 0 && (
        <ul className="adder-menu">
          {matches.map((p) => (
            <li key={p.id}>
              <button className="adder-option" onMouseDown={() => select(p)}>
                <span className="opt-name">{p.name}</span>
                <span className="opt-meta">
                  {p.team} {p.opponent ? `vs ${p.opponent}` : ''} · {p.pa} PA
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {focused && query.trim() && matches.length === 0 && (
        <ul className="adder-menu">
          <li className="adder-none">No players match “{query}”.</li>
        </ul>
      )}
    </div>
  );
}
