-- ============================================================================
-- Daybase — Supabase Schema
-- ============================================================================
-- Vorbereitung für optionalen Cloud-Sync. Spiegelt das generische `Entry`-
-- Modell aus src/types.ts: jede Tabelle hat dieselbe Struktur (ein Modul =
-- eine Tabelle), modul-spezifische Felder leben in `meta` (jsonb) — exakt wie
-- lokal in IndexedDB.
--
-- Ausführen: Supabase Dashboard → SQL Editor → einfügen → Run.
-- Idempotent: kann gefahrlos mehrfach laufen (IF NOT EXISTS / DROP-CREATE).
--
-- Spalten-Mapping App (Entry)  →  DB:
--   Entry.id        → id          (uuid, PK)
--   (neu)           → user_id     (uuid, = auth.uid())
--   Entry.date      → entry_date  (date)        -- "date" als Spaltenname vermieden
--   Entry.title     → title       (text)
--   Entry.content   → content     (text)
--   Entry.tags      → tags        (text[])
--   Entry.meta      → meta        (jsonb)       -- typ-spezifische Felder
--   Entry.createdAt → created_at  (timestamptz)
--   Entry.updatedAt → updated_at  (timestamptz)
--   Entry.type      → (entfällt — ein Typ pro Tabelle)
--
-- Tabellen ↔ EntryType:
--   tasks ↔ task        habits ↔ habit         notes ↔ note
--   diary_entries ↔ journal                    daily_reviews ↔ review
--   weekly_reviews ↔ weeklyreview              goals ↔ goal
--   projects ↔ project  trades ↔ trade         focus_sessions ↔ focus
--
-- Hinweis: weekplan (Wochenplan) ist hier bewusst NICHT enthalten — nicht Teil
-- der angeforderten Tabellenliste. Bei Bedarf später analog ergänzbar.
-- ============================================================================

-- gen_random_uuid() (für id-Defaults). In Supabase i.d.R. bereits aktiv.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- updated_at automatisch pflegen (Trigger-Funktion, einmal definiert).
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tabellen + RLS + Policies + Trigger + Index — generiert über eine Schleife,
-- da alle Tabellen identisch aufgebaut sind (generisches Entry-Modell).
-- ----------------------------------------------------------------------------
do $$
declare
  tbl text;
  tables text[] := array[
    'tasks',
    'habits',
    'notes',
    'diary_entries',
    'daily_reviews',
    'weekly_reviews',
    'goals',
    'projects',
    'trades',
    'focus_sessions'
  ];
begin
  foreach tbl in array tables loop
    -- 1) Tabelle (Kernfelder: id, user_id, created_at, updated_at + Entry-Spalten)
    execute format($f$
      create table if not exists public.%I (
        id          uuid primary key default gen_random_uuid(),
        user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
        entry_date  date,
        title       text not null default '',
        content     text not null default '',
        tags        text[] not null default '{}',
        meta        jsonb not null default '{}'::jsonb,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      );
    $f$, tbl);

    -- 2) Index auf user_id (jede Query filtert danach)
    execute format(
      'create index if not exists %I on public.%I (user_id);',
      tbl || '_user_id_idx', tbl
    );

    -- 3) updated_at-Trigger
    execute format('drop trigger if exists %I on public.%I;', tbl || '_set_updated_at', tbl);
    execute format($f$
      create trigger %I before update on public.%I
      for each row execute function public.set_updated_at();
    $f$, tbl || '_set_updated_at', tbl);

    -- 4) Row Level Security aktivieren
    execute format('alter table public.%I enable row level security;', tbl);

    -- 5) Policies: Nutzer dürfen NUR eigene Zeilen sehen/erstellen/ändern/löschen.
    --    Vier explizite Policies (select / insert / update / delete).
    execute format('drop policy if exists %I on public.%I;', tbl || '_select_own', tbl);
    execute format($f$
      create policy %I on public.%I
      for select using (auth.uid() = user_id);
    $f$, tbl || '_select_own', tbl);

    execute format('drop policy if exists %I on public.%I;', tbl || '_insert_own', tbl);
    execute format($f$
      create policy %I on public.%I
      for insert with check (auth.uid() = user_id);
    $f$, tbl || '_insert_own', tbl);

    execute format('drop policy if exists %I on public.%I;', tbl || '_update_own', tbl);
    execute format($f$
      create policy %I on public.%I
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, tbl || '_update_own', tbl);

    execute format('drop policy if exists %I on public.%I;', tbl || '_delete_own', tbl);
    execute format($f$
      create policy %I on public.%I
      for delete using (auth.uid() = user_id);
    $f$, tbl || '_delete_own', tbl);
  end loop;
end;
$$;

-- ============================================================================
-- Fertig. 10 Tabellen mit RLS + je 4 Owner-Policies.
-- Verifizieren (optional):
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
--   select tablename, policyname, cmd from pg_policies where schemaname = 'public';
-- ============================================================================
