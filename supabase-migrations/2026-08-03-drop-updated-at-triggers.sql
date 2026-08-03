-- ============================================================================
-- Daybase — Migration: updated_at-Trigger entfernen
-- Datum: 2026-08-03
-- ============================================================================
-- WARUM
-- ----------------------------------------------------------------------------
-- supabase-schema.sql legt pro Tabelle einen Trigger `<tbl>_set_updated_at`
-- an, der bei jedem UPDATE `updated_at = now()` setzt (Serverzeit).
--
-- Für den Cloud-Sync ist IndexedDB die Quelle der Wahrheit; der Abgleich in
-- src/sync.ts entscheidet Konflikte über `updated_at` ("jüngerer Stand
-- gewinnt"). Solange der Trigger den vom Client gelieferten Wert überschreibt,
-- ist dieser Vergleich nicht mehr der Vergleich zweier Client-Zeitstempel:
--
--   * Nach jedem Push ist der Cloud-Wert minimal jünger als der lokale →
--     unnötige Rück-Schreibvorgänge in IndexedDB bei jedem Poll.
--   * Geht die Uhr eines Geräts vor, gilt lokal dauerhaft als "jünger" als
--     die Serverzeit → derselbe Eintrag wird bei jedem Poll erneut gepusht.
--
-- Die App fängt das heute über einen In-Memory-Guard (`lastPushed`) ab; diese
-- Migration behebt die Ursache. Ohne sie funktioniert der Sync weiterhin, nur
-- mit den beiden obigen Schönheitsfehlern.
--
-- SICHERHEIT
-- ----------------------------------------------------------------------------
--   * Rein additiv/entfernend auf Trigger-Ebene — KEINE Datenänderung.
--   * Keine Spalte, keine Zeile, keine Policy wird angefasst.
--   * Idempotent (drop trigger if exists), beliebig oft ausführbar.
--   * RLS und die vier Owner-Policies pro Tabelle bleiben unverändert.
--
-- AUSFÜHREN
-- ----------------------------------------------------------------------------
--   Supabase Dashboard → SQL Editor → einfügen → Run.
--   Danach schreibt ausschließlich der Client `updated_at`.
--   (supabase-schema.sql legt den Trigger erneut an — nach einem erneuten
--    Ausführen des Basis-Schemas diese Migration wiederholen.)
-- ============================================================================

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
    execute format('drop trigger if exists %I on public.%I;', tbl || '_set_updated_at', tbl);
  end loop;
end;
$$;

-- Verifizieren (optional): sollte 0 Zeilen liefern.
--   select event_object_table, trigger_name
--   from information_schema.triggers
--   where trigger_schema = 'public' and trigger_name like '%_set_updated_at';
