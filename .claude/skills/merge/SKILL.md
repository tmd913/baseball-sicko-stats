---
name: merge
description: Land work from parallel agents — one PR, many, or a stack of dependent ones, with worktrees to clean up after. Sequences the merges, resolves this repo's known conflict hotspots (CLAUDE.md, styles.css, App.tsx, the paired types.ts), rebuilds between each, and prunes stale worktrees and merged branches. Use when asked to merge, land, integrate, or ship branches/PRs, to resolve merge conflicts, or to clean up after running several agents at once.
---

# Merging parallel work

Several agents work at once here, each in its own worktree on a `worktree-<slug>`
branch cut from `main`. That produces N PRs that were all written against the *same*
base and have never seen each other. The whole difficulty of merging in this repo
follows from that one fact.

Work arrives in a second shape too — a **stack**, where each PR is based on the one
below because each was written on top of the last. It is the easier shape to merge
and the easier one to break: see §3a, and check `baseRefName` in the survey before
assuming which you have.

**There is no CI, no test runner and no linter.** No branch protection on `main`, no
GitHub Actions. So GitHub's `MERGEABLE` means *the text applies* — nothing more. The
only gate that exists is `npm run build` (`tsc -b && vite build`, then `tsc` for the
server), and the only place it can catch a cross-branch break is **after** the merge.
Which is why the loop below builds after every single merge and never batches them.

## 0. Survey before touching anything

```bash
gh pr list --state open --json number,title,headRefName,baseRefName,mergeable,mergeStateStatus,isDraft,additions,deletions
git worktree list
git -C . status --short && git log --oneline -1
```

Then, for each worktree that isn't the root:

```bash
git -C <worktree-path> status --short
git -C <worktree-path> log --oneline origin/main..HEAD
```

**Read `baseRefName` before anything else.** A PR based on another `worktree-*`
branch rather than on `main` is a **stack**, not a parallel branch, and almost
everything below changes shape — go to §3a first.

**A worktree with uncommitted changes may be an agent still working in it.** Do not
merge its branch, do not remove it, do not check anything out inside it. Ask the user
before going near a dirty worktree — the diff on disk is the only copy of that work.
Same for a branch whose PR is a draft: draft means not ready, take it at its word.

Report the picture to the user before merging: which PRs are open, which are clean,
which overlap, and the order you intend to use. Merging is hard to reverse once
pushed, so agree on the plan first.

## 1. Work out what actually overlaps

`mergeable` is computed against the current `main`, so the moment you merge one PR
every other answer is stale. Get the real picture up front by asking which branches
touch the same files:

```bash
for b in $(gh pr list --state open --json headRefName -q '.[].headRefName'); do
  echo "--- $b"
  git diff --name-only origin/main...origin/$b
done
```

Two branches sharing a filename are a *likely* conflict; two sharing none can still
break each other semantically (see the traps at the bottom). Sharing one of the
hotspot files below makes a conflict near-certain.

**This test is meaningless on a stack.** Each branch there contains every branch
below it, so a diff against `main` is cumulative and every pair "overlaps"
everything. Compare each branch to *its own base* instead — which is what its PR
diff already shows.

### Conflict hotspots, measured over the last 18 merged branches

| File | Branches touching it | Why it collides |
|---|---|---|
| `CLAUDE.md` | 16 of 18 | Every feature documents itself here |
| `client/src/styles.css` | 12 | Shared selector lists, and a load-bearing block order |
| `client/src/lib.ts` | 12 | Shared badge/format helpers |
| `client/src/App.tsx` | 10 | All top-level state and every URL param |
| `client/src/components/LiveFeed.tsx` | 10 | |
| `client/src/components/SummaryTable.tsx`, `PitcherCard.tsx` | 7 | |
| `client/src/types.ts` + `server/src/types.ts` | 5 | Hand-mirrored pair — see below |
| `client/tsconfig.tsbuildinfo` | 5 | A build artifact, tracked by mistake |

## 2. Order the merges

Merge **one at a time**, in this order:

1. **Anything already conflicting or nearly stale** — the longest-lived branch, or the
   one with the most commits behind `main`. Every merge you do makes it worse.
2. **The biggest / most structural** next. A 34-file branch rewrites the ground the
   others stand on; landing it first means the small ones rebase onto reality once,
   instead of the big one rebasing onto five small ones.
3. **Small, independent, single-file branches last.** They are cheap to fix up.

Two exceptions override the ordering:

- A PR the user wants first (a fix that has to ship) goes first.
- **Two branches that genuinely need each other's work should be merged into one
  another before either goes to `main`** — see §5.

## 3. The merge loop

For each PR, in the order you settled on:

```bash
gh pr view <N> --json title,body,headRefName,mergeStateStatus
gh pr merge <N> --merge --delete-branch
```

Use `--merge`, not squash or rebase: the history here is merge commits
(`Merge pull request #N from tmd913/worktree-…`) and each branch's own commits carry
the reasoning. `--delete-branch` is what stops the remote accumulating dead branches; skipping it
is how six of them once accumulated unnoticed. **If you are standing on the branch
you are merging**, move off it first (`git checkout main`) — `gh` cannot delete a
checked-out local branch, and it will leave it behind while the remote one goes.

Then, **before merging the next one**:

```bash
git checkout main && git pull
npm run build
```

**A failed build stops the loop.** Do not merge the next PR on top of a broken tree,
or you lose the ability to tell which branch broke it. This build is the entire
safety net; skipping it to save two minutes is how a broken `main` reaches a deploy.

Land the fix **as its own PR** — a `worktree-fix-<slug>` branch, a commit,
`gh pr create`, `gh pr merge --merge --delete-branch` — and only then resume the
loop. This used to say "fix it on `main` and commit"; work no longer lands here by a
direct commit to `main` (the user's call, 2026-08-10), and a cross-branch break is
exactly the change that most deserves a reviewable record of what broke and why.

If `gh pr merge` reports the branch is no longer mergeable, resolve it locally:

```bash
git checkout <branch> && git merge main     # merge main in, don't rebase a pushed branch
# ...resolve, per §4...
npm run build
git push
gh pr merge <N> --merge --delete-branch
```

Merge `main` **into** the branch rather than rebasing: these branches are pushed and
may have an agent or a review attached to them, and a rebase rewrites hashes under
both. Resolving on the branch also keeps the conflict resolution reviewable in the
PR, instead of burying it in a merge commit on `main`.

## 3a. Stacked PRs — do this before merging any of them

A stack is a chain: each PR is based on the branch below it rather than on `main`,
because each was written on top of the last. `baseRefName` in the survey is what
tells you. It is a different object from the parallel branches the rest of this
skill assumes, and merging it as though it weren't will close a PR.

First confirm the chain really is linear — each branch should contain the one below:

```bash
prev=origin/main
for b in <branch-1> <branch-2> <branch-3>; do   # bottom-up
  git merge-base --is-ancestor $prev origin/$b \
    && echo "OK    origin/$b contains ${prev#origin/}" \
    || echo "BREAK origin/$b does NOT contain $prev"
  prev=origin/$b
done
```

**Merge order is forced: bottom-up.** §2's heuristics do not apply — a stack can
only be landed in the order it was built.

**Conflicts should not exist**, and that is the one thing a stack makes easier: each
branch was written against the tip of the one below, so they cannot have diverged.
Four stacked PRs all touching `CLAUDE.md`, `ResearchTable.tsx` and `styles.css` —
three of the worst hotspots in the table above — merged with zero conflicts.

### Retarget every child to `main` before merging anything

```bash
gh pr edit <child> --base main     # for every PR in the stack except the bottom one
```

Then merge bottom-up exactly as §3 says, `--delete-branch` and all.

This is not tidiness, it is the whole point. **Deleting a branch closes any PR based
on it** — so `gh pr merge <bottom> --delete-branch` takes out the base of the next PR
up and GitHub closes it, `CONFLICTING/DIRTY`. It cannot then be reopened *or*
retargeted, because both operations need the base branch to exist:

```
GraphQL: Could not open the pull request. (reopenPullRequest)
GraphQL: Cannot change the base branch of a closed pull request. (updatePullRequest)
```

Retargeting up front means no PR is ever the base of another, and the deletion has
nothing to take with it. The temporarily-inflated diff GitHub shows on a child
retargeted ahead of its parent is cosmetic: by the time you merge it, `main` already
holds everything below it, and the merge is just its own commits.

### If it has already happened

No work is lost — the branch and its commits are untouched, only the PR record
closed. Push the deleted branch back at the merged commit's **second parent**, which
is the tip of the branch that was merged, then reopen, retarget, and let the ordinary
cleanup remove it at the end:

```bash
git push origin $(git rev-parse <merge-commit>^2):refs/heads/<deleted-branch>
gh pr reopen <child> && gh pr edit <child> --base main
```

A push straight after the deletion can fail on a race with it propagating; retry once
before believing it.

## 4. Resolving this repo's conflicts

Read `CLAUDE.md` on whatever you are resolving before you resolve it. Nearly every
hotspot here has a documented invariant, and the conflict markers won't mention it.

**The default is "keep both".** Two agents adding two different features are not
proposing alternatives — picking a side silently deletes a feature that has a merged
PR saying it shipped. Only pick a side when the two genuinely contradict, and say so
to the user when you do.

### `CLAUDE.md` — the most frequent, the least dangerous

Prose, so git conflicts on adjacent paragraph edits constantly. Almost always keep
both facts — but don't just concatenate the two hunks. This file is written as
flowing explanation, and two agents each amending the same paragraph produce
duplicated setup and sometimes contradictory claims ("four views" vs "five views").
Re-read the whole surrounding paragraph and write the merged version. Where both
branches changed a **count** in prose, recount it against the code rather than
trusting either side.

### `client/src/styles.css` — order is load-bearing

- The `@media (max-width: 640px)` narrow-screen block **must stay last in the file**
  — a media query adds no specificity, so it only wins by coming after the base rules
  it overrides. Resolving a conflict by appending new rules to the end of the file
  breaks it; new base rules go *above* that block. Check it rather than trusting a
  line number, which drifts every time the file grows:

  ```bash
  awk '/@media \(max-width: 640px\)/{l=NR} END{print "last 640px block: "l" of "NR}' \
    client/src/styles.css
  ```
- There are four `@media (max-width: 640px)` blocks in the file — check which one a
  hunk belongs to before moving it.
- This codebase deliberately **folds new controls into existing selector lists**
  (`.settings-toggle` into `.sim-toggle`'s, `.date-presets` into `.view-switch`'s) so
  the controls stay identical by construction. When two branches each add a selector
  to the same list, the resolution is **one list with both selectors**, not one of the
  two hunks.

### `client/src/App.tsx`

Holds all top-level state and persists the whole view in the URL query string. Two
branches each adding a param, a state hook and a settings-menu entry conflict in
three places for one feature. Keep both everywhere, and check the URL read/write
paths agree — a param that is written but never read back is a silent bug the build
cannot see.

### `client/src/types.ts` and `server/src/types.ts`

**These mirror each other by hand.** Five of the last eighteen branches changed both.
If you resolve a conflict in one, open the other and make the same resolution, even
where git reported no conflict there. A field kept on the server and dropped on the
client typechecks fine on both sides and fails at runtime.

### `client/tsconfig.tsbuildinfo`

**Never hand-merge this.** It is a generated build artifact — `*.tsbuildinfo` is in
`.gitignore`, but this one was committed before the rule was added, so git still
tracks it. Take either side and let the build regenerate it:

```bash
git checkout --ours client/tsconfig.tsbuildinfo && npm run build && git add client/tsconfig.tsbuildinfo
```

Worth offering the user the permanent fix, which removes a recurring conflict from
every future merge:

```bash
git rm --cached client/tsconfig.tsbuildinfo
```

## 5. When two branches need each other

Not the same as a stack (§3a). A stack is already ordered and cannot conflict with
itself; this is two *parallel* branches that turn out to collide.

If two open branches both build on the same thing — both add an entry to the settings
popover, both extend the same component — resolving `main` against each of them
separately means doing the same resolution twice and risking two different answers.

Merge one branch into the other first, resolve once, and let the combined branch go
to `main`. There is a precedent commit to follow for the message (`72858fd`): it
names both features, says *why* they collided, and states what the resolution chose
and on what reasoning.

```bash
git checkout <branch-b> && git merge <branch-a>
# resolve once, keeping both features
npm run build && git push
```

Then close the absorbed PR with a comment pointing at the one that now carries it, or
let it merge as an empty diff — but tell the user which you did.

## 6. Clean up

Only after the merges are in and `main` builds.

```bash
# worktrees whose branches have landed
git worktree list
git -C <path> status --short          # must be clean; skip it if not
git worktree remove <path>
git worktree prune

# local branches fully merged into main
git branch --merged main | grep -v '^\*\|main'

# remote branches that --delete-branch missed
for b in $(git ls-remote --heads origin | awk '{print $2}' | sed 's#refs/heads/##' | grep -v '^main$'); do
  git merge-base --is-ancestor origin/$b origin/main 2>/dev/null \
    && echo "MERGED   $b" || echo "UNMERGED $b"
done
```

Delete only what prints `MERGED`, and **list them for the user before deleting** —
an unmerged branch may be an agent's parked work.

```bash
git push origin --delete <branch> ...
```

This step is not hypothetical: six `worktree-*` branches had accumulated on the
remote before it was first run, all of them ancestors of `main`. The loop above is
what finds them, and re-running `--is-ancestor` immediately before deleting is what
makes the deletion safe — a branch can gain a commit between the survey and the
cleanup.

## 7. Report, and offer the deploy

Tell the user: which PRs landed and in what order, every conflict you resolved and
what you kept (especially anywhere you picked a side), the final `npm run build`
result, and what was cleaned up. Then note that nothing is live until it ships —
the `deploy` skill is the next step, and it starts from the working tree.

## Traps

- **Merging several PRs and building once at the end.** You lose the mapping from
  break to branch, and with no CI there is nothing else to recover it. Build between
  every merge.
- **`mergeable: MERGEABLE` is not "safe to merge".** It is a textual test against a
  `main` that changes under it. The dangerous case is two branches that merge cleanly
  and still break: one renames a helper in `lib.ts` while the other adds a caller of
  the old name; one changes a `PlayerGame` field while the other reads it. `tsc`
  catches most of that — but only after the merge, and only if you run it.
- **The silent semantic break `tsc` won't catch**: two branches editing the *paired*
  `types.ts` files, or a URL param written on one branch and read on another. Check
  both sides by hand.
- **`--delete-branch` on a stacked PR closes the PR above it.** Deleting a branch
  closes anything based on it, and a closed PR whose base is gone can be neither
  reopened nor retargeted. Retarget the children to `main` first — §3a.
- **Rebasing a pushed worktree branch** rewrites history an agent or reviewer may be
  sitting on. Merge `main` in instead.
- **Touching a dirty worktree.** Uncommitted changes there are unbacked-up work, and
  `git worktree remove` will refuse or destroy depending on flags. Ask first.
- **`git stash` is repo-global, not per-worktree.** One stack shared by every
  worktree, so a `pop` in one takes whatever entry is on top — including another
  agent's. Seen once: a `pop` pulled a second worktree's `chartScrub.tsx` and
  `styles.css` into the popping agent's tree. If it happens, nothing is lost yet
  — put the entry back at its original stack position rather than re-stashing,
  which would reorder the stack under whoever owns it:

  ```bash
  git stash store -m "<original message>" <sha of the popped entry>   # from the pop's output or `git fsck`
  git stash list                                                     # verify position and count
  ```

  The rule that avoids it is in `RULES.md`: commit to your own branch instead.
- **`DAY_SNAPSHOT_VERSION`, `FEED_CACHE_VERSION`, and the `-v3`/`-v4` storage keys.**
  If two branches each bumped the same version constant, the merged result must be a
  *single* bump past the higher of the two, not both edits kept and not the lower one
  chosen — a stale blob deserializes with the new fields missing and quietly costs
  every row those fields for six hours.
- **The season is hardcoded in seven places.** If a branch rolled the season over,
  confirm all seven survived the merge (`savant.ts`, `percentiles.ts`, `xwoba.ts`,
  `pitcherArsenal.ts`, `teamStats.ts`, `expectedStats.ts`, `research.ts`).
