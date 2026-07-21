import { useEffect, useState } from 'react';
import type { PlateAppearance } from '../types';
import { api } from '../api';
import { eventLabel, outcomeKind } from '../lib';

/** A resolved clip in the reel: its playable URL plus the caption metadata. */
interface ReelClip {
  playId: string;
  url: string;
  inning: number;
  half: string;
  event: string | null;
  description: string;
  pitcherName: string | null;
}

/**
 * A full-screen "highlight reel" for one player's game: every at-bat's final
 * play, stitched into a single sequence that auto-advances from one clip to the
 * next. The clips are just the per-play videos the app already resolves, played
 * back to back — the server never concatenates or proxies the video.
 *
 * `pas` are the player's plate appearances for the game, in play order; each
 * carries the `playId` of its last play. At-bats whose clip can't be resolved
 * (walks, HBP, or plays Savant has no video for) are simply skipped.
 */
export function GameReel({
  pas,
  gamePk,
  title,
  subtitle,
  onClose,
}: {
  pas: PlateAppearance[];
  gamePk: number;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  const [clips, setClips] = useState<ReelClip[]>([]);
  // How many at-bats we've attempted to resolve so far (drives the loading
  // progress line while clips are still being fetched).
  const [attempted, setAttempted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  // Close on Escape, matching the details overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Resolve each at-bat's clip URL in play order, appending as they arrive so
  // playback can begin on the first one while the rest are still resolving.
  // Sequential (not parallel) so the first request warms the server's per-game
  // highlight cache that the rest then hit, and so clips stay in order.
  useEffect(() => {
    let cancelled = false;
    setClips([]);
    setAttempted(0);
    setLoading(true);
    setIndex(0);
    (async () => {
      const out: ReelClip[] = [];
      for (let i = 0; i < pas.length; i++) {
        if (cancelled) return;
        const pa = pas[i];
        if (pa.playId) {
          try {
            const url = await api.video(pa.playId, gamePk);
            out.push({
              playId: pa.playId,
              url,
              inning: pa.inning,
              half: pa.half,
              event: pa.event,
              description: pa.description,
              pitcherName: pa.pitcherName,
            });
            if (!cancelled) setClips([...out]);
          } catch {
            // No clip for this at-bat — skip it.
          }
        }
        if (!cancelled) setAttempted(i + 1);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pas, gamePk]);

  const cur = clips[index] ?? null;
  const hasNext = index < clips.length - 1;
  const go = (i: number) => setIndex(Math.max(0, Math.min(i, clips.length - 1)));

  return (
    <div className="reel-view" role="dialog" aria-modal="true" aria-label={`${title} — highlights`}>
      <div className="reel-head">
        <button type="button" className="details-back" onClick={onClose}>
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <div className="reel-id">
          <span className="reel-title">{title}</span>
          <span className="reel-sub">{subtitle} · Highlights</span>
        </div>
        {clips.length > 0 && (
          <span className="reel-progress">
            {Math.min(index + 1, clips.length)} / {clips.length}
            {loading ? '…' : ''}
          </span>
        )}
      </div>

      {cur ? (
        <div className="reel-stage">
          {/* Keyed by playId so the element remounts per clip — that re-fires
              autoPlay when the reel advances to the next at-bat. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            key={cur.playId}
            className="reel-video"
            src={cur.url}
            controls
            autoPlay
            playsInline
            onEnded={() => {
              if (hasNext) setIndex((i) => i + 1);
            }}
          />
          <div className="reel-caption">
            <span className="reel-cap-inning">
              {cur.half} {cur.inning}
            </span>
            <span className={`pa-badge kind-${outcomeKind(cur.event)}`}>{eventLabel(cur.event)}</span>
            {cur.pitcherName && <span className="reel-cap-pitcher">vs {cur.pitcherName}</span>}
            {cur.description && <p className="reel-cap-des">{cur.description}</p>}
          </div>
          <div className="reel-controls">
            <button
              type="button"
              className="reel-nav"
              onClick={() => go(index - 1)}
              disabled={index === 0}
            >
              ‹ Prev
            </button>
            <button
              type="button"
              className="reel-nav"
              onClick={() => go(index + 1)}
              disabled={!hasNext}
            >
              Next ›
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="reel-empty">
          Loading highlights… {attempted}/{pas.length}
        </div>
      ) : (
        <div className="reel-empty">No video available for this game.</div>
      )}
    </div>
  );
}
