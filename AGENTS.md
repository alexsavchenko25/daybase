# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

- `src/types.ts` — the `Entry` interface and the `EntryType` union (`journal | task | weekplan | trade | habit | note | review | weeklyreview | goal | project | focus | inbox`). Module-specific fields live in `Entry.meta` (typed per-type via the `*Meta` interfaces + `MetaByType`). `meta` is `Record<string, any>` — the `*Meta` interfaces are contracts, not enforced.
- `src/db.ts` — Dexie setup. One `entries` table indexed on `id, type, date, createdAt, updatedAt, *tags, [type+date]`. The compound `[type+date]` index is the workhorse for "entries of type X on/within date(s)".
- `src/repository.ts` — generic CRUD + queries (`queryByType`, `queryByDateRange`, `queryByTypeAndDateRange`, etc.). All modules go through `entriesRepo`. `updateAtomic(id, entry => patch)` does a read-modify-write in one Dexie `rw` transaction — use it whenever a write depends on the currently-stored entry (not the rendered prop) or touches more than one field at once (e.g. scheduling a task changes both `date` and `meta`). `updateMeta` is a thin wrapper over it for the common meta-only case. Also holds `exportBackup`/`importBackup` and the seed/cleanup helpers.

Consequence: **new entry types are additive and free** — add to the `EntryType` union + a `*Meta` + `MetaByType`, register the module, write a page. Backup, search, and storage pick them up automatically.

### Adding a module

1. Extend `EntryType` and add `<Type>Meta` + `MetaByType` entry in `src/types.ts`.
2. Add a `{ path, label, type, icon }` row to `MODULES` in `src/modules.ts` (this is the single source of truth that drives routing via `App.tsx`'s `{MODULES.map(...)}`). It only appears in the **sidebar** if its path is also added to one of the `GROUPS` path lists in `src/components/Layout.tsx` — `MODULES` and sidebar visibility are two separate lists. A third, user-controlled layer sits on top of that: `src/hiddenModules.ts` (see "Sidebar module visibility" below) can hide any non-required module's nav link without touching `MODULES` or `GROUPS` at all — never mutate `MODULES` to hide something, always go through `hiddenModules.ts`.
3. Create `src/pages/<X>Page.tsx` and wire it into the `PAGES` map in `src/App.tsx` (modules without a real page fall back to `ModulePlaceholder`).

Not every route is a module. `Dashboard`, `TodayPage` (`/`, `/today`) and `ConsistencyPage` (`/consistency`) are pure aggregators with no `EntryType` of their own — they're wired directly into `App.tsx`'s `<Routes>` and `Layout.tsx`'s nav, bypassing `MODULES` entirely. Follow that pattern for a new page only if it doesn't own any stored data; if it creates/edits entries, it's a module and belongs in `MODULES`.

### Reactivity & cross-module data

- All reads use `useLiveQuery` (dexie-react-hooks) — UI updates automatically on writes. Don't add manual refresh logic.
- **Links between modules are stored as ids in `meta`** (`task.meta.projectId/goalId`, `note.meta.projectId/goalId`, `project.meta.goalId`). Derived values like project/goal progress are **computed live, never stored**: `projectProgress` (in `ProjectsPage.tsx`) and `goalProgress` (in `GoalsPage.tsx`) are exported and reused by the Dashboard. A goal with no links falls back to its manual `progress` slider.
- Dashboard and Weekly Review are aggregators: they re-derive their numbers (open tasks, focus time, weekly summaries) from the same entries — there is no separate rollup store.
- **Projects** (`ProjectMeta` in `types.ts`) have a workflow `status`: `active | waiting | someday | paused | done` (additive over the original 3 — old records without the newer statuses still parse fine) plus an optional `nextAction` string. `ProjectsPage.tsx` renders both a list view and a board view (columns per status, moved via a plain `<select>` — no drag-and-drop dependency). `lastTaskActivityIso`/`projectNeedsAttention` (also exported from `ProjectsPage.tsx`) flag active/waiting projects with no linked-task activity in 14 days or no `nextAction`; both the Dashboard hint and `utils/insights.ts`'s stale-project insight reuse these instead of re-deriving the rule.

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

### Today, Quick Capture & task scheduling

- `src/pages/TodayPage.tsx` (`/today`) — action-first "what should I do now" aggregator, same non-module pattern as Dashboard. "Next up" = next unfinished weekplan block for today, else the top-priority open task. Every row is directly actionable (checkbox writes through `entriesRepo`/`utils/task.ts`) — no read-only summaries.
- `src/components/QuickCapture.tsx` — global capture overlay, one text field, no category chooser. Open/closed state is a module-level store read via `useSyncExternalStore` (same pattern as `i18n.ts` — no React Context anywhere in this codebase). `openQuickCapture()` is exported and callable from anywhere (CommandPalette's "Quick Capture" command, the sidebar's persistent capture button, or the global `⌘⇧C`/`Ctrl+Shift+C` shortcut registered inside the component itself). Saves as an `inbox` entry with empty `meta` — classification happens at conversion time (`src/pages/InboxPage.tsx`: convert to task/note/journal, or edit/delete in place), never at capture time.
- **Task scheduling** (`TaskMeta.schedule: { startTime, endTime }` in `types.ts`) puts a task on the Weekplan **without a second entry**. The day already lives in `Entry.date`; only the time needed a home in `meta`. `src/utils/task.ts` (`isScheduled`, `scheduleSortKey`, `scheduleTask`, `unscheduleTask`) is the only place that touches `schedule` — `WeekPlanPage.tsx` merges scheduled tasks into its day columns (a `DayItem` union of `block | task`) purely as a read; its task-specific card (`TaskBlockCard`) exposes only start/end time + done + unschedule, nothing that could touch title/priority/subtasks/project/goal/recurrence. If you extend scheduling, keep it that way — a linked/mirrored weekplan entry would need permanent two-way sync and was deliberately rejected.

### Tasks: saved views & bulk actions

- `TasksPage.tsx`'s `View` union covers both date-range views (`today`, `next7`, `week`, `later`, `day`) and attribute views (`overdue`, `highPriority`, `noProject`, `all`, `done`) — all single-select over the same filtered/sorted list, no separate mechanism per view type. `OVERDUE_FIRST_VIEWS` controls which views sort overdue-first.
- Overdue checks everywhere (`TasksPage.tsx`, `Dashboard.tsx`, `reminders.ts`) guard with `!!entry.date && entry.date < today` — an empty date string sorts lexicographically before any real date and would otherwise be miscounted as overdue.
- Multi-select is plain in-memory `Set<string>` component state (never persisted), cleared whenever `view`/`viewDate` changes so a selection can't silently reference now-invisible rows. Bulk complete loops selected ids through the existing single-task `toggleTaskDone()` (skipping already-done ones) instead of writing `done` directly, so the spawn-once recurrence logic in `planRecurrenceSpawn` still runs correctly per task. Bulk reschedule uses `entriesRepo.update()` (single field); bulk project assign/remove uses `entriesRepo.updateMeta()` (depends on current meta) — matches the `updateAtomic`/`updateMeta` guidance above.

### Dashboard Insights & Consistency Calendar

- `src/utils/insights.ts` (`deriveInsights`) computes up to 5 short, neutrally-phrased pattern insights for the Dashboard (habit-completion trend, focus-time trend, energy/focus/mood trend, a stale project, best focus weekday) — all pure functions over already-fetched entries, nothing persisted. Each has its own minimum-data threshold and returns `null` (hidden) when evidence is too thin; see the function comments for the exact thresholds before changing them. Review/journal-based insights only count if the user has *ever* used that module (checked once, app-wide) so someone who never journals isn't penalized every day for it.
- `src/pages/ConsistencyPage.tsx` (`/consistency`) is a third non-module aggregator (see "Adding a module" above) showing one month at a time, Monday-start. `src/utils/consistency.ts` derives a per-day score from the same signals as Insights (tasks/habits/focus continuous, review/journal boolean) with the same "only count what was tracked" rule, plus: future days always score `null` (never rendered as a miss), and continuous metrics are excluded from a day's score entirely if nothing of that kind existed that day. `utils/date.ts`'s `addMonthsIso` (month nav only, expects day=01) is intentionally separate from `utils/recurrence.ts`'s own month arithmetic (recurrence spawn dates) — don't unify them, they have different correctness requirements (recurrence's day-of-month rollover behavior is existing, load-bearing behavior).

### Reminders

- `src/reminders.ts` — four independent local browser-notification reminders (`ReminderKind`: `dailyReview | weeklyReview | overdueTasks | habits`), each with its own enable flag, `HH:MM` local time, and `lastShown` marker (a plain ISO date, or the Monday-of-week for `weeklyReview` so it naturally resets weekly). `startReminderScheduler()` (called once from `App.tsx`) checks immediately on load, then every 60s while the app is open — there's no push infrastructure, so a reminder only ever fires while a tab/PWA is open. `checkReminders()` gates on the cheap localStorage time/lastShown check *before* touching IndexedDB. A one-time `migrateLegacyReminderSetting()` (module-load side effect) folds the old single `daybase.reminders.enabled` toggle into all four new reminders so upgrading users don't silently lose it.

### Markdown preview (Notes/Journal)

- `src/utils/markdown.ts` + `src/components/MarkdownPreview.tsx` — Notes and Journal entries get an Edit/Preview toggle over a small, hand-rolled Markdown subset (headings, bold, italic, lists, links, inline code, code blocks). No dependency: the parser builds a typed AST (`BlockNode`/`InlineNode`) that `MarkdownPreview` turns into real React elements with string children — there is **no `dangerouslySetInnerHTML` anywhere in this path**, so raw HTML in content can only ever render as literal text, never execute. Link hrefs are scheme-allowlisted via `isSafeUrl()` (`http:`/`https:`/`mailto:` only) to block `javascript:`/`data:` links. Don't "upgrade" this to a general HTML-producing library without re-deriving the same safety property some other way. Parsing is purely a render-time transform — `Entry.content` itself is never touched, so toggling/saving/search/export/import/sync all see the exact original text.

### Sidebar module visibility

- `src/hiddenModules.ts` lets users hide optional modules from the sidebar (Settings → "Sidebar-Module") without mutating `MODULES`. `REQUIRED_PATHS` (`/`, `/today`, `/inbox`, `/tasks`, `/weekplan`, `/settings`, `/auth`) can never be hidden — `setModuleHidden()` no-ops for them. `useHiddenModules()` is a `useSyncExternalStore` hook (same pattern as `useI18n`); its `getSnapshot` is a **cached** Set invalidated only on actual change — recomputing a fresh Set on every call would break `useSyncExternalStore`'s referential-stability contract and infinite-loop. Hidden modules stay fully reachable by direct URL; `CommandPalette.tsx` deliberately does **not** filter them out, it labels them (`sub: "Ausgeblendet in der Sidebar"`) — the palette is meant to stay the fastest path to *anything*, hidden or not.

### Other conventions

- **Styling is one file**: `src/index.css`, a design system of CSS custom properties (color/spacing `--sp-*`/radius/shadow/font-size/transition tokens). No CSS modules, no Tailwind. Reuse existing tokens and classes (`.entity-card`, `.chip`, `.btn`, `.task-select`, `.kpi-card`, `.plan-block`/`.cat-*` category tokens, …) instead of inventing new ones. Light theme is a token override under `html[data-theme="light"]`, applied in `src/main.tsx` before render (and toggled in Settings).
- **Page headers**: every page renders `<PageHeader icon subtitle? actions? />` (`src/components/PageHeader.tsx`) instead of hand-rolled markup — this is what keeps icon size/spacing/title consistent across all pages. Pass `actions` for a header-level control row (e.g. Wochenplan's week nav); don't add new one-off header markup in a page.
- **Command palette / global search**: `src/components/CommandPalette.tsx` (Ctrl/Cmd+K). Search results deep-link with query params (`?sel=`, `?date=`, `?week=`) that the target pages read via `useSearchParams` to preselect. A command's `run` doesn't have to navigate — Quick Capture's entry opens the `QuickCapture` overlay instead.
- **Nav badges**: `Layout.tsx`'s `ModuleLink` can show a small unread-style count next to a nav item (currently only Inbox: live count of un-triaged captures). It's special-cased per path, not a generic mechanism — add another one the same way rather than building a shared badge system.
- **Mobile nav**: `Layout.tsx` renders a hamburger (`.mobile-bar`) under a CSS breakpoint that opens the sidebar as a slide-in drawer (`.sidebar.is-open` + `.sidebar-backdrop`); Escape key and route changes both close it.
- **PWA**: `vite-plugin-pwa` (`registerType: autoUpdate`, `injectRegister: auto` — no manual SW registration in app code). Icons come from `public/icon.svg` → `scripts/gen-icons.mjs` (`sharp`). The service worker aggressively caches the app shell — after deploying a fix, an already-installed PWA may need "Update installieren" (or a manual SW unregister) before the fix is visible; don't assume a live deploy is immediately reflected on installed instances.
- UI strings default to German; use `tr()` (see i18n above) for anything user-facing going forward.
- `localStorage` keys in use: `daybase.seeded.v1`, `daybase.theme`, `daybase.language`, `daybase.lastBackup`, `daybase.focus.active` (focus timer survives reload via a timestamp anchor, not per-second writes), `daybase.reminders.<kind>.enabled` / `.time` / `.lastShown` for `kind` in `dailyReview | weeklyReview | overdueTasks | habits` (see "Reminders" above; the old single `daybase.reminders.enabled`/`daybase.reminders.lastShown` are migrated away on load, don't reintroduce them), `daybase.hiddenModules` (JSON array of hidden module paths, see "Sidebar module visibility" above), `daybase.habits.heatmapPeriod` (`7 | 30 | 90`, last selected Habit Tracker range), `daybase.supabase.auth` (Supabase session, managed by the Supabase client itself — don't touch directly), `daybase.sync.state` (per-user `seen`/`tombstones` for the cloud reconcile — deleting it makes the next sync forget which ids ever reached the cloud, which only costs a redundant re-push, never data).
- Backup import is **non-destructive merge** (`bulkPut` upserts by `id`; entries not in the file are kept).
