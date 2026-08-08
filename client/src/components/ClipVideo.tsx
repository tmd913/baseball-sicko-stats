import { useEffect, useRef, useState } from 'react';

/** No hover means no way to summon controls on demand — i.e. a touch screen. */
const NO_HOVER = '(hover: none)';

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
 * Note the tap handler is bound *only* while playing, i.e. only while the
 * controls are gone: with them up, a tap on the native play button can also
 * reach this element, and the clip would start and stop on the same touch.
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
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const hideControls = noHover && playing;
  return (
    /* eslint-disable-next-line jsx-a11y/media-has-caption */
    <video
      ref={ref}
      className={className}
      src={src}
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
      onClick={hideControls ? () => ref.current?.pause() : undefined}
    />
  );
}
