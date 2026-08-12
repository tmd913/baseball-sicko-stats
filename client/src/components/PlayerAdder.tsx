import { useEffect, useMemo, useRef, useState } from 'react';
import { playerKey } from '../types';
import type { SeasonPlayer, WatchPlayer } from '../types';

export function PlayerAdder({
  players,
  watchlist,
  onAdd,
  onOpenDetails,
  loading,
  autoFocus = false,
  onClose,
}: {
  players: SeasonPlayer[];
  watchlist: WatchPlayer[];
  onAdd: (p: WatchPlayer) => void;
  onOpenDetails: (key: string) => void;
  loading: boolean;
  // Set when the search bar has just been opened from the header icon: the
  // press that revealed the field should also put the cursor in it.
  autoFocus?: boolean;
  // Dismiss the bar. Escape does it, and so does opening a player's page —
  // the overlay takes the screen, and a search bar waiting underneath it is
  // a control left open behind a door.
  onClose?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // `loading` is in the deps because the field is disabled until the roster
  // lands and a disabled input cannot take focus — on a cold open the first
  // attempt is a no-op and this is what lands the cursor once it can.
  useEffect(() => {
    if (autoFocus && !loading) inputRef.current?.focus();
  }, [autoFocus, loading]);

  // Keyed by kind, not id: a two-way player is offered once per kind, and
  // watching him as a hitter shouldn't hide the pitcher row.
  const watchedKeys = useMemo(() => new Set(watchlist.map(playerKey)), [watchlist]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => !watchedKeys.has(playerKey(p)))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.savantName.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, players, watchedKeys]);

  const select = (p: SeasonPlayer) => {
    onAdd({ id: p.id, savantName: p.savantName, name: p.name, kind: p.kind });
    setQuery('');
  };

  const openDetails = (p: SeasonPlayer) => {
    onOpenDetails(playerKey(p));
    setQuery('');
    onClose?.();
  };

  return (
    <div className="adder">
      <div className="adder-input-wrap">
        <input
          ref={inputRef}
          className="adder-input"
          placeholder={loading ? 'Loading players…' : 'Search for a player'}
          value={query}
          disabled={loading}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            // One Escape backs out of what you typed, a second closes the bar
            // — so a mistyped name doesn't cost you the whole search.
            if (query) setQuery('');
            else onClose?.();
          }}
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
                  the ＋ button adds the player to the roster. */}
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
                title={`Add ${p.name} to your roster`}
                aria-label={`Add ${p.name} to your roster`}
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
