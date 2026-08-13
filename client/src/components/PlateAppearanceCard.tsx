import { useEffect, useRef, useState } from 'react';
import type { PlateAppearance } from '../types';
import { api } from '../api';
import { useScrollIntoViewOnExpand } from '../hooks';
import { contactHighlight, eventLabel, finalSwingBatSpeed, outcomeKind } from '../lib';
import { PlaySituation } from './BaseDiamond';
import { ClipVideo } from './ClipVideo';
import { PitchTable } from './PitchSequence';
import { StrikeZone } from './StrikeZone';

/**
 * Every clip the tab has already looked up: `playId:gamePk` → its URL, or null
 * where there is no clip. It is a **layout** cache as much as a network one.
 *
 * A clip's URL is resolved lazily, one request per play, and `InlineVideoClip`
 * renders nothing until its own answers — so the height of the feed is a
 * function of how many of its lookups have come back. Without this, every
 * remount (which is every tab switch) started that all over again: the feed
 * came back 1,890px shorter than it was left and grew as the answers landed,
 * which is exactly the growth App's scroll memory used to have to chase. With
 * it, a returning feed renders its clips in the very first commit and is the
 * page the reader left, at the height they left it — measured on a real
 * roster by sampling every frame across the swap, one height (4,529px) from
 * the first frame on, where before it was 2,639 growing into 4,529 as five
 * 360px clip frames landed.
 *
 * The misses are cached too, and for the same reason as the hits: they are the
 * plays whose lookup would otherwise be re-issued on every switch, and a miss
 * renders nothing whether it is remembered or asked for again. What that costs
 * is a clip that lands *during* the session (today's miss is tomorrow's clip,
 * and the server only holds a miss for ten minutes), so `clearClipCache` drops
 * the lot and the header's Refresh calls it — "read every source this page is
 * drawn from again" is exactly what that button means.
 */
const clipUrls = new Map<string, string | null>();
/** Lookups still in flight, so two cards for one play ask once. */
const clipLookups = new Map<string, Promise<string | null>>();

const clipKey = (playId: string, gamePk: number) => `${playId}:${gamePk}`;

function lookupClip(playId: string, gamePk: number): Promise<string | null> {
  const key = clipKey(playId, gamePk);
  const known = clipUrls.get(key);
  if (known !== undefined) return Promise.resolve(known);
  let pending = clipLookups.get(key);
  if (!pending) {
    pending = api
      .video(playId, gamePk)
      .then(
        (url) => url,
        () => null,
      )
      .then((url) => {
        clipUrls.set(key, url);
        clipLookups.delete(key);
        return url;
      });
    clipLookups.set(key, pending);
  }
  return pending;
}

/** Forget every resolved clip, so the next render asks again. */
export function clearClipCache() {
  clipUrls.clear();
  clipLookups.clear();
}

export function VideoClip({ playId, gamePk }: { playId: string; gamePk: number }) {
  const [state, setState] = useState<'checking' | 'available' | 'unavailable' | 'watching'>(
    'checking',
  );
  const [url, setUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  // When playback starts, bring the clip to the top of the screen (below the
  // sticky nav, via scroll-margin-top) so the whole player is in view — 'start'
  // rather than 'nearest' because the at-bat is often already scrolled to the
  // top when the clip opens, which left 'nearest' under-scrolling it.
  useEffect(() => {
    if (state === 'watching') {
      videoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    setState('checking');
    lookupClip(playId, gamePk).then((resolved) => {
      if (cancelled) return;
      setUrl(resolved);
      setState(resolved ? 'available' : 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, [playId, gamePk]);

  if (state === 'watching' && url) {
    return (
      <div className="pa-video" ref={videoRef}>
        <div className="pa-video-bar">
          <button className="pa-hide" onClick={() => setState('available')}>
            ✕ Hide video
          </button>
        </div>
        <ClipVideo className="pa-video-el" src={url} autoPlay />
      </div>
    );
  }
  if (state === 'available') {
    return (
      <button className="pa-watch" onClick={() => setState('watching')}>
        ▶ Watch
      </button>
    );
  }
  // 'checking' and 'unavailable' render nothing — no button for clips that
  // don't exist in either the official MLB highlights or the Savant fallback.
  return null;
}

/**
 * The clip shown directly — no "Watch" button, no autoplay — so the user can just
 * hit play. Used by the feed. Resolves the URL, then loads the clip's metadata
 * once it nears the viewport (`preload="metadata"`) so the first frame shows as a
 * preview at the clip's real size — deferred via IntersectionObserver so a feed
 * full of clips doesn't fetch them all at once. Renders nothing if there's no
 * clip; a placeholder holds the (16:9) frame until the video is near.
 */
export function InlineVideoClip({ playId, gamePk }: { playId: string; gamePk: number }) {
  // Seeded from the cache rather than fetched into: a clip this tab has
  // already looked up is part of the *first* commit, so a remounted feed has
  // the height it had when it was left instead of growing into it.
  const [url, setUrl] = useState<string | null>(() => clipUrls.get(clipKey(playId, gamePk)) ?? null);
  const [near, setNear] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const known = clipUrls.get(clipKey(playId, gamePk));
    setUrl(known ?? null);
    setNear(false);
    // Already answered — and already rendered, this render.
    if (known !== undefined) return;
    lookupClip(playId, gamePk).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [playId, gamePk]);

  // Load the first frame only once the clip is near the viewport.
  useEffect(() => {
    if (!url || near) return;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [url, near]);

  if (!url) return null;
  return (
    <div className="pa-video" ref={wrapRef}>
      {near ? (
        <ClipVideo
          // #t=0.1 seeks to the first frame so it paints as the poster (with
          // preload="metadata" a bare src often stays blank until played).
          className="pa-video-el pa-video-inline"
          src={`${url}#t=0.1`}
          preload="metadata"
        />
      ) : (
        <div className="pa-video-el pa-video-inline pa-video-ph" aria-hidden="true" />
      )}
    </div>
  );
}

export function PlateAppearanceCard({
  pa,
  gamePk,
  open,
  onToggle,
  autoScroll = true,
  showVideo = true,
}: {
  pa: PlateAppearance;
  gamePk: number;
  open: boolean;
  onToggle: () => void;
  // When false, expanding doesn't scroll the card itself into view — the caller
  // scrolls a larger wrapper instead (the feed scrolls the whole player+at-bat
  // item so the player header isn't left cut off above the viewport).
  autoScroll?: boolean;
  // When false, the card omits its own (expand-gated, button-triggered) clip —
  // the feed shows the clip directly below the card instead.
  showVideo?: boolean;
}) {
  const [activePitch, setActivePitch] = useState<number | null>(null);
  // Tap toggles a pin on touch/pen (no hover to rely on); tapping the same
  // pitch again clears it.
  const toggleActivePitch = (n: number) => setActivePitch((cur) => (cur === n ? null : n));
  const kind = outcomeKind(pa.event);
  const contact = contactHighlight(pa);
  const swingSpeed = finalSwingBatSpeed(pa);

  // On expand, bring this at-bat to the top of the screen so its detail isn't
  // left off-screen below the fold. Skipped when the caller owns the scroll.
  const cardRef = useScrollIntoViewOnExpand<HTMLDivElement>(autoScroll && open);

  return (
    <div ref={cardRef} className={`pa-card kind-${kind}${open ? ' expanded' : ''}`}>
      <button
        type="button"
        className="pa-summary-row"
        aria-expanded={open}
        onClick={onToggle}
      >
        <PlaySituation
          inning={pa.inning}
          half={pa.half}
          bases={pa.onBase}
          outs={pa.outsWhenUp ?? 0}
        />
        <span className={`pa-badge kind-${kind}`}>{eventLabel(pa.event)}</span>
        {pa.rbi > 0 && <span className="pa-rbi">{pa.rbi} RBI</span>}
        {pa.pitcherName && (
          <span className="pa-pitcher">
            vs {pa.pitcherName}
            {pa.pThrows ? ` (${pa.pThrows}HP)` : ''}
          </span>
        )}
        {contact && <span className="pa-contact-main">{contact}</span>}
        {swingSpeed !== null && (
          <span className="metric metric-bat">SW {swingSpeed.toFixed(1)} mph</span>
        )}
      </button>

      {open && (
        <div className="pa-detail">
          {(pa.pitcherName || (pa.stand && pa.pThrows)) && (
            <div className="pa-hand">
              {pa.pitcherName
                ? `${pa.stand ? `${pa.stand}HB ` : ''}vs ${pa.pitcherName}${
                    pa.pThrows ? ` (${pa.pThrows}HP)` : ''
                  }`
                : `${pa.stand}HB vs ${pa.pThrows}HP`}
            </div>
          )}

          <div className="pa-body">
            <div className="pa-main">
              <p className="pa-des">{pa.description || '—'}</p>

              {contact && (
                <div className="pa-contact">
                  <span className="pa-contact-main">{contact}</span>
                  {pa.bbType && <span className="pa-bbtype">{pa.bbType.replace(/_/g, ' ')}</span>}
                  {pa.xwoba !== null && (
                    <span className="pa-xwoba">xwOBA {pa.xwoba.toFixed(3)}</span>
                  )}
                </div>
              )}

              <PitchTable
                pitches={pa.pitches}
                activePitch={activePitch}
                onHover={setActivePitch}
                onTap={toggleActivePitch}
              />

              {showVideo && pa.playId && <VideoClip playId={pa.playId} gamePk={gamePk} />}
            </div>
            <StrikeZone
              pitches={pa.pitches}
              activePitch={activePitch}
              onHoverPitch={setActivePitch}
              onTapPitch={toggleActivePitch}
            />
          </div>
        </div>
      )}
    </div>
  );
}
