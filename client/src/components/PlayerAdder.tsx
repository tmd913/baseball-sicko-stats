import { useMemo, useState } from 'react';
import type { SeasonPlayer, WatchPlayer } from '../types';

export function PlayerAdder({
  players,
  watchlist,
  onAdd,
  onOpenDetails,
  loading,
}: {
  players: SeasonPlayer[];
  watchlist: WatchPlayer[];
  onAdd: (p: WatchPlayer) => void;
  onOpenDetails: (id: number) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const watchedIds = useMemo(() => new Set(watchlist.map((p) => p.id)), [watchlist]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => !watchedIds.has(p.id))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.savantName.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, players, watchedIds]);

  const select = (p: SeasonPlayer) => {
    onAdd({ id: p.id, savantName: p.savantName, name: p.name });
    setQuery('');
  };

  const openDetails = (p: SeasonPlayer) => {
    onOpenDetails(p.id);
    setQuery('');
  };

  return (
    <div className="adder">
      <div className="adder-input-wrap">
        <input
          className="adder-input"
          placeholder={
            loading
              ? 'Loading players…'
              : `Search for a player (${players.length} active this season)…`
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
            <li key={p.id} className="adder-row">
              {/* Tapping the name opens the details view (works without adding);
                  the ＋ button adds the player to the watchlist. */}
              <button
                className="adder-option"
                onMouseDown={() => openDetails(p)}
                title={`View ${p.name}'s details`}
              >
                <span className="opt-name">{p.name}</span>
                <span className="opt-meta">
                  {p.team}
                  {p.position ? ` · ${p.position}` : ''}
                </span>
              </button>
              <button
                className="adder-add"
                onMouseDown={() => select(p)}
                title={`Add ${p.name} to watchlist`}
                aria-label={`Add ${p.name} to watchlist`}
              >
                +
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
