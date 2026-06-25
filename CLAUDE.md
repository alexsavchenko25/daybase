# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # deps
npm run dev          # Vite dev server (http://localhost:5173); PWA service worker is OFF in dev
npm run build        # tsc typecheck (tsconfig.json) + vite build → dist/
npm run lint         # typecheck only: tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit
npm run preview      # serve the production build (needed to exercise the PWA/service worker locally)
npm run gen-icons    # regenerate PWA PNG icons from public/icon.svg (run after editing the SVG)
```

There is **no test suite / test runner**. `npm run lint` is a pure `tsc --noEmit` typecheck (two configs: app + `vite.config.ts`). Treat a green `npm run build` as the bar for "done".

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

### Other conventions

- **Styling is one file**: `src/index.css`, a design system of CSS custom properties (color/spacing `--sp-*`/radius/shadow/font-size/transition tokens). No CSS modules, no Tailwind. Reuse existing tokens and classes (`.entity-card`, `.chip`, `.btn`, `.task-select`, `.kpi-card`, …) instead of inventing new ones. Light theme is a token override under `html[data-theme="light"]`, applied in `src/main.tsx` before render (and toggled in Settings).
- **Command palette / global search**: `src/components/CommandPalette.tsx` (Ctrl/Cmd+K). Search results deep-link with query params (`?sel=`, `?date=`, `?week=`) that the target pages read via `useSearchParams` to preselect.
- **PWA**: `vite-plugin-pwa` (`registerType: autoUpdate`, `injectRegister: auto` — no manual SW registration in app code). Icons come from `public/icon.svg` → `scripts/gen-icons.mjs` (`sharp`).
- UI strings are German.
- `localStorage` keys in use: `daybase.seeded.v1`, `daybase.theme`, `daybase.lastBackup`, `daybase.focus.active` (focus timer survives reload via a timestamp anchor, not per-second writes).
- Backup import is **non-destructive merge** (`bulkPut` upserts by `id`; entries not in the file are kept).
