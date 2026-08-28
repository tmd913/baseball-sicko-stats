import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MAX_NAME_LEN } from '../types';
import type { SavedList, SavedSearch, SharedItem } from '../types';

/**
 * **The board's two saved things, and the one shape they share.**
 *
 * A **watchlist** is a saved set of players and a **search** is a saved reading
 * of the board. They are different payloads answering different questions, and
 * everything *around* them is the same: both are named, renamed, deleted and
 * shared, both live on the user's record, both are a button in the bar over a
 * panel in the head. So the rows, the rename, the share drawer and the armed
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
 * ### The actions are icon buttons on the row, and that is the third answer
 *
 * They were **three 12px glyphs** (`✎ ⤴ ✕`) jammed against the row's right
 * edge, and the paragraph that replaced them is worth keeping whole, because it
 * is what this drawing had to avoid repeating:
 *
 * *"They were wrong twice over. **They were unreadable** — a pencil at that size
 * against `--faint` is a smudge, and nothing said what any of them did until you
 * hovered, which a touch device never does. And **they were un-pressable**: a
 * 22×24px target, where this app's own icon buttons are 30px and its chips 28. A
 * fourth action (a search can be updated to the board it is looking at) had
 * nowhere to go at all… So a row is one press and one `⋯`. The press does the
 * row's own thing; the `⋯` opens a drawer under it — labeled chips, at the size
 * the column picker's own chips are, so nothing is guessed at and everything is
 * aimable."*
 *
 * **Both faults were size, and neither was iconography.** A glyph at 12px in a
 * 22×24 box is a smudge nobody can hit; the same glyph at 15px in this app's own
 * **30px** icon button is the shape the header's gear, the dialog's ✕ and the
 * roster's own remove button already are. So the actions come back onto the row
 * as icon buttons at that size, and the `⋯` and its menu drawer go: a drawer
 * whose whole content was four labels is a press spent on reaching the press.
 *
 * Rename and Share still open a drawer, because each is a *field* rather than a
 * press — the drawer is opened by its own icon now instead of by a chip inside
 * a menu, which is one gesture shorter to the same box.
 *
 * ### The two that destroy something keep their word
 *
 * **Delete arms rather than asks**, unchanged — the same gesture and the same
 * red (`--strikeout`) the roster's ✕ already uses, a confirm dialog for a thing
 * that takes two seconds to rebuild being a dialog nobody reads. What an icon
 * changes is how *armed* is said: this app's rule is that identity never rests
 * on hue, so a red ✕ cannot be the whole of it. `RemoveButton` answered this
 * already — it is a ✕ at rest and the **word** `Remove?` once armed, the button
 * widening to hold it — and this follows it exactly, at `Delete?`.
 *
 * **Updating a search arms too, and that is new.** It was a labeled chip in the
 * menu (`Update to this board`) and is an icon on the row, which makes the one
 * gesture here that *overwrites something* a single press on a 30px target
 * beside three that do not. So it takes the same two-press shape and the same
 * widening word, `Update?` — in the accent rather than the red, because it
 * replaces a reading rather than destroying a thing.
 */

/** Which row's drawer is open, and what it is showing. There is no `menu` any
 *  more — the two modes are the two actions that need a field, each opened by
 *  its own icon on the row. */
type Drawer = { id: string; mode: 'rename' | 'share' } | null;

/** The one half-pressed destructive control, by row id **and by which action** —
 *  a row has two of them now (a delete, and for a search an update that
 *  overwrites). One at a time across the whole panel, so arming anything
 *  disarms the last. State of the **panel**, which is unmounted when the panel
 *  shuts, so a panel re-opened never comes back with either half-pressed and no
 *  effect is needed to say so. */
type Armed = { id: string; act: 'delete' | 'update' } | null;

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

/** The share drawer for one row: the link, a copy button, and the way to stop. */
function ShareDrawer({
  kind,
  thing,
  onShare,
  onBack,
}: {
  kind: 'list' | 'search';
  thing: SavedThing;
  onShare: (id: string, enabled: boolean) => void;
  onBack: () => void;
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
      <div className="rl-drawer">
        <p className="rl-drawer-note">
          {kind === 'list'
            ? 'Anyone with the link sees who is on this list — your copy, so it stays current.'
            : 'Anyone with the link opens this reading of the board — your copy, so it stays current.'}
        </p>
        <div className="rl-acts">
          <button type="button" className="rl-act rl-act-go" onClick={() => onShare(thing.id, true)}>
            Create a link
          </button>
          <button type="button" className="rl-act" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="rl-drawer">
      {/* Readonly rather than disabled: a disabled input cannot be selected,
          and selecting the text by hand is the fallback when the clipboard is
          not available and the copy button has quietly failed. */}
      <input className="rl-link" readOnly value={link} onFocus={(e) => e.target.select()} />
      <div className="rl-acts">
        <button
          type="button"
          className="rl-act rl-act-go"
          onClick={() => {
            void copyText(link).then(setCopied);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" className="rl-act" onClick={() => onShare(thing.id, false)}>
          Stop sharing
        </button>
        <button type="button" className="rl-act" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

/** The rename drawer — the name as an input, committed on Enter or on Save. */
function RenameDrawer({
  thing,
  onRename,
  onBack,
}: {
  thing: SavedThing;
  onRename: (id: string, name: string) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(thing.name);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // Focus and select, so the commonest rename — replacing the whole name — is
    // one gesture.
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    const name = draft.trim();
    if (name && name !== thing.name) onRename(thing.id, name);
    onBack();
  };
  return (
    <div className="rl-drawer">
      <div className="rl-acts">
        <input
          ref={ref}
          className="rl-input"
          value={draft}
          maxLength={MAX_NAME_LEN}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter commits, Escape abandons — and Escape is stopped here so it
            // does not travel on and close the panel as well, which is the app's
            // "one press undoes one thing" applied inside a row.
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              onBack();
            }
          }}
          aria-label={`Rename ${thing.name}`}
        />
        {/* `onMouseDown` is prevented so the press does not blur the input out
            from under itself before the click lands. */}
        <button
          type="button"
          className="rl-act rl-act-go"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** One row of either panel: a press, its marks, and the drawer behind `⋯`. */
function Row({
  thing,
  active,
  count,
  kind,
  drawer,
  armed,
  onPick,
  onDrawer,
  onArm,
  onRename,
  onDelete,
  onShare,
  onReplace,
}: {
  thing: SavedThing;
  /** Lit, for the lists panel — the searches panel has no active row, a search
   *  being an action rather than a setting. */
  active?: boolean;
  /** How many players are on it; absent on a search. */
  count?: number;
  kind: 'list' | 'search';
  drawer: Drawer;
  armed: Armed;
  onPick: (id: string) => void;
  onDrawer: (d: Drawer) => void;
  onArm: (a: Armed) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onShare: (id: string, enabled: boolean) => void;
  /** Point this saved search at the board as it stands — searches only. */
  onReplace?: (id: string) => void;
}) {
  const open = drawer?.id === thing.id;
  const mode = open ? drawer.mode : null;
  const isList = kind === 'list';
  /* One armed control across the whole panel, so these are a test on the id
     *and* the action — a row can have two of them. */
  const deleteArmed = armed?.id === thing.id && armed.act === 'delete';
  const updateArmed = armed?.id === thing.id && armed.act === 'update';
  return (
    <li className={`rl-row${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}>
      <div className="rl-row-main">
        <button
          type="button"
          className="rl-pick"
          aria-pressed={isList ? !!active : undefined}
          onClick={() => onPick(thing.id)}
          title={
            isList
              ? active
                ? `“${thing.name}” is the list the star writes to`
                : `Make “${thing.name}” the list the star writes to`
              : `Apply “${thing.name}” to the board`
          }
        >
          {/* **A dot, reserved on every row.** The active list is tinted, and a
              tint alone puts identity on hue, which this app does not do.
              Reserved rather than conditional so every name starts at the same
              x whichever row is lit. */}
          {isList && <span className={`rl-dot${active ? ' is-on' : ''}`} aria-hidden="true" />}
          <span className="rl-name">{thing.name}</span>
          {thing.shareCode && (
            <span className="rl-shared-mark" title="Shared — a link opens this" aria-hidden="true">
              ⤴
            </span>
          )}
          {count !== undefined && <span className="rl-count">{count}</span>}
        </button>
        {/* **The row's actions, as icon buttons at the app's own 30px.** See the
            head of this file for why they are glyphs again and why that is not
            the 12px smudge this panel already threw out once. Each carries a
            `title` *and* an `aria-label`, which is the whole of what a wordless
            control owes: the tooltip for a pointer, the label for everything
            else, and neither of them the only copy. */}
        <div className="rl-icons">
          {/* **Update, and it arms** — the one press in this panel that
              overwrites a saved reading with the board underneath. It was a
              labeled chip two presses deep; on the row it is one press from a
              destroyed reading, so it takes the roster ✕'s two-press shape and
              widens to the word. The accent rather than the red: it replaces a
              reading, it does not destroy a thing. */}
          {onReplace && (
            <button
              type="button"
              className={`rl-icon rl-icon-update${updateArmed ? ' is-armed' : ''}`}
              title={
                updateArmed
                  ? `Press again to save this board over “${thing.name}”`
                  : `Save the board as it stands over “${thing.name}”`
              }
              aria-label={
                updateArmed
                  ? `Confirm saving this board over ${thing.name}`
                  : `Save this board over ${thing.name}`
              }
              onClick={() => {
                if (updateArmed) {
                  onArm(null);
                  onReplace(thing.id);
                } else {
                  onDrawer(null);
                  onArm({ id: thing.id, act: 'update' });
                }
              }}
            >
              {updateArmed ? (
                'Update?'
              ) : (
                /* A circular arrow closing onto its own head: *this one, again,
                   off what is on screen now*. Distinct at 15px from the pencil,
                   the share arrow and the ✕ beside it. */
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
                  <path d="M20 11.5a8 8 0 1 0-2.3 5.4" />
                  <path d="M20 5.5v6h-6" />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            className={`rl-icon${mode === 'rename' ? ' is-open' : ''}`}
            aria-expanded={mode === 'rename'}
            title={`Rename “${thing.name}”`}
            aria-label={`Rename ${thing.name}`}
            onClick={() => {
              onArm(null);
              onDrawer(mode === 'rename' ? null : { id: thing.id, mode: 'rename' });
            }}
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
              <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
              <path d="M14.5 6.5l3 3" />
            </svg>
          </button>
          {/* Lit while the link is live, the way the chip that replaced it said
              `Sharing` rather than `Share`: a wordless control still has to say
              the *state*, and here the ink is what says it — beside the `⤴` the
              row already wears when a share is out. */}
          <button
            type="button"
            className={`rl-icon${thing.shareCode ? ' is-on' : ''}${
              mode === 'share' ? ' is-open' : ''
            }`}
            aria-expanded={mode === 'share'}
            title={thing.shareCode ? `Sharing “${thing.name}”` : `Share “${thing.name}”`}
            aria-label={thing.shareCode ? `Sharing ${thing.name}` : `Share ${thing.name}`}
            onClick={() => {
              onArm(null);
              onDrawer(mode === 'share' ? null : { id: thing.id, mode: 'share' });
            }}
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
              <path d="M12 15V4" />
              <path d="m8 7.5 4-3.5 4 3.5" />
              <path d="M5 13v6h14v-6" />
            </svg>
          </button>
          {/* **Arms rather than asks**, and says so in a word — see the head of
              this file, and `RemoveButton`, which is the same two presses and
              the same red on the app's other destructive control. */}
          <button
            type="button"
            className={`rl-icon rl-icon-del${deleteArmed ? ' is-armed' : ''}`}
            title={
              deleteArmed
                ? `Press again to delete “${thing.name}”`
                : `Delete “${thing.name}”`
            }
            aria-label={
              deleteArmed ? `Confirm deleting ${thing.name}` : `Delete ${thing.name}`
            }
            onClick={() => {
              if (deleteArmed) {
                onArm(null);
                onDelete(thing.id);
              } else {
                onDrawer(null);
                onArm({ id: thing.id, act: 'delete' });
              }
            }}
          >
            {deleteArmed ? (
              'Delete?'
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* **`Back` closes the drawer where it used to return to the menu**, there
          being no menu behind it any more. One box, opened and shut by the icon
          that opens it — which is also what the icon's own second press does, so
          the two ways out agree. */}
      {mode === 'rename' && (
        <RenameDrawer
          thing={thing}
          onRename={onRename}
          onBack={() => onDrawer(null)}
        />
      )}
      {mode === 'share' && (
        <ShareDrawer
          kind={kind}
          thing={thing}
          onShare={onShare}
          onBack={() => onDrawer(null)}
        />
      )}
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
 *
 * **The caret is drawn rather than typed.** `▾` is a full-height character that
 * has to be shrunk to sit beside a 12px label, and at the 9px that took it
 * rendered as a dot — measured on the bar, where `Searches 2 ▾` read as
 * `Searches 2 ·`. This one is a 9×6 path by construction.
 */
export function SavedButton({
  label,
  title,
  count,
  open,
  onToggle,
  className,
  glyph,
}: {
  /** The word on the button, or absent for the caret-only half of a split,
   *  where the half beside it already names the thing. */
  label?: string;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  className?: string;
  glyph?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`research-toggle rl-btn-open${open ? ' active' : ''}${className ? ` ${className}` : ''}`}
      aria-expanded={open}
      /* **It raises a dialog now, not a row of the head.** `aria-expanded`
         alone says "there is more of this"; a reader on a screen reader who is
         about to have the page put behind a modal is owed the other half. It is
         the pair the accordion-to-popup sweep put on every control it moved —
         see `client-dialogs.md`. */
      aria-haspopup="dialog"
      aria-label={label ? undefined : title}
      title={title}
      onClick={onToggle}
    >
      {glyph}
      {label && <span className="research-toggle-label">{label}</span>}
      {count !== undefined && count > 0 && <span className="research-toggle-count">{count}</span>}
      <svg className="rl-caret" viewBox="0 0 10 6" width="9" height="6" aria-hidden="true">
        <path
          d="M1 1.2 5 4.8 9 1.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** The name of a new list or search, and the button that makes it. */
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
        className="rl-input"
        placeholder={placeholder}
        value={draft}
        maxLength={MAX_NAME_LEN}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        aria-label={placeholder}
      />
      <button type="button" className="rl-act rl-act-go" disabled={!draft.trim()} onClick={commit}>
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
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [armed, setArmed] = useState<Armed>(null);
  return (
    <div className="research-panel rl-panel">
      {/* **No heading of its own.** It carried `<p class="rl-head">Watchlists`
          while this was a row of the board's head, where nothing else said what
          the rows under it were. It is a dialog now and the dialog's title bar
          says exactly that word, so a heading here is the word twice — the same
          reading that turned `CardSection`'s bar into a plain label inside a box
          opened *for* it, and then into nothing at all under a tab strip that
          had just said it. `.rl-head` is kept for the empty-searches note's
          scale, which is the only thing still using it. */}
      <ul className="rl-rows">
        {lists.map((l) => (
          <Row
            key={l.id}
            kind="list"
            thing={l}
            count={l.keys.length}
            active={l.id === activeId}
            drawer={drawer}
            armed={armed}
            onPick={onPick}
            onDrawer={setDrawer}
            onArm={setArmed}
            onRename={onRename}
            onDelete={onDelete}
            onShare={onShare}
          />
        ))}
      </ul>
      <div className="rl-foot">
        <NewRow
          placeholder="New watchlist"
          cta="Add"
          disabled={lists.length >= max}
          disabledWhy={`You can keep at most ${max} watchlists — delete one to add another.`}
          onCreate={onCreate}
        />
        <p className="rl-note">
          The star on a row adds to the <strong>active</strong> list; the Watchlist button puts that
          list on the board.
        </p>
      </div>
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
 * `Update to this board` is a fourth action in the row's own drawer. It used to
 * be a duplicated run of pills at the foot of this panel — the same names,
 * listed twice, under a label — which is what a fourth action looks like when a
 * row has nowhere to put it. It stays a *separate press* from applying, because
 * saving over a search is the one gesture here that destroys something, and a
 * control that reads or writes depending on where in the row you press it is
 * the control this app's roster ✕ was rewritten to stop being.
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
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [armed, setArmed] = useState<Armed>(null);
  return (
    <div className="research-panel rl-panel">
      {/* The dialog's title says `Saved searches` — see the note in
          `ListsPanel` for why this box no longer says it a second time. */}
      {searches.length === 0 ? (
        <p className="rl-note">
          Nothing saved yet. A saved search remembers the position, the span, which players are
          included, the columns, the sort and every filter — name this board below and it comes back
          in one press.
        </p>
      ) : (
        <ul className="rl-rows">
          {searches.map((sv) => (
            <Row
              key={sv.id}
              kind="search"
              thing={sv}
              drawer={drawer}
              armed={armed}
              onPick={() => {
                onApply(sv);
                onClose();
              }}
              onDrawer={setDrawer}
              onArm={setArmed}
              onRename={onRename}
              onDelete={onDelete}
              onShare={onShare}
              onReplace={(id) => {
                onReplace(id);
                onClose();
              }}
            />
          ))}
        </ul>
      )}
      <div className="rl-foot">
        <NewRow
          placeholder="Name this board"
          cta="Save"
          disabled={searches.length >= max}
          disabledWhy={`You can keep at most ${max} saved searches — delete one to save another.`}
          onCreate={onSave}
        />
      </div>
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
 *
 * **Three parts on one line, in the order they are read**: what kind of thing
 * this is, its name, and the reassurance. They were one run of prose with the
 * name bolded inside it, which at 390 wrapped into a paragraph — and a bar over
 * a table has to be scannable in one glance rather than read.
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
        <span className="rl-shared-what">
          {isList ? 'Shared watchlist' : 'Opened from a shared search'}
        </span>
        <strong className="rl-shared-name">{shared.name}</strong>
        <span className="rl-shared-own">
          {shared.mine
            ? 'your own, over a link'
            : isList
              ? 'nothing of yours has changed'
              : 'the board is yours to change from here'}
        </span>
      </span>
      <span className="rl-shared-acts">
        <button
          type="button"
          className="rl-act rl-act-go"
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
        <button type="button" className="rl-act" onClick={onDismiss}>
          {isList ? 'Stop showing it' : 'Dismiss'}
        </button>
      </span>
    </div>
  );
}
