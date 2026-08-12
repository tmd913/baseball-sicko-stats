import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { useMuted } from '../hooks';

/** No hover means no way to summon controls on demand — i.e. a touch screen. */
const NO_HOVER = '(hover: none)';

/** How far one press of a skip button moves the clip, in seconds. */
const SEEK_STEP = 5;

/**
 * A skip forward stops this far short of the end rather than landing on it.
 * Setting `currentTime` to the duration fires `ended` there and then, which in
 * the highlight reel advances to the next at-bat — so a skip forward would read
 * as "next highlight", and there would be no way back to the play being
 * watched. A quarter second short, the clip plays out its own last frames and
 * ends because it ran out, which is the one ending everything downstream is
 * already written for. Paused, it holds on the final moment, which is what
 * "skip to the end" means.
 */
const SEEK_END_GUARD = 0.25;

/** True on a device with no hover (phones, tablets), reactively. */
function useNoHover(): boolean {
  const [noHover, setNoHover] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NO_HOVER).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(NO_HOVER);
    const onChange = () => setNoHover(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return noHover;
}

/** The rewind glyph — two triangles; the forward button flips it in CSS. */
function SeekIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M11 5v14L2 12zM22 5v14l-9-7z" />
    </svg>
  );
}

/**
 * Every clip in the app plays through this — the shared `<video>`, with the
 * native controls managed on touch devices.
 *
 * iOS keeps its control bar up for several seconds after playback starts, and a
 * baseball clip runs six to twelve: the bar sits across the bottom of the frame
 * — over the plate, where the play is — for much of the clip. Safari offers no
 * way to shorten that timeout, and with no hover there's nothing to bring the
 * controls back on demand either. So where there's no hover we drop `controls`
 * the moment the clip starts and put them back the moment it pauses or ends,
 * and a tap on a playing clip pauses it — the one gesture the hidden bar would
 * have handled. Anything with a pointer keeps the browser's own controls, which
 * already hide themselves while playing and return on hover.
 *
 * The pause-on-tap has to be armed on **`pointerdown`**, not decided when the
 * click arrives: the native controls live in the video's shadow DOM, so a tap on
 * its play button reaches this element too, and by the time that touch's `click`
 * is dispatched the `play` event has already flipped `playing` and re-rendered —
 * so a handler bound on "am I playing *now*?" is bound in time to catch the very
 * tap that started playback, and every clip stopped dead the instant it began.
 * Down-then-up is one gesture: if the finger went down while the controls were
 * up, that tap belongs to them, whatever the state is when it lifts.
 *
 * That is also why the frame carries its own **skip buttons**: with the native
 * bar gone there is no scrub bar on a phone at all, so the only way to see a
 * play again was to let the clip end and start it over. They sit on the frame
 * rather than inside the video, so they are siblings of the `<video>` and not
 * children of it — the shadow-DOM confusion that forced the pause-on-tap onto
 * `pointerdown` cannot arise, since a press on a button never reaches the
 * element's own handlers at all.
 */
export function ClipVideo({
  src,
  className,
  autoPlay,
  preload,
  onEnded,
}: {
  src: string;
  className?: string;
  autoPlay?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  onEnded?: () => void;
}) {
  const noHover = useNoHover();
  const prefMuted = useMuted();
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  // This clip's own audio state. The saved preference is its *starting* value,
  // not a rule over it.
  const [muted, setMuted] = useState(prefMuted);
  // Set once the viewer works this clip's audio — with the button below or with
  // the browser's own controls. From then on the preference leaves this clip
  // alone: "mute clips by default" is a default, and a viewer who has unmuted
  // one to hear a home run call shouldn't lose it because the toggle was
  // touched, or because some other part of the app re-read the preference.
  const audioTouched = useRef(false);
  useEffect(() => {
    if (!audioTouched.current) setMuted(prefMuted);
  }, [prefMuted]);
  // Belt and braces on top of the `muted` attribute below. React treats `muted`
  // as a property rather than an attribute and can miss it on the first mount,
  // which on an `autoPlay` clip is the one failure that matters — the setting
  // exists precisely so a clip can't start making noise on its own. A layout
  // effect runs before paint, so the element is never briefly live.
  useLayoutEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  /** Did this touch go down on the bare frame (controls hidden), i.e. is it ours? */
  const tapIsOurs = useRef(false);
  const hideControls = noHover && playing;
  const setAudio = (next: boolean) => {
    audioTouched.current = true;
    setMuted(next);
  };
  // The buttons hang off the *video's* box, and the wrapper is not it: two of
  // the three players leave slack on the right — the games-view clip sizes to
  // its own dimensions inside a full-width column, and the feed's frame is
  // capped at 640px — so a button at the wrapper's right edge would sometimes
  // sit beside the picture rather than on it. That is the very reason the mute
  // is on the left, which is the one edge all three share; the right edge has
  // to be measured. So the video's rendered width is published on the wrapper
  // as `--clip-w`, the way `useStickyChromeOffset` publishes `--chrome-h` —
  // there is no one number to declare, the clip's own dimensions arriving with
  // its metadata and the frame reflowing with the column.
  const wrapRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const video = ref.current;
    const wrap = wrapRef.current;
    if (!video || !wrap) return;
    const publish = () => wrap.style.setProperty('--clip-w', `${video.getBoundingClientRect().width}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(video);
    return () => ro.disconnect();
  }, []);
  /** Move by `delta` seconds, clamped into the clip. */
  const seek = (delta: number) => {
    const el = ref.current;
    if (!el) return;
    const wasEnded = el.ended;
    const { duration } = el;
    // No metadata yet means no duration to clamp against; the element clamps a
    // seek to what it can actually reach anyway.
    const end = Number.isFinite(duration) ? Math.max(0, duration - SEEK_END_GUARD) : Infinity;
    el.currentTime = Math.min(Math.max(el.currentTime + delta, 0), end);
    // A clip that has already ended is sitting on its last frame with the
    // controls back up, and skipping back on it plainly means "show me that
    // again" — so it resumes. A clip the viewer paused stays paused: they
    // stopped it on purpose, and a seek is not a request to start it.
    if (wasEnded && delta < 0) void el.play().catch(() => {});
  };
  // The press belongs to the button and to nothing above it — the feed and the
  // cards a clip sits in are full of toggles. Stopped on `pointerdown` as well
  // as on the click, since that is the phase this app arms things on (the
  // video's own tap-to-pause, the order editor's drag).
  const keepPress = (e: PointerEvent | MouseEvent) => e.stopPropagation();
  return (
    <div className="clip" ref={wrapRef}>
    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
    <video
      ref={ref}
      className={className}
      src={src}
      muted={muted}
      controls={!hideControls}
      autoPlay={autoPlay}
      preload={preload}
      playsInline
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => {
        setPlaying(false);
        onEnded?.();
      }}
      onPointerDown={() => {
        tapIsOurs.current = hideControls;
      }}
      onClick={() => {
        const ours = tapIsOurs.current;
        tapIsOurs.current = false;
        if (ours) ref.current?.pause();
      }}
      onVolumeChange={(e) => {
        // The browser's own controls can mute this clip too. Mirror that into
        // state so the button below agrees with the element, and count it as
        // the viewer having spoken. Our own write above fires this as well,
        // and lands here with the two already equal, so it falls straight out.
        const el = e.currentTarget;
        if (el.muted !== muted) setAudio(el.muted);
      }}
    />
      {/* Per-clip audio, on top of the frame. The browser's own mute is only
          reachable with a pointer — on a touch device the control bar is hidden
          for the whole time a clip is playing (see above), which with clips
          muted by default would leave no way to hear one at all. Top *left*: the
          native bar sits along the bottom, and the left edge is the one every
          one of the three players shares, whether it sizes to the clip or fills
          its column. */}
      <button
        type="button"
        className="clip-audio"
        onClick={() => setAudio(!muted)}
        aria-pressed={muted}
        aria-label={muted ? 'Unmute this clip' : 'Mute this clip'}
        title={muted ? 'Unmute this clip' : 'Mute this clip'}
      >
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          {muted ? (
            <path d="m16 9 5 6M21 9l-5 6" />
          ) : (
            <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
          )}
        </svg>
      </button>
      {/* Skip back / forward five seconds, at the top right — the corner the
          mute's own reasoning leaves free, and clear of the native bar along
          the bottom. On a phone the native controls are gone for the whole
          time a clip plays, so this is the only scrub there is. */}
      <div className="clip-seeks">
        <button
          type="button"
          className="clip-seek"
          onPointerDown={keepPress}
          onClick={(e) => {
            keepPress(e);
            seek(-SEEK_STEP);
          }}
          aria-label={`Skip back ${SEEK_STEP} seconds`}
          title={`Back ${SEEK_STEP}s`}
        >
          <SeekIcon />
          <span className="clip-seek-n">{SEEK_STEP}</span>
        </button>
        <button
          type="button"
          className="clip-seek clip-seek-fwd"
          onPointerDown={keepPress}
          onClick={(e) => {
            keepPress(e);
            seek(SEEK_STEP);
          }}
          aria-label={`Skip forward ${SEEK_STEP} seconds`}
          title={`Forward ${SEEK_STEP}s`}
        >
          <span className="clip-seek-n">{SEEK_STEP}</span>
          <SeekIcon />
        </button>
      </div>
    </div>
  );
}
