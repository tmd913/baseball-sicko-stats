import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { PlateAppearance } from '../types';
import { playerKey } from '../types';
import { api } from '../api';
import {
  contactHighlight,
  eventLabel,
  finalSwingBatSpeed,
  headshotUrl,
  outcomeKind,
  surname,
} from '../lib';
import { useHandedness, usePlayerDoor } from '../hooks';
import { PlaySituation } from './BaseDiamond';
import { ClipVideo } from './ClipVideo';
import { Modal } from './Modal';
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
 * is a clip that lands *during* the session: today's miss is tomorrow's clip,
 * and the server only holds a miss for ten minutes, where this holds one for
 * the life of the tab. A reload is what drops it, there being no control in
 * the app that re-reads a page's sources wholesale.
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
    let canceled = false;
    setState('checking');
    lookupClip(playId, gamePk).then((resolved) => {
      if (canceled) return;
      setUrl(resolved);
      setState(resolved ? 'available' : 'unavailable');
    });
    return () => {
      canceled = true;
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
    let canceled = false;
    const known = clipUrls.get(clipKey(playId, gamePk));
    setUrl(known ?? null);
    setNear(false);
    // Already answered — and already rendered, this render.
    if (known !== undefined) return;
    lookupClip(playId, gamePk).then((resolved) => {
      if (!canceled) setUrl(resolved);
    });
    return () => {
      canceled = true;
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

/**
 * The heading a plate appearance's dialog carries: who, what and when.
 *
 * The card itself is one row in a list of them, so the row says the least it
 * can get away with; the dialog is a page about that one at-bat and has to say
 * whose it was, which the item's own header used to do from outside it.
 */
/**
 * **The dialog's title, and the inning is not in it any more.**
 *
 * It read `Aaron Judge — SINGLE · Top 7`, which said the inning in *words* at
 * the top of a box whose head already had room for it in the vocabulary this
 * app draws a half-inning in everywhere else — the glyph and the base diamond
 * the summary row itself carries. So the situation moved into the head, beside
 * the two faces (see `PlateAppearanceDetail`), and the title says what the trip
 * to the plate came to and who took it.
 *
 * That is one fact in one place rather than two: the header said `Top 7` and
 * the row that opened the box said it in a glyph, and a reader crossing between
 * them was reading the same thing twice in two vocabularies.
 */
function paTitle(pa: PlateAppearance, name?: string): string {
  return `${name ? `${name} — ` : ''}${eventLabel(pa.event)}`;
}

/**
 * One plate appearance: a summary row that **opens a dialog** holding the
 * description, the batted ball, the pitch sequence and the strike-zone plot.
 *
 * **It was an accordion and is now a popup**, which is the change this file
 * exists to record. An at-bat's detail is a *detail about one thing* — one trip
 * to the plate, its own pitches, its own zone — and an accordion pays for that
 * in the page around it: opening one in the feed pushed every item below it
 * down by three or four hundred pixels, which is why the card had to scroll
 * itself to the top on expand (`useScrollIntoViewOnExpand`, now gone from this
 * file), why the feed needed a "collapse all" float button to undo a session's
 * worth of them, and why App had to hold `feedOpenKeys` for a reading position
 * nobody asked to keep. A dialog costs the list nothing: the row stays where it
 * is, the detail takes a box with its own scroller, and Escape or the backdrop
 * puts it back.
 *
 * **The open state is local**, which is the other half of that. It was lifted
 * to App so a control at the bottom of the page could clear it; a dialog is one
 * at a time by construction, so there is nothing to clear and nothing to lift.
 *
 * **No caret** — the row is the affordance, which is this app's standing rule
 * for every collapsible and is no less true of a control that opens a box.
 */
export function PlateAppearanceCard({
  pa,
  gamePk,
  name,
  batterId,
  showVideo = true,
}: {
  pa: PlateAppearance;
  gamePk: number;
  /** Whose at-bat, for the dialog's heading and the batter half of its matchup
   *  head — the row itself sits under a header that has already said it. */
  name?: string;
  /**
   * **His MLB id, which the plate appearance itself does not carry.**
   *
   * It names the pitcher (`pitcherId`, `pitcherName`) and nobody else, because
   * a `PlateAppearance` is always read as *one man's* — it hangs off the
   * `PlayerReport` whose day it is, on all three surfaces that draw this card.
   * So the batter comes from the caller, which is where `name` has always come
   * from and for exactly the same reason, rather than being added to a field on
   * the wire that every stored day would then have to be re-fetched to fill.
   */
  batterId?: number;
  // When false, the dialog omits the (button-triggered) clip: the feed draws
  // the clip directly under the item, so the play is already watchable there
  // and a second copy in the box would be the same video twice.
  showVideo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const kind = outcomeKind(pa.event);
  const contact = contactHighlight(pa);
  const swingSpeed = finalSwingBatSpeed(pa);

  return (
    <div className={`pa-card kind-${kind}`}>
      <button
        type="button"
        className="pa-summary-row"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <PlaySituation
          inning={pa.inning}
          half={pa.half}
          bases={pa.onBase}
          outs={pa.outsWhenUp ?? 0}
        />
        <span className={`pa-badge kind-${kind}`}>{eventLabel(pa.event)}</span>
        {pa.rbi > 0 && <span className="pa-rbi">{pa.rbi} RBI</span>}
        {/* **The surname alone**, which is the rule every other place in this app
            names a pitcher beside a matchup already follows — the summary
            table's opponent cell and the feed's Upcoming bar both read
            `surname`. The row is a single line holding an inning glyph, a
            badge, an RBI mark, the contact figures and a bat speed, and a
            pitcher is referred to by surname anyway; the full name is in the
            dialog this row opens, at the head of it, beside his face. */}
        {pa.pitcherName && (
          <span className="pa-pitcher">
            vs {surname(pa.pitcherName)}
            {pa.pThrows ? ` (${pa.pThrows}HP)` : ''}
          </span>
        )}
        {contact && <span className="pa-contact-main">{contact}</span>}
        {swingSpeed !== null && (
          <span className="metric metric-bat">SW {swingSpeed.toFixed(1)} mph</span>
        )}
      </button>

      {open && (
        <Modal
          title={paTitle(pa, name)}
          titleId="pa-detail-title"
          className="play-detail-box"
          onClose={() => setOpen(false)}
        >
          <PlateAppearanceDetail
            pa={pa}
            gamePk={gamePk}
            name={name}
            batterId={batterId}
            showVideo={showVideo}
          />
        </Modal>
      )}
    </div>
  );
}

/**
 * One of the two men in the matchup head — his headshot, his name and what hand
 * he does it with, as a door into his page.
 *
 * **A door only where there is something behind it**, which is two tests and
 * not one: an id (a name off the wire with no id is nobody this app can open)
 * and a door in context (nothing outside `App`'s provider has one). Either
 * missing and the block is the same block drawn as plain text, which is the
 * rule `OpponentPress` and the MLB news list already keep — a press that does
 * nothing is worse than no press.
 *
 * **The headshot and the name are two presses, not one**, exactly as a roster
 * row and a feed item draw them: the circle and the word each open the page,
 * and a reader who aims at either has hit it.
 *
 * The hand line is the whole of what the dialog's old `pa-hand` row said
 * (`LHB vs Chris Bassitt (RHP)`), split between the two men it was about. Where
 * MLB names no hand — which happens on an old cached day — the sub-line falls
 * back to the role, so the block never loses the one word that says which of
 * the two this is.
 */
function PaMan({
  id,
  name,
  hand,
  note,
  role,
}: {
  id: number | null;
  name: string;
  /** `L`/`R` off the plate appearance, or null. */
  hand: string | null;
  note?: string | null;
  role: 'batter' | 'pitcher';
}) {
  const door = usePlayerDoor();
  // **The season roster answers where the play does not.** A plate appearance
  // carries `stand` and `pThrows`, and a batter faced carries only the batter's
  // — so the pitcher's half of a pitcher-side head would have no hand at all,
  // and an old cached day has neither. `useHandedness` is the map the whole app
  // reads a hand off (`PlayerIdentity`, the research board), keyed by person, so
  // the head asks it rather than being threaded a hand from four call sites.
  const known = useHandedness(id ?? 0);
  const hasHand = hand ?? (role === 'batter' ? known?.bats : known?.throws) ?? null;
  const [failed, setFailed] = useState(false);
  const open = door && id !== null ? () => door(playerKey({ id, kind: role })) : null;
  // **The surname alone**, which is how this app names a man beside a matchup
  // everywhere else — the summary table's opponent cell, the feed's Upcoming
  // bar, and the row this dialog opens from. The head is two names either side
  // of a `vs` on one line, and it is the *pairing* that is being read there:
  // `Peña vs Warren` is the sentence, where two full names are two labels. The
  // whole name is still on the page — the dialog's own title carries the
  // batter's, and either man's is one press away, on the page his face opens.
  const shown = surname(name);
  const sub = hasHand
    ? `${hasHand}H${role === 'batter' ? 'B' : 'P'}`
    : role === 'batter'
      ? 'Batter'
      : 'Pitcher';
  const photo =
    failed || id === null ? (
      <div className="pa-mu-photo pa-mu-photo-empty" aria-hidden="true" />
    ) : (
      <img
        className="pa-mu-photo"
        src={headshotUrl(id)}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  return (
    <span className={`pa-mu-man pa-mu-${role}`}>
      {open ? (
        <button
          type="button"
          className="pa-mu-photo-link"
          /* The **full** name here and on the `alt` below: a tooltip and an
             accessible name are the two places where nothing is being fitted
             onto a line, and a screen reader announcing `Warren` where the page
             holds two men would be the trim costing something real. */
          title={`${name} — Statcast details`}
          aria-label={`${name} — Statcast details`}
          onClick={open}
        >
          {photo}
        </button>
      ) : (
        photo
      )}
      <span className="pa-mu-id">
        {open ? (
          <button type="button" className="pa-mu-name pa-mu-press" title={name} onClick={open}>
            {shown}
          </button>
        ) : (
          <span className="pa-mu-name" title={name}>
            {shown}
          </span>
        )}
        <span className="pa-mu-hand">{sub}</span>
        {note && <span className="pa-mu-note">{note}</span>}
      </span>
    </span>
  );
}

/**
 * **Who faced whom**, at the head of a play's dialog: the batter, the pitcher,
 * and each one's face and page.
 *
 * **Two men rather than a `PlateAppearance`**, which is what lets the pitcher's
 * side of the app draw the same head: a batter faced (`FacedBatter`, the row
 * inside an inning) is the very same event read from the mound, and it names
 * the batter where the plate appearance names the pitcher. One implementation,
 * two adapters — the rule `categoryValue.ts` states for a figure, applied to a
 * block. Without it the two dialogs for one at-bat would be two heads that
 * agree today.
 *
 * **It replaces the `pa-hand` line**, which said the same facts in nine
 * characters of shorthand and one name (`LHB vs Chris Bassitt (RHP)`) and made
 * only the *pitcher* nameable — the batter being, on the feed, the man whose
 * header the item sat under, and on a dialog opened from anywhere else, nobody
 * at all. A plate appearance is one man against another and this is the one
 * place in the app that draws it as such; a reader who has just watched a clip
 * of it wants the man who threw it as much as the man who hit it, and until now
 * the pitcher's name here was text and his page was three navigations away.
 *
 * The pitcher's block is **mirrored** — name then face, reading inward — so the
 * two headshots sit either side of the `vs` rather than both to the left of
 * their names, which is the arrangement that says *these two are facing each
 * other* rather than *here are two players in a list*.
 */
export interface MatchupMan {
  id: number | null;
  name: string;
  /** `L`/`R` where the play carries it; null falls back to the season roster. */
  hand: string | null;
  /** **A third line under the hand**, on the one caller that has something to
   *  put there: the game page's Live tab, where it is the man's line for the
   *  game so far (`1-3 | HR`, `37 P · 3.0 IP, 2 K`). Absent everywhere else,
   *  and absent draws nothing rather than an empty row. */
  note?: string | null;
}

export function PlayMatchup({
  batter,
  pitcher,
  lead,
}: {
  batter: MatchupMan | null;
  pitcher: MatchupMan | null;
  /**
   * **Something ahead of the two faces**, on the one caller that has it: the
   * plate-appearance dialog puts the half-inning glyph, the base diamond and the
   * outs there, where the title used to say `· Top 7` in words.
   *
   * A slot rather than the situation itself, because this head has two callers
   * and the inning dialog's (`Innings.tsx`) is *already inside* a half-inning —
   * a graphic saying which one would be the box repeating its own heading.
   *
   * It is a child of the grid rather than a wrapper round it, so it takes the
   * head's own row, its centering and its bleeding rule for nothing. The grid
   * flows by column and sizes its own tracks, which is what lets it hold two,
   * three or four items without a template per case.
   */
  lead?: ReactNode;
}) {
  const left = batter ? <PaMan {...batter} role="batter" /> : null;
  const right = pitcher ? <PaMan {...pitcher} role="pitcher" /> : null;
  // Nothing to say and no box to say it in — the card's own rule for an absent
  // foot, one dialog up.
  if (!left && !right && !lead) return null;
  return (
    <div className="pa-matchup">
      {lead && <span className="pa-mu-lead">{lead}</span>}
      {left}
      {left && right && <span className="pa-mu-vs">vs</span>}
      {right}
    </div>
  );
}

/**
 * What the card's accordion used to hold: the matchup head (which was a line of
 * handedness shorthand), the description, the batted ball, the pitch table and
 * the strike zone.
 *
 * Its own component rather than inlined into the dialog, because the pitch
 * table and the zone share a hover/tap highlight and that state belongs to the
 * detail rather than to the row that opened it — a dialog closed and reopened
 * should not remember which pitch a finger was on last time.
 */
function PlateAppearanceDetail({
  pa,
  gamePk,
  name,
  batterId,
  showVideo,
}: {
  pa: PlateAppearance;
  gamePk: number;
  name?: string;
  batterId?: number;
  showVideo: boolean;
}) {
  const [activePitch, setActivePitch] = useState<number | null>(null);
  // Tap toggles a pin on touch/pen (no hover to rely on); tapping the same
  // pitch again clears it.
  const toggleActivePitch = (n: number) => setActivePitch((cur) => (cur === n ? null : n));
  const contact = contactHighlight(pa);
  return (
    <div className="pa-detail">
      <PlayMatchup
        batter={name ? { id: batterId ?? null, name, hand: pa.stand } : null}
        pitcher={pa.pitcherName ? { id: pa.pitcherId, name: pa.pitcherName, hand: pa.pThrows } : null}
        /* **The situation, where the title used to say the inning in words** —
           the same `PlaySituation` the summary row that opened this box draws,
           so the glyph a reader pressed is the glyph at the head of what it
           opened. `outsWhenUp` is the outs *this man came to the plate with*,
           which is what the row says and the only reading that is a fact about
           the at-bat rather than about what it did. */
        lead={
          <PlaySituation
            inning={pa.inning}
            half={pa.half}
            bases={pa.onBase}
            outs={pa.outsWhenUp ?? 0}
          />
        }
      />

      <div className="pa-body">
        <div className="pa-main">
          <p className="pa-des">{pa.description || '—'}</p>

          {contact && (
            <div className="pa-contact">
              <span className="pa-contact-main">{contact}</span>
              {pa.bbType && <span className="pa-bbtype">{pa.bbType.replace(/_/g, ' ')}</span>}
              {pa.xwoba !== null && <span className="pa-xwoba">xwOBA {pa.xwoba.toFixed(3)}</span>}
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
  );
}
