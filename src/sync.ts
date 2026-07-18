// Optionaler Cloud-Sync für alle Module (außer weekplan, siehe SUPABASE.md).
//
// Prinzip: IndexedDB bleibt IMMER die lokale Quelle, die UI + Backup lesen.
// Bei aktiver Supabase-Session wird ZUSÄTZLICH gespiegelt:
//   - lokale Schreibvorgänge → Supabase (push, via Repository-Hooks)
//   - Cloud-Daten → IndexedDB (pull beim Login, non-destruktiv per bulkPut)
// Ohne Login passiert nichts — Daten bleiben rein lokal.
import { supabase } from "./supabase";
import { db } from "./db";
import { setEntrySyncHooks } from "./repository";
import type { Entry, EntryType } from "./types";

// Tabellenname pro Typ, deckungsgleich mit supabase-schema.sql.
// weekplan ist bewusst nicht enthalten (siehe SUPABASE.md).
const TABLE_BY_TYPE: Partial<Record<EntryType, string>> = {
  task: "tasks",
  habit: "habits",
  note: "notes",
  journal: "diary_entries",
  review: "daily_reviews",
  weeklyreview: "weekly_reviews",
  goal: "goals",
  project: "projects",
  trade: "trades",
  focus: "focus_sessions",
};

// Gecachte User-Id der aktiven Session (null = nicht eingeloggt → no-op).
let activeUserId: string | null = null;

export function isSyncActive(): boolean {
  return Boolean(supabase && activeUserId);
}

// Entry → DB-Zeile. user_id wird bewusst weggelassen → DB-Default
// `auth.uid()` füllt es. Leeres date → NULL (date-Spalte verträgt kein "").
function toRow(e: Entry) {
  return {
    id: e.id,
    entry_date: e.date || null,
    title: e.title,
    content: e.content,
    tags: e.tags,
    meta: e.meta,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

// DB-Zeile → Entry.
function toEntry(type: EntryType, row: Record<string, any>): Entry {
  return {
    id: row.id,
    type,
    date: row.entry_date ?? "",
    title: row.title ?? "",
    content: row.content ?? "",
    tags: row.tags ?? [],
    meta: row.meta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Einen Entry nach Supabase spiegeln (fire-and-forget; Fehler nur loggen,
// nie die UI blockieren). No-op ohne Login oder ohne passende Tabelle.
async function pushEntry(e: Entry): Promise<void> {
  const table = TABLE_BY_TYPE[e.type];
  if (!supabase || !activeUserId || !table) return;
  const { error } = await supabase.from(table).upsert(toRow(e));
  if (error) console.warn(`[sync] push (${table}) fehlgeschlagen:`, error.message);
}

// Einen Entry in der Cloud löschen. No-op ohne Login oder ohne passende Tabelle.
async function removeEntryRemote(e: Entry): Promise<void> {
  const table = TABLE_BY_TYPE[e.type];
  if (!supabase || !activeUserId || !table) return;
  const { error } = await supabase.from(table).delete().eq("id", e.id);
  if (error) console.warn(`[sync] delete (${table}) fehlgeschlagen:`, error.message);
}

// Cloud-Daten aller Tabellen → IndexedDB ziehen (non-destruktiv, upsert nach id).
async function pullAll(): Promise<number> {
  if (!supabase || !activeUserId) return 0;
  let total = 0;
  for (const [type, table] of Object.entries(TABLE_BY_TYPE) as [EntryType, string][]) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      console.warn(`[sync] pull (${table}) fehlgeschlagen:`, error.message);
      continue;
    }
    const entries = (data ?? []).map((row) => toEntry(type, row));
    if (entries.length) {
      await db.entries.bulkPut(entries);
      total += entries.length;
    }
  }
  return total;
}

// Migration: alle lokalen Daten (aller synchronisierten Module) in die Cloud
// übertragen (Button in Settings). Bestehende lokale Daten werden NICHT
// gelöscht — nur hochgeladen.
export async function pushAllLocal(): Promise<number> {
  if (!supabase || !activeUserId) {
    throw new Error("Nicht eingeloggt — kein Cloud-Sync aktiv.");
  }
  let total = 0;
  for (const [type, table] of Object.entries(TABLE_BY_TYPE) as [EntryType, string][]) {
    const rows = await db.entries.where("type").equals(type).toArray();
    if (!rows.length) continue;
    const { error } = await supabase.from(table).upsert(rows.map(toRow));
    if (error) throw new Error(`${table}: ${error.message}`);
    total += rows.length;
  }
  return total;
}

// Lokalen Cloud-Cache aus IndexedDB entfernen (alle synchronisierten Typen).
// Wird bei Logout/Account-Wechsel gerufen, damit auf einem geteilten Gerät
// der nächste Nutzer keine fremden Daten sieht. weekplan bleibt unberührt.
async function clearLocalSynced(): Promise<void> {
  const types = Object.keys(TABLE_BY_TYPE) as EntryType[];
  await db.entries.where("type").anyOf(types).delete();
}

// Reaktion auf Login / Logout / Account-Wechsel.
async function handleAuthChange(prevId: string | null, newId: string | null): Promise<void> {
  if (!newId) {
    await clearLocalSynced();
    return;
  }
  if (prevId && prevId !== newId) {
    // Account-Wechsel ohne Logout dazwischen: erst die Kopien des alten
    // Nutzers weg, dann die des neuen laden.
    await clearLocalSynced();
  } else {
    // Frischer Login: bisher rein-lokale Daten zuerst hochladen, damit ein
    // späterer Logout-Clear sie nicht vernichtet (kein Datenverlust).
    try {
      await pushAllLocal();
    } catch (e) {
      console.warn("[sync] Login-Push fehlgeschlagen:", (e as Error).message);
    }
  }
  await pullAll();
}

// Poll-Intervall für den Abgleich zwischen Geräten, solange die App sichtbar
// ist. ponytail: 20s-Polling deckt den Fall "beide Geräte gleichzeitig offen"
// ab. Für echten Instant-Sync auf Supabase Realtime (Websocket-Subscription
// pro Tabelle) umstellen — dann kann das Polling weg.
const POLL_MS = 20000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

// Einmal beim App-Start aufrufen. Verbindet Session-Status mit den
// Repository-Hooks. Ohne konfiguriertes Supabase passiert nichts.
export function initSync(): void {
  if (!supabase) return;

  // Hooks immer registrieren — sie sind no-ops, solange activeUserId null ist.
  setEntrySyncHooks({ onUpsert: pushEntry, onDelete: removeEntryRemote });

  // Beim Start: bestehende Session = Reload (kein Wechsel) → nur pullen.
  supabase.auth.getSession().then(({ data }) => {
    activeUserId = data.session?.user.id ?? null;
    if (activeUserId) void pullAll();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    const newId = session?.user.id ?? null;
    if (newId === activeUserId) return; // z.B. Token-Refresh — kein echter Wechsel
    const prevId = activeUserId;
    activeUserId = newId;
    void handleAuthChange(prevId, newId);
  });

  // Ohne Realtime-Subscription bekommt ein offen gelassener Tab/App fremde
  // Änderungen (z.B. vom Handy abgehakte Task) sonst nie mit. Deshalb:
  //  (1) sofort pullen, wenn Tab/App wieder in den Vordergrund kommt, und
  //  (2) regelmäßig pullen, solange die App sichtbar ist (deckt den Fall ab,
  //      dass beide Geräte gleichzeitig offen sind — dann feuert kein
  //      visibilitychange).
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && activeUserId) void pullAll();
    });
  }
  if (pollTimer == null) {
    pollTimer = setInterval(() => {
      if (isVisible() && activeUserId) void pullAll();
    }, POLL_MS);
  }
}
