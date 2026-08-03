# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # deps
npm run dev          # Vite dev server (http://localhost:5173); PWA service worker is OFF in dev
npm run build        # tsc typecheck (tsconfig.json) + vite build → dist/
npm run lint         # typecheck only: tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit
npm run test         # vitest run — pure-logic + repository/IndexedDB tests
npm run preview      # serve the production build (needed to exercise the PWA/service worker locally)
npm run gen-icons    # regenerate PWA PNG icons from public/icon.svg (run after editing the SVG)
```

`npm run lint` is a pure `tsc --noEmit` typecheck (two configs: app + `vite.config.ts`). Tests are **vitest** (`vitest.config.ts`, TZ pinned to `Europe/Berlin` because Tasks/Habits are date-sensitive), co-located as `src/**/*.test.ts`. They cover logic that has bitten before — habit toggling/streaks, recurrence spawning, sync reconciliation, backup round-trips — not components (no jsdom, no RTL). `src/repository.test.ts` runs against `fake-indexeddb`. The bar for "done" is green `npm run lint`, `npm run test` and `npm run build`.

On Windows the `node`/`npm` binaries may not be on PATH for non-login shells; prefix commands by injecting the machine+user PATH first if `npm` is "not recognized".

## Deployment

Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages at `https://<user>.github.io/<repo>/`. Two things make the SPA work under that subpath and **must stay consistent**:

- `vite.config.ts` reads `base` from `process.env.VITE_BASE`; the workflow sets it to `/<repo-name>/`. Locally `base` is `/`.
- `App.tsx` sets `<BrowserRouter basename={import.meta.env.BASE_URL...}>` so routes resolve under the subpath.
- The workflow copies `dist/index.html` → `dist/404.html` so deep-link reloads boot the SPA (Pages has no server-side rewrite; the 404 status is cosmetic).

## Architecture — the one idea that matters

**Every module stores into a single generic `Entry` object in one IndexedDB table.** There is no per-module schema. Understand these three files first:

- `src/types.ts` — the `Entry` interface and the `EntryType` union (`journal | task | weekplan | trade | habit | note | review | weeklyreview | goal | project | focus`). Module-specific fields live in `Entry.meta` (typed per-type via the `*Meta` interfaces + `MetaByType`). `meta` is `Record<string, any>` — the `*Meta` interfaces are contracts, not enforced.
- `src/db.ts` — Dexie setup. One `entries` table indexed on `id, type, date, createdAt, updatedAt, *tags, [type+date]`. The compound `[type+date]` index is the workhorse for "entries of type X on/within date(s)".
- `src/repository.ts` — generic CRUD + queries (`queryByType`, `queryByDateRange`, `queryByTypeAndDateRange`, etc.). All modules go through `entriesRepo`. Also holds `exportBackup`/`importBackup` and the seed/cleanup helpers.

Consequence: **new entry types are additive and free** — add to the `EntryType` union + a `*Meta` + `MetaByType`, register the module, write a page. Backup, search, and storage pick them up automatically.

### Adding a module

1. Extend `EntryType` and add `<Type>Meta` + `MetaByType` entry in `src/types.ts`.
2. Add a `{ path, label, type, icon }` row to `MODULES` in `src/modules.ts` (this is the single source of truth that drives **both** the sidebar nav in `src/components/Layout.tsx` and routing).
3. Create `src/pages/<X>Page.tsx` and wire it into the `PAGES` map in `src/App.tsx` (modules without a real page fall back to `ModulePlaceholder`).

### Reactivity & cross-module data

- All reads use `useLiveQuery` (dexie-react-hooks) — UI updates automatically on writes. Don't add manual refresh logic.
- **Links between modules are stored as ids in `meta`** (`task.meta.projectId/goalId`, `note.meta.projectId/goalId`, `project.meta.goalId`). Derived values like project/goal progress are **computed live, never stored**: `projectProgress` (in `ProjectsPage.tsx`) and `goalProgress` (in `GoalsPage.tsx`) are exported and reused by the Dashboard. A goal with no links falls back to its manual `progress` slider.
- Dashboard and Weekly Review are aggregators: they re-derive their numbers (open tasks, focus time, weekly summaries) from the same entries — there is no separate rollup store.

### Seeding & date conventions

- `src/seed.ts` seeds a default week (`src/data/defaultWeek.ts`) + rules notes once, guarded by a `localStorage` flag **and** a module-level singleton promise (React StrictMode double-invokes effects in dev → the singleton prevents a duplicate-seed race). `cleanupDuplicateWeekplan` is an idempotent migration for older duplicates. Both run from the `useEffect` in `App.tsx`.
- Dates are local ISO `YYYY-MM-DD` via `src/utils/date.ts` (`todayIso`, `addDaysIso`, `mondayOfIso`, `isoWeekKey`/`isoWeekNumber`). **Weeks start Monday (ISO 8601)**; weekly entries (weekplan, weekly review) are anchored to the Monday date — that's how "one per week" is enforced (upsert on `[type+date]` with the Monday).

### Cloud Sync (optional, Supabase)

- `src/supabase.ts` — the ONLY file that calls `createClient` / reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. `supabase` is `null` and `isSupabaseConfigured` is `false` without those env vars → app runs purely local, unchanged. `useSession()` hook exposes the live auth session.
- `src/sync.ts` — mirrors 10 of the 11 entry types to Supabase tables (`TABLE_BY_TYPE`; `weekplan` is intentionally excluded, see `SUPABASE.md`). IndexedDB stays the source of truth the UI reads; sync is a reconciling mirror on top:
  - **Push**: `entriesRepo.create/update/remove` call hooks registered via `setEntrySyncHooks` in `repository.ts` — every local write fires a fire-and-forget upsert/delete to Supabase (errors only `console.warn`, never block the UI). A failed push is **not** lost: the next reconcile retries it.
  - **Reconcile** (`syncAll` → `syncTable`): per table, fetch all cloud rows (paginated — PostgREST caps a request at ~1000 rows) and diff them against the local rows via the pure `planReconcile` in `src/utils/reconcile.ts`. **Newer `updatedAt` wins**, in either direction. Triggered on (1) app start once the session is resolved, (2) login/account-switch, (3) `visibilitychange` → visible, and (4) a 20s poll while visible. No Realtime subscription — polling, not push; Realtime is the upgrade path if sub-second sync is ever needed. Overlapping runs are dropped (`running` flag).
  - **Deletions** need the `seen`/`tombstones` state persisted per user in `localStorage` (`daybase.sync.state`): an id missing from the cloud is deleted locally **only if it was previously seen there** — anything never uploaded (offline-created) is pushed instead, never deleted. A local delete whose cloud delete failed leaves a tombstone that the next reconcile retries, so an offline delete isn't resurrected by the next pull.
  - **Conflict timestamps**: `planReconcile` compares `Date.parse`, not string order (Postgres emits `+00:00` + microseconds). `supabase-migrations/2026-08-03-drop-updated-at-triggers.sql` removes the server-side `updated_at` trigger so the client timestamp stays authoritative; until it's applied, an in-memory `lastPushed` guard prevents a push loop.
  - Auth handling is serialized behind `getSession()` — `supabase-js` fires `INITIAL_SESSION` on subscribe, and treating that as a login made every app start re-upload the whole local DB. The persisted `userId` is what distinguishes "same session after reload" (just reconcile) from "different account" (clear local synced types first). Logout clears the local cache of synced types only (`weekplan` untouched) so a shared device doesn't leak data to the next user.
  - `initSync()` is an idempotent singleton returning a promise; **await it before writing derived values** (see `syncHabitStreaks` in `App.tsx`) or the local recompute overwrites fresher cloud data.
- `supabase-schema.sql` / `SUPABASE.md` — DB schema + RLS policies (idempotent SQL, run once in the Supabase SQL editor) and setup docs.
- GitHub Actions secrets `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` must be set in the repo (Settings → Secrets → Actions) for the deployed build to have sync — a typo there fails silently as "Failed to fetch", not a clear error.

### i18n

- `src/i18n.ts` — minimal DE/EN toggle, no library. `getLanguage()`/`setLanguage()` read/write the `daybase.language` localStorage key; `useI18n()` is a `useSyncExternalStore` hook exposing `{ language, locale, tr(de, en), setLanguage }`. Components call `tr("Deutscher Text", "English text")` inline — there is no separate translation-file/key system.
- Not everything is translated yet (translate incrementally as pages are touched, following the `tr()` pattern already used in `Layout.tsx`/`reminders.ts`).

### Other conventions

- **Styling is one file**: `src/index.css`, a design system of CSS custom properties (color/spacing `--sp-*`/radius/shadow/font-size/transition tokens). No CSS modules, no Tailwind. Reuse existing tokens and classes (`.entity-card`, `.chip`, `.btn`, `.task-select`, `.kpi-card`, …) instead of inventing new ones. Light theme is a token override under `html[data-theme="light"]`, applied in `src/main.tsx` before render (and toggled in Settings).
- **Page headers**: every page renders `<PageHeader icon subtitle? actions? />` (`src/components/PageHeader.tsx`) instead of hand-rolled markup — this is what keeps icon size/spacing/title consistent across all pages. Pass `actions` for a header-level control row (e.g. Wochenplan's week nav); don't add new one-off header markup in a page.
- **Command palette / global search**: `src/components/CommandPalette.tsx` (Ctrl/Cmd+K). Search results deep-link with query params (`?sel=`, `?date=`, `?week=`) that the target pages read via `useSearchParams` to preselect.
- **Mobile nav**: `Layout.tsx` renders a hamburger (`.mobile-bar`) under a CSS breakpoint that opens the sidebar as a slide-in drawer (`.sidebar.is-open` + `.sidebar-backdrop`); Escape key and route changes both close it.
- **PWA**: `vite-plugin-pwa` (`registerType: autoUpdate`, `injectRegister: auto` — no manual SW registration in app code). Icons come from `public/icon.svg` → `scripts/gen-icons.mjs` (`sharp`). The service worker aggressively caches the app shell — after deploying a fix, an already-installed PWA may need "Update installieren" (or a manual SW unregister) before the fix is visible; don't assume a live deploy is immediately reflected on installed instances.
- UI strings default to German; use `tr()` (see i18n above) for anything user-facing going forward.
- `localStorage` keys in use: `daybase.seeded.v1`, `daybase.theme`, `daybase.language`, `daybase.lastBackup`, `daybase.focus.active` (focus timer survives reload via a timestamp anchor, not per-second writes), `daybase.reminders.enabled` + `daybase.reminders.lastShown` (see `src/reminders.ts`), `daybase.supabase.auth` (Supabase session, managed by the Supabase client itself — don't touch directly), `daybase.sync.state` (per-user `seen`/`tombstones` for the cloud reconcile — deleting it makes the next sync forget which ids ever reached the cloud, which only costs a redundant re-push, never data).
- Backup import is **non-destructive merge** (`bulkPut` upserts by `id`; entries not in the file are kept).
