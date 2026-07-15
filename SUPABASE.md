# Supabase Cloud Sync

Optionaler Cloud-Sync für Daybase. **Noch nicht aktiv** — die App läuft
weiterhin rein lokal (IndexedDB). Diese Datei dokumentiert das DB-Schema
(`supabase-schema.sql`) als Vorbereitung.

## Setup

1. Projekt auf [supabase.com](https://supabase.com) anlegen.
2. **SQL Editor** → Inhalt von [`supabase-schema.sql`](supabase-schema.sql)
   einfügen → **Run**. (Idempotent — mehrfaches Ausführen ist sicher.)
3. **Project Settings → API** → `Project URL` und `anon public` Key kopieren.
4. Lokal `.env` aus [`.env.example`](.env.example) anlegen:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
5. App neu starten → `/auth` erlaubt jetzt Login/Registrierung.

## Schema

Das Schema spiegelt das generische `Entry`-Modell (`src/types.ts`): **ein Modul
= eine Tabelle**, gleiche Struktur überall, modul-spezifische Felder in `meta`
(jsonb). Dadurch ist ein späterer Sync ein direktes 1:1-Mapping.

### Tabellen (10)

| Tabelle           | EntryType      | Modul          |
| ----------------- | -------------- | -------------- |
| `tasks`           | `task`         | Tasks          |
| `habits`          | `habit`        | Habit Tracker  |
| `notes`           | `note`         | Notizen        |
| `diary_entries`   | `journal`      | Tagebuch       |
| `daily_reviews`   | `review`       | Daily Review   |
| `weekly_reviews`  | `weeklyreview` | Weekly Review  |
| `goals`           | `goal`         | Goals          |
| `projects`        | `project`      | Projects       |
| `trades`          | `trade`        | Trading Journal|
| `focus_sessions`  | `focus`        | Focus Mode     |

> `weekplan` (Wochenplan) ist bewusst nicht enthalten — nicht Teil der
> angeforderten Tabellenliste. Bei Bedarf analog ergänzbar.

### Spalten (in jeder Tabelle gleich)

| Spalte       | Typ           | App-Feld (Entry) | Hinweis                          |
| ------------ | ------------- | ---------------- | -------------------------------- |
| `id`         | `uuid` PK     | `id`             | Default `gen_random_uuid()`      |
| `user_id`    | `uuid`        | —                | `= auth.uid()`, FK auf auth.users, `on delete cascade` |
| `entry_date` | `date`        | `date`           | "date" als Spaltenname vermieden |
| `title`      | `text`        | `title`          |                                  |
| `content`    | `text`        | `content`        |                                  |
| `tags`       | `text[]`      | `tags`           |                                  |
| `meta`       | `jsonb`       | `meta`           | typ-spezifische Felder           |
| `created_at` | `timestamptz` | `createdAt`      | Default `now()`                  |
| `updated_at` | `timestamptz` | `updatedAt`      | Auto via Trigger bei `update`    |

`Entry.type` entfällt — der Typ steckt im Tabellennamen.

## Sicherheit (Row Level Security)

RLS ist auf **allen** Tabellen aktiviert. Jede Tabelle hat **vier** Policies,
die jeweils `auth.uid() = user_id` prüfen:

- `*_select_own` — nur eigene Zeilen lesen
- `*_insert_own` — nur mit eigener `user_id` einfügen (`with check`)
- `*_update_own` — nur eigene ändern (`using` + `with check`)
- `*_delete_own` — nur eigene löschen

Ohne gültige Session sieht/ändert niemand Daten. `user_id` wird automatisch auf
`auth.uid()` gesetzt, falls beim Insert nicht mitgegeben.

### Verifizieren

```sql
-- RLS aktiv?
select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- Policies vorhanden? (erwartet: 4 pro Tabelle = 40)
select tablename, policyname, cmd from pg_policies where schemaname = 'public';
```

## Status

- ✅ Schema + RLS + Policies (`supabase-schema.sql`)
- ✅ Client-Kapselung (`src/supabase.ts`) + Auth-UI (`/auth`)
- ✅ Sync-Logik für alle 10 Tabellen (`src/sync.ts`) — Push bei Write, Pull bei
  Login, Migration bestehender lokaler Daten via Settings-Button
