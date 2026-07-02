# FGS: Unify Game Creation Around VibeCode (+ correctness & coherence)

## Context

This session consolidated FGS game provisioning onto Path B (R2 + D1 host route +
registry via admin `handlePublish`) and rewrote `/api/me` and the VibeCode agent
deploy. Testing surfaced a confusing UX ("after creating a game it goes back to
'create a new game'"), which prompted a coherence review. Three read-only audits
(frontend, provisioning backend, identity) verified the state and found 17 concrete
inconsistencies with 3 root causes. Two design agents then produced backend +
frontend implementation plans. The chosen direction: **full unification around
VibeCode** as the single create→build→publish flow.

**Verdict on the earlier work:** no structural damage — the provisioning backend is
coherent and better than before, but only for *registry/route writes*; repo creation
is still two paths producing different game contents. The "create again" loop's
dominant cause is a **frontend refetch bug**, not the collaborator-invite gap first
blamed.

## Shared model (backend + frontend agree)

- A **game** = its registry entry id = repo `freegamestore-online/<id>`. Registry
  **`creatorGithub`** is the sole ownership signal (case-insensitive).
- **Opening a game in VibeCode** = a session bound to `<id>` whose `files` are the
  **real repo contents** (imported), so editing/`push_update` never overwrites.
- **"New game"** (from anywhere) provisions through the ONE canonical path: admin
  `handlePublish` generating from `template-game-canvas`. VibeCode stops building its
  own scaffold.

## 3 root causes (fixing these collapses most symptoms)

1. Ownership is GitHub-collaborator-based (lags via pending invites) instead of
   registry-based → games invisible after create, slot-count mismatches, publish-403.
2. Frontend never refreshes the game list (`onCreated={refetch}` hits `/auth/me`, and
   `fetchCreator` is guarded `if (creator) return`, `useAuth.ts:126`) and the create
   form dead-ends (`CreateGameForm.tsx` "Done"→`resetForm`, `showForm` never cleared).
3. No deterministic `APPNAME` substitution anywhere (games ship titled "APPNAME");
   the committed template also fails its own `compliance.yml` on every provision.

---

## Plan — sequenced in waves (land + verify each before the next)

### Wave A — correctness & cleanup (independent, low-risk, mostly parallel)

**A1. Template compliance false-fail.** `templates/template-game-canvas/.github/
workflows/compliance.yml:71` greps `web/src/` for `freegamestore.online` (the link is
SDK-provided, in node_modules) → red X every provision. Change the grep target to the
built bundle: `grep -rq "freegamestore.online" web/dist/` (after the existing Build
step). Template-repo only.

**A2. Admin provision correctness** (`admin/src/publish.ts`, `index.ts`):
- Write `firstPublished: <ISO>` on first registry add (`publish.ts:288-301`), preserve
  on re-add → `me.ts` `createdAt` populates (finding 10).
- Make `handleUpdateGame` ownership compare case-insensitive; drop `developer` as an
  ownership signal (`publish.ts:372`). Editable iff `creatorGithub` matches the viewer
  (finding 9).
- Move the `VALID_GH_LOGIN` check to the top of `handlePublish` (after `validateId`)
  and mirror at `index.ts:644` → never persist an un-matchable `creatorGithub`
  (finding 13).

**A3. `APPNAME` substitution (deterministic).** In `admin/src/publish.ts` right after
`/generate` (`:181-201`): poll `contents/package.json` until 200, then ONE Git Data
API commit (base_tree + blobs) replacing `APPNAME` across `package.json` (+ `--filter
@<id>/web` scripts), `web/package.json`, `web/index.html` (`<title>` + analytics
`?app=<id>`), `web/src/App.tsx`, `web/vite.config.ts` manifest, `CLAUDE.md` — slug for
package/analytics, display-name for titles. One pre-Actions commit ⇒ first deploy
already correct. Delete dead `substituteAppName` (`agent/src/template.ts:481`). **Trap:**
do not touch dependency versions; pnpm lock importers are path-keyed so name-only edits
are safe — verify once against the template lockfile.

**A4. Registry-primary ownership (root cause 1).** New shared helper
`publisher/functions/api/_games.ts`: `getRegistry`, `isOrgMember`, and
`listUserGames(env, login) → { owned, isOrgMember, adminAll }` where **owned** =
registry games with `creatorGithub === login` (covers pending invites, zero per-repo
calls) **unioned** with accepted-collaborator checks scoped **to registry entries only**
(no more `/orgs/{org}/repos` 60-repo scan), degrading to owned-only if GitHub is down.
Rework `me.ts:108-162` (members→`adminAll`, others→`owned`; `remaining =
maxGames - owned.length`), `create.ts countUserGames:51-61` (→`owned.length`), and
`publish.ts:42-48` (guard → "in owned"). Fixes findings 1, slot mismatch, publish-403.

**A5. Frontend refetch + dead-end (root cause 2).** `useAuth.ts`: split `fetchCreator`
into `loadCreator(force?)`; add guard-free `reloadCreator`; expose it. Transitionally
wire `CreateGameForm onCreated` → `reloadCreator` (not `refetch`). Kill the
"Done→resetForm→empty form" path; on success `navigate('/create?game=<id>')` +
`setShowForm(false)`. Independent of backend.

**A6. Cleanup.** Remove unused `CF_GLOBAL_KEY`/`CF_EMAIL` across the agent
(`deploy.ts:18-19`, `session.ts:153-154`, `index.ts:18-19`, test fixtures,
`wrangler.toml`); keep `CF_API_TOKEN`/`CF_ACCOUNT_ID` (FAS apps branch). Fix
`pushUpdate` stale message (`deploy.ts:447`) → "GitHub Actions will build and deploy
to R2." Nav: add desktop Dashboard link (`Nav.tsx`), reconsider the sibling-store
"Apps" link. Surface silent errors (Dashboard publish button, `CreateGameForm`
"Network error", `putSession` swallow).

**Migration (one-time, with A2/A4):** backfill registry `creatorGithub` for legacy
games recorded only via `developer` (script or admin edit) so they stay owned.

### Wave B — depends on A

**B1. Provision ordering/atomicity** (`admin/src/publish.ts:171-331`, after A2): reorder
to **repo → registry → route** so the worst partial state is *listed-but-unserved* (a
visible, self-healing 404 that idempotent re-provision + `reconcile()` at
`index.ts:512-542` fixes) rather than *served-but-invisible*. Collaborator stays
non-fatal.

**B2. Unified game list (frontend)** — one source, one status. Picker reads
`creator.games` (drop its own `/api/me` fetch, `ProjectPicker.tsx:64-81`); extract a
shared `GameList` from `Dashboard.tsx:84-139` and reuse in the picker; remove the
"every org repo Live" bug (`:229`) and the draft-filter bug (`:95-98`). **Status
decision (recommended):** since every provisioned game registers immediately,
`published:false` is unreachable — collapse the Draft/Live pill to **"Live" + an
"editing" indicator** for games with an active undeployed session. Standardize URLs on
`https://<id>.freegamestore.online` (`useProjects.ts:10,145`, `useAgent.ts:208-210`,
`Create.tsx:94-96`).

### Wave C — riskiest, do last, in order (the actual unification)

**C1. Import endpoint (keystone).** New agent `POST /session/:id/import { id }`
(`agent/src/index.ts:75` route regex; `session.ts` `handleImport` after the owner
gate). Ownership-gate (registry `creatorGithub` or collaborator-204). Fetch repo via
the Git Data API tree+blob walk (reuse `deploy.ts:350-401`): text files only, skip
`node_modules/`/`dist`/lockfiles/binaries, per-file ~512KB & total ~2MB/~200 files
caps. Bind `session.files`/`appId`/`appName`/`deployStatus`, persist, upsert the
sessions D1 row; refuse re-point to a different non-null `appId` (409).

**C2. One template / provision-via-admin deploy rewrite** (`agent/src/deploy.ts`
Path B branch + `session.ts:50,354`): seed a session by fetching
`template-game-canvas` text files (reuse C1 machinery, cache in DO storage) instead of
inline `getTemplateFiles`; delete the inline template + `pathBWorkflow`
(`template.ts`). Deploy: call `registerViaAdmin` FIRST (admin generates the repo,
substituted per A3, writes route+registry+invite), poll for `refs/heads/main`, then
push only the agent's changed source via a **base_tree merge** (`pushUpdate` algorithm,
not full-overwrite `pushFilesToGitHub`) so the SDK/package.json/deploy.yml/lockfile
survive. `waitForActionsDeploy` unchanged. FAS apps branch untouched.

**C3. VibeCode as single create entry (frontend).** Dashboard "Create Game" → "New
Game" modal → canonical `/api/create` → on success `navigate('/create?game=<id>')` +
`reloadCreator`. `Create.tsx` resolves `?game=` → `openGame(id)`: find session with
`appId===id` else `POST /session/:id/import` then bind. Replace the destructive
`ProjectPicker.tsx:101-112` path and remove the phantom auto-create
(`useProjects.ts:106-118`). Dashboard rows get "Open in VibeCode". Surface slots in the
studio toolbar.

---

## Risks

- **C2 deploy rewrite** is the highest-risk change to the primary VibeCode flow
  (generate→ref-ready poll→base_tree push; runtime template fetch). Bounded retries +
  clean failure; land C1 first (shared machinery).
- **A3 lockfile trap** — verify name-only substitution keeps `--frozen-lockfile` happy.
- No prod users (ship-and-test-in-prod tolerance) — land wave by wave, test each live.
- No new secrets/bindings (C1/C2 reuse `GITHUB_TOKEN`, `ADMIN`, `INTERNAL_TOKEN`,
  `AUTH`). New agent `/import` route. Registry `creatorGithub` backfill.

## Verification

- Unit: `agent` + `admin` vitest suites green after each wave.
- After Wave A: create a game as a non-member (serge-the-dev) via the Dashboard →
  appears **immediately** on the dashboard, correct title (no APPNAME), Live, editable,
  serves at `<id>.freegamestore.online`, `deploy.yml` green, `compliance.yml` green,
  `createdAt` populated. Slot count matches between dashboard and create gate.
- After Wave C: from the Dashboard, "New Game" lands in the studio bound to the new
  game; opening an EXISTING game loads its real files (verify a subsequent edit +
  deploy modifies, not overwrites); one game list/status across Dashboard + picker.
- Cleanup throwaways: archive (not delete) `pathb-smoke`, `test-game`; recover/archive
  orphan `angry-birds`; clear their registry/route entries.
- Confirm no CF Pages project is created for any game; `reconcile()` reports no drift.
