import { useEffect, useRef, useState } from 'react';
import type { PlateAppearance } from '../types';
import { api } from '../api';
import { eventLabel, outcomeKind } from '../lib';
import { answersEscape, useLockBodyScroll, useOverlayFocus } from '../hooks';
import { ClipVideo } from './ClipVideo';
import { LoadingBlock, SpinningBaseball } from './Loading';
import { BackButton } from './BackButton';

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
  // Same fixed full-screen overlay as PlayerDetails, so it needs the same lock:
  // without it the reel's scroll chains into the page behind and closing lands
  // the user away from the game they opened.
  useLockBodyScroll();
  const [clips, setClips] = useState<ReelClip[]>([]);
  // How many at-bats we've attempted to resolve so far (drives the loading
  // progress line while clips are still being fetched).
  const [attempted, setAttempted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  // The overlay box itself, read only to ask whether this press of Escape is
  // ours to answer.
  const viewRef = useRef<HTMLDivElement | null>(null);
  // The keyboard's half of covering the page — see `hooks.ts::useOverlayFocus`.
  // Without it Tab left the reel for the feed behind it, on the one overlay
  // whose own controls are a clip and two buttons and so runs out soonest.
  useOverlayFocus(viewRef);

  // Close on Escape, matching the details overlay — and through the shared test,
  // so the reel claims the press instead of leaving whatever it was opened over
  // to answer the same one. See `hooks.ts::answersEscape`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (answersEscape(e, viewRef.current)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Which reel this is, by its content rather than by the identity of the array
  // holding it. `pas` is rebuilt by the parent on every render, and App re-polls
  // the report every 20s while any game is live — so an effect keyed on the
  // array itself re-ran mid-reel, wiping `clips` and snapping playback back to
  // the first highlight unprompted. The play ids are what actually decide the
  // reel, and on a final game they never change.
  const reelKey = `${gamePk}:${pas.map((pa) => pa.playId ?? '').join(',')}`;
  // The at-bats are read through a ref so the resolver can take their captions
  // without listing the array as a dependency.
  const pasRef = useRef(pas);
  pasRef.current = pas;

  // Resolve each at-bat's clip URL in play order, appending as they arrive so
  // playback can begin on the first one while the rest are still resolving.
  // Sequential (not parallel) so the first request warms the server's per-game
  // highlight cache that the rest then hit, and so clips stay in order.
  useEffect(() => {
    let canceled = false;
    setClips([]);
    setAttempted(0);
    setLoading(true);
    setIndex(0);
    (async () => {
      const list = pasRef.current;
      const out: ReelClip[] = [];
      for (let i = 0; i < list.length; i++) {
        if (canceled) return;
        const pa = list[i];
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
            if (!canceled) setClips([...out]);
          } catch {
            // No clip for this at-bat — skip it.
          }
        }
        if (!canceled) setAttempted(i + 1);
      }
      if (!canceled) setLoading(false);
    })();
    return () => {
      canceled = true;
    };
  }, [reelKey, gamePk]);

  const cur = clips[index] ?? null;
  const hasNext = index < clips.length - 1;
  const go = (i: number) => setIndex(Math.max(0, Math.min(i, clips.length - 1)));

  return (
    <div className="reel-view" ref={viewRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${title} — highlights`}>
      <div className="reel-head">
        <BackButton onClose={onClose} />
        <div className="reel-id">
          <span className="reel-title">{title}</span>
          <span className="reel-sub">{subtitle} · Highlights</span>
        </div>
        {clips.length > 0 && (
          <span className="reel-progress">
            {Math.min(index + 1, clips.length)} / {clips.length}
            {/* The reel plays while the rest of its clips are still being
                resolved, so this is the one indicator in the app that sits
                beside a *growing* number rather than an absent one — a ball at
                the end of the count, where an ellipsis used to be. */}
            {loading && <SpinningBaseball />}
          </span>
        )}
      </div>

      {cur ? (
        <div className="reel-stage">
          {/* Keyed by playId so the element remounts per clip — that re-fires
              autoPlay when the reel advances to the next at-bat. */}
          <ClipVideo
            key={cur.playId}
            className="reel-video"
            src={cur.url}
            autoPlay
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
        <LoadingBlock>
          Finding the clips — {attempted} of {pas.length} plays
        </LoadingBlock>
      ) : (
        <div className="reel-empty">No video available for this game.</div>
      )}
    </div>
  );
}
