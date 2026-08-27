import { useEffect, useRef, useState } from 'react';
import type { SavedList, SavedSearch, SharedItem } from '../types';

/**
 * **The board's two saved things, and the one shape they share.**
 *
 * A **watchlist** is a saved set of players and a **search** is a saved reading
 * of the board. They are different payloads answering different questions, and
 * everything *around* them is the same: both are named, renamed, deleted and
 * shared, both live on the user's record, both are a button in the bar over a
 * panel in the head. So the rows, the rename, the share panel and the armed
 * delete are written once and configured twice, rather than as two components
 * that will drift — the rule this codebase applies to a stylesheet (`fold,
 * don't restyle`) read forwards into a component that does not exist yet.
 *
 * What is genuinely different is where each sits and what pressing a row does:
 *
 * - The **lists** button is in the *which players* run, welded to the Watchlist
 *   toggle, because a watchlist is a set of players. Pressing a row makes that
 *   list **active** — the list the star writes to and the toggle unions on —
 *   which is a *setting*, so the panel stays open and the row lights.
 * - The **searches** button is in the *tools* run, after the controls it stands
 *   in for, because a saved search is a reading of the board. Pressing a row
 *   **applies** it, which is an *action*: it replaces the position, span, sets,
 *   columns, sort and filters in one go, so the panel closes and the reader is
 *   looking at the result.
 *
 * ### On the row actions, and why they are inline rather than a dialog
 *
 * Renaming, sharing and deleting are three small things done to one row, and
 * each of them opened as a modal would put a dialog over a panel over a bar —
 * three layers deep to type six characters. So a row **expands in place**: the
 * name becomes an input, or the share link appears under it. The head is
 * measured (`--research-head-h`), so an expanded row moves the column headings
 * and the sort's scroll target with it without being told anything.
 *
 * The one thing that is *not* inline is the delete, which arms rather than
 * asks: the first press turns the button red and the second does it. Same
 * gesture the roster's own ✕ uses (`RemoveButton`), and for the same reason —
 * a confirm dialog for a thing that takes two seconds to rebuild is a dialog
 * nobody reads.
 */

/** How a row's expanded state is drawn — one at a time, so opening the share
 *  panel on one row closes the rename input on another. */
type RowMode = { id: string; mode: 'rename' | 'share' } | null;

/** A press that arms and then acts, by row id. Both this and `RowMode` are
 *  state of the **panel**, which is unmounted when the panel shuts — so a panel
 *  re-opened never comes back with a delete half-pressed or an input still
 *  expanded, and no effect is needed to say so. */
type Armed = string | null;

export interface SavedThing {
  id: string;
  name: string;
  shareCode?: string;
}

/**
 * The link a share code opens.
 *
 * Built from `window.location` rather than from a configured origin, because
 * this app is served from one place and the link a reader copies has to work
 * from wherever they are reading — a preview deployment, a phone on the LAN,
 * localhost. The param names are the client's own (`wl` / `rs`), and the whole
 * of the rest of the query is dropped: a shared link describes the shared thing
 * and nothing about the date range or the tab the sharer happened to be on.
 */
export function shareLink(kind: 'list' | 'search', code: string): string {
  const p = new URLSearchParams();
  p.set('view', 'research');
  p.set(kind === 'list' ? 'wl' : 'rs', code);
  return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
}

/**
 * Copy to the clipboard, with the one fallback that actually matters.
 *
 * `navigator.clipboard` is unavailable on an insecure origin — which is every
 * `http://` dev server and every phone reading one over the LAN, i.e. exactly
 * where this gets exercised. The fallback is a hidden textarea and
 * `execCommand`, deprecated and still the only thing that works there. Returns
 * whether it went, so the caller can say `Copied` rather than assume it.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through — a rejected permission is the same as not having the API.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Off-screen rather than `display: none`: a hidden element cannot be
    // selected, and selection is the whole mechanism here.
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** The share panel for one row: the link, a copy button, and the way to stop. */
function SharePanel({
  kind,
  thing,
  onShare,
}: {
  kind: 'list' | 'search';
  thing: SavedThing;
  onShare: (id: string, enabled: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = thing.shareCode ? shareLink(kind, thing.shareCode) : null;
  // The `Copied` mark is a mark on a control and goes away by itself; it is not
  // a wait, so it does not go through `MIN_SPIN`.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  if (!link) {
    return (
      <div className="rl-share">
        <p className="rl-share-note">
          {kind === 'list'
            ? 'Anyone with the link can see who is on this list. They read your copy, so it stays current as you change it.'
            : 'Anyone with the link can open this reading of the board. They read your copy, so it stays current as you change it.'}
        </p>
        <button type="button" className="rl-btn rl-btn-go" onClick={() => onShare(thing.id, true)}>
          Create a link
        </button>
      </div>
    );
  }
  return (
    <div className="rl-share">
      {/* Readonly rather than disabled: a disabled input cannot be selected,
          and selecting the text by hand is the fallback when the clipboard is
          not available and the copy button has quietly failed. */}
      <input className="rl-share-link" readOnly value={link} onFocus={(e) => e.target.select()} />
      <div className="rl-share-row">
        <button
          type="button"
          className="rl-btn rl-btn-go"
          onClick={() => {
            void copyText(link).then(setCopied);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" className="rl-btn" onClick={() => onShare(thing.id, false)}>
          Stop sharing
        </button>
      </div>
    </div>
  );
}

/** One row of either menu. */
function Row({
  thing,
  active,
  count,
  kind,
  mode,
  armed,
  onPick,
  onMode,
  onArm,
  onRename,
  onDelete,
  onShare,
}: {
  thing: SavedThing;
  /** Lit, for the lists menu — the searches menu has no active row, a search
   *  being an action rather than a setting. */
  active?: boolean;
  /** How many players are on it; absent on a search. */
  count?: number;
  kind: 'list' | 'search';
  mode: RowMode;
  armed: Armed;
  onPick: (id: string) => void;
  onMode: (m: RowMode) => void;
  onArm: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string, enabled: boolean) => void;
}) {
  const renaming = mode?.id === thing.id && mode.mode === 'rename';
  const sharing = mode?.id === thing.id && mode.mode === 'share';
  const [draft, setDraft] = useState(thing.name);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!renaming) return;
    setDraft(thing.name);
    // Focus and select, so the commonest rename — replacing the whole name —
    // is one gesture.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming, thing.name]);

  const commit = () => {
    const name = draft.trim();
    if (name && name !== thing.name) onRename(thing.id, name);
    onMode(null);
  };

  return (
    <li className={`rl-row${active ? ' is-active' : ''}`}>
      <div className="rl-row-main">
        {renaming ? (
          <input
            ref={inputRef}
            className="rl-rename"
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter commits, Escape abandons — and Escape is stopped here so
              // it does not travel on and close the popover as well, which is
              // the app's "one press undoes one thing" applied inside a row.
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                onMode(null);
              }
            }}
            onBlur={commit}
            aria-label="Name"
          />
        ) : (
          <button
            type="button"
            className="rl-pick"
            aria-pressed={kind === 'list' ? !!active : undefined}
            onClick={() => onPick(thing.id)}
            title={
              kind === 'list'
                ? 'Make this the list the star writes to'
                : 'Apply this reading to the board'
            }
          >
            <span className="rl-name">{thing.name}</span>
            {count !== undefined && <span className="rl-count">{count}</span>}
            {thing.shareCode && (
              <span className="rl-shared-mark" title="Shared — a link opens this" aria-hidden="true">
                ⤴
              </span>
            )}
          </button>
        )}
        <div className="rl-row-tools">
          <button
            type="button"
            className={`rl-icon${renaming ? ' is-on' : ''}`}
            title="Rename"
            aria-label={`Rename ${thing.name}`}
            onClick={() => onMode(renaming ? null : { id: thing.id, mode: 'rename' })}
          >
            ✎
          </button>
          <button
            type="button"
            className={`rl-icon${sharing ? ' is-on' : ''}${thing.shareCode ? ' is-shared' : ''}`}
            title={thing.shareCode ? 'Shared — get the link' : 'Share'}
            aria-label={`Share ${thing.name}`}
            onClick={() => onMode(sharing ? null : { id: thing.id, mode: 'share' })}
          >
            ⤴
          </button>
          {/* **Arms rather than asks** — see the note at the head of this file. */}
          <button
            type="button"
            className={`rl-icon rl-del${armed === thing.id ? ' is-armed' : ''}`}
            title={armed === thing.id ? 'Press again to delete' : 'Delete'}
            aria-label={
              armed === thing.id ? `Press again to delete ${thing.name}` : `Delete ${thing.name}`
            }
            onClick={() => {
              if (armed === thing.id) {
                onArm(null);
                onDelete(thing.id);
              } else {
                onArm(thing.id);
              }
            }}
          >
            {armed === thing.id ? 'Delete?' : '✕'}
          </button>
        </div>
      </div>
      {sharing && <SharePanel kind={kind} thing={thing} onShare={onShare} />}
    </li>
  );
}

/**
 * **The button in the run, and the panel it opens — and they are two exports
 * rather than one component, because they are drawn in two different boxes.**
 *
 * This is the board's own rule and it was learned the hard way: a panel drawn
 * inside the control set is drawn inside `.tool-scroll-box`, which scrolls
 * horizontally and therefore **clips on both axes**. Written as a popover
 * hanging off its button, this control measured a perfectly sensible
 * 268×322 box at `x: 140, y: 160` and painted **nothing at all** — the rect is
 * computed whether or not the ancestor clips it. And even unclipped it would
 * have the fault `client-research.md` records for Search and Filters: the bar
 * scrolls away and the condensed run replaces it, so a panel anchored to the
 * bar opens hundreds of pixels above the top of the pane.
 *
 * So the panels go where every other panel on this board goes — `.research-head`,
 * the one box here rendered at every offset that also sticks — and the buttons
 * stay in the run. `ResearchUi.panels` is what joins them, which also buys the
 * exclusivity for free: `setPanel` shuts the others, so opening Lists closes
 * Filters exactly as opening Filters closes Search.
 */
export function SavedButton({
  label,
  title,
  count,
  open,
  onToggle,
}: {
  label: string;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`research-toggle rl-btn-open${open ? ' active' : ''}`}
      aria-expanded={open}
      title={title}
      onClick={onToggle}
    >
      <span className="rl-open-label">{label}</span>
      {count !== undefined && count > 0 && <span className="research-count">{count}</span>}
      <span className="rl-caret" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}

/** A name being typed for a new list or search, with its own commit rules. */
function NewRow({
  placeholder,
  cta,
  disabled,
  disabledWhy,
  onCreate,
}: {
  placeholder: string;
  cta: string;
  disabled: boolean;
  disabledWhy: string;
  onCreate: (name: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const name = draft.trim();
    if (!name) return;
    onCreate(name);
    setDraft('');
  };
  if (disabled) return <p className="rl-note">{disabledWhy}</p>;
  return (
    <div className="rl-new">
      <input
        className="rl-rename"
        placeholder={placeholder}
        value={draft}
        maxLength={60}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        aria-label={placeholder}
      />
      <button
        type="button"
        className="rl-btn rl-btn-go"
        disabled={!draft.trim()}
        onClick={commit}
      >
        {cta}
      </button>
    </div>
  );
}

export interface ListsPanelProps {
  lists: SavedList[];
  activeId: string;
  max: number;
  onPick: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string, enabled: boolean) => void;
}

/**
 * **The watchlist chooser.**
 *
 * The Watchlist toggle in the bar is unchanged and does what it always did —
 * union the watchlist onto the board — and it now *names* the list it is about,
 * because with several lists "Watchlist" says which of them only by not saying.
 * This panel is where that is changed, and where a list is made, renamed,
 * shared or thrown away.
 *
 * The button beside the toggle is a **separate target**, welded to it by the
 * stylesheet: pressing a button that both toggles a set and opens a panel is a
 * control the reader cannot aim, the two answers being different sizes and one
 * pixel apart.
 *
 * Pressing a row makes that list **active** and leaves the panel open, because
 * choosing a list is a *setting* — the row lights, the button above renames
 * itself, and the reader can go straight on to rename or share it. That is the
 * one place this parts from the searches panel below.
 */
export function ListsPanel({
  lists,
  activeId,
  max,
  onPick,
  onCreate,
  onRename,
  onDelete,
  onShare,
}: ListsPanelProps) {
  const [mode, setMode] = useState<RowMode>(null);
  const [armed, setArmed] = useState<Armed>(null);
  return (
    <div className="research-panel rl-panel">
      <p className="rl-head">Watchlists</p>
      <ul className="rl-rows">
        {lists.map((l) => (
          <Row
            key={l.id}
            kind="list"
            thing={l}
            count={l.keys.length}
            active={l.id === activeId}
            mode={mode}
            armed={armed}
            onPick={onPick}
            onMode={setMode}
            onArm={setArmed}
            onRename={onRename}
            onDelete={onDelete}
            onShare={onShare}
          />
        ))}
      </ul>
      <NewRow
        placeholder="New watchlist"
        cta="Add"
        disabled={lists.length >= max}
        disabledWhy={`You can keep at most ${max} watchlists — delete one to add another.`}
        onCreate={onCreate}
      />
      <p className="rl-note">
        The star on a row adds to the <strong>active</strong> list, and the Watchlist button puts
        that list on the board.
      </p>
    </div>
  );
}

export interface SearchesPanelProps {
  searches: SavedSearch[];
  max: number;
  onApply: (search: SavedSearch) => void;
  onSave: (name: string) => void;
  /** Point an existing search at the board as it stands. */
  onReplace: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string, enabled: boolean) => void;
  /** Applying closes the panel — see below for why this one does and the lists
   *  panel does not. */
  onClose: () => void;
}

/**
 * **The saved-search panel.**
 *
 * Pressing a row **applies** it and **closes the panel**, which is the one
 * place this parts from the lists panel: a search is an *action* and its
 * result is the board underneath, so leaving the panel open would hide the very
 * thing the press did. Choosing a list is a setting and its result is the row
 * lighting, which is inside the panel.
 *
 * `Update one to this board` is a second action and is deliberately **not** the
 * same press as applying. Saving over a search is the one gesture here that
 * destroys something, and a control that reads or writes depending on where in
 * the row you press it is the control this app's roster ✕ was rewritten to stop
 * being.
 */
export function SearchesPanel({
  searches,
  max,
  onApply,
  onSave,
  onReplace,
  onRename,
  onDelete,
  onShare,
  onClose,
}: SearchesPanelProps) {
  const [mode, setMode] = useState<RowMode>(null);
  const [armed, setArmed] = useState<Armed>(null);
  return (
    <div className="research-panel rl-panel">
      <p className="rl-head">Saved searches</p>
      {searches.length === 0 ? (
        <p className="rl-note">
          Nothing saved yet. A saved search remembers the position, the span, which players are
          included, the columns, the sort and every filter — name this board below and it comes
          back in one press.
        </p>
      ) : (
        <ul className="rl-rows">
          {searches.map((sv) => (
            <Row
              key={sv.id}
              kind="search"
              thing={sv}
              mode={mode}
              armed={armed}
              onPick={() => {
                onApply(sv);
                onClose();
              }}
              onMode={setMode}
              onArm={setArmed}
              onRename={onRename}
              onDelete={onDelete}
              onShare={onShare}
            />
          ))}
        </ul>
      )}
      {searches.length > 0 && (
        <div className="rl-replace">
          <span className="rl-replace-label">Update one to this board:</span>
          <div className="rl-replace-row">
            {searches.map((sv) => (
              <button
                key={sv.id}
                type="button"
                className="rl-btn rl-replace-btn"
                title={`Replace “${sv.name}” with the board as it stands`}
                onClick={() => {
                  onReplace(sv.id);
                  onClose();
                }}
              >
                {sv.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <NewRow
        placeholder="Name this board"
        cta="Save"
        disabled={searches.length >= max}
        disabledWhy={`You can keep at most ${max} saved searches — delete one to save another.`}
        onCreate={onSave}
      />
    </div>
  );
}

/**
 * **The bar that says you are reading somebody else's.**
 *
 * The app's rule is that an empty state names its own cause and the control
 * that caused it; this is that rule applied to a state that is not empty but is
 * *not yours* — the board looks entirely ordinary, and without this there is
 * nothing on screen to say the rows came out of a link.
 *
 * **The two wordings are different tenses, and the difference is honest.** A
 * shared **watchlist** is live: its keys are on the board right now, and
 * changing the sort does not stop that being true, so it reads *Showing*. A
 * shared **search** is a reading that was *applied* — the board's state is now
 * the reader's own to change, and a banner claiming they are "using" it would
 * go on claiming so after they had re-sorted and re-filtered it into something
 * else. So it reads *Opened from*, which stays true.
 *
 * Both offer the same two ways out, and they are the two things a reader wants:
 * keep it (`Save as my own` — a **copy**, which stops tracking the owner's) or
 * be rid of it. Neither has touched anything of theirs to get here, which is
 * the property the whole design is arranged around: a shared thing lives in the
 * URL and nowhere else.
 */
export function SharedNotice({
  shared,
  saving,
  onSaveAsMine,
  onDismiss,
}: {
  shared: SharedItem;
  saving: boolean;
  onSaveAsMine: () => void;
  onDismiss: () => void;
}) {
  const isList = shared.kind === 'list';
  return (
    <div className="rl-shared" role="status">
      <span className="rl-shared-icon" aria-hidden="true">
        ⤴
      </span>
      <span className="rl-shared-text">
        {isList ? 'Showing a shared watchlist' : 'Opened from a shared search'}
        {' · '}
        <strong>{shared.name}</strong>
        {shared.mine ? (
          <span className="rl-shared-own"> — your own, over a link</span>
        ) : isList ? (
          <span className="rl-shared-own"> — nothing of yours has changed</span>
        ) : null}
      </span>
      <span className="rl-shared-acts">
        <button
          type="button"
          className="rl-btn rl-btn-go"
          disabled={saving}
          onClick={onSaveAsMine}
          title={
            isList
              ? 'Copy these players into a watchlist of your own'
              : 'Save this reading as one of your own searches'
          }
        >
          {saving ? 'Saving…' : 'Save as my own'}
        </button>
        <button type="button" className="rl-btn" onClick={onDismiss}>
          {isList ? 'Stop showing it' : 'Dismiss'}
        </button>
      </span>
    </div>
  );
}
