// Optionaler Task-Cloud-Sync (nur Modul "task").
//
// Prinzip: IndexedDB bleibt IMMER die lokale Quelle, die UI + Backup lesen.
// Bei aktiver Supabase-Session wird ZUSÄTZLICH gespiegelt:
//   - lokale Task-Schreibvorgänge → Supabase (push, via Repository-Hooks)
//   - Cloud-Tasks → IndexedDB (pull beim Login, non-destruktiv per bulkPut)
// Ohne Login passiert nichts — Tasks bleiben rein lokal.
//
// Kein anderes Modul ist betroffen. Backup-Export/Import bleibt unberührt.
import { supabase } from "./supabase";
import { db } from "./db";
import { setTaskSyncHooks } from "./repository";
import type { Entry } from "./types";

const TABLE = "tasks";

// Gecachte User-Id der aktiven Session (null = nicht eingeloggt → no-op).
let activeUserId: string | null = null;

export function isTaskSyncActive(): boolean {
  return Boolean(supabase && activeUserId);
}

// Entry(task) → DB-Zeile. user_id wird bewusst weggelassen → DB-Default
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

// DB-Zeile → Entry(task).
function toEntry(row: Record<string, any>): Entry {
  return {
    id: row.id,
    type: "task",
    date: row.entry_date ?? "",
    title: row.title ?? "",
    content: row.content ?? "",
    tags: row.tags ?? [],
    meta: row.meta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Einen Task nach Supabase spiegeln (fire-and-forget; Fehler nur loggen,
// nie die UI blockieren). No-op ohne Login.
async function pushTask(e: Entry): Promise<void> {
  if (!supabase || !activeUserId) return;
  const { error } = await supabase.from(TABLE).upsert(toRow(e));
  if (error) console.warn("[taskSync] push fehlgeschlagen:", error.message);
}

// Einen Task in der Cloud löschen. No-op ohne Login.
async function removeTaskRemote(id: string): Promise<void> {
  if (!supabase || !activeUserId) return;
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) console.warn("[taskSync] delete fehlgeschlagen:", error.message);
}

// Cloud-Tasks → IndexedDB ziehen (non-destruktiv, upsert nach id).
async function pullTasks(): Promise<number> {
  if (!supabase || !activeUserId) return 0;
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) {
    console.warn("[taskSync] pull fehlgeschlagen:", error.message);
    return 0;
  }
  const entries = (data ?? []).map(toEntry);
  if (entries.length) await db.entries.bulkPut(entries);
  return entries.length;
}

// Migration: alle lokalen Tasks in die Cloud übertragen (Button in Settings).
// Bestehende lokale Daten werden NICHT gelöscht — nur hochgeladen.
export async function pushAllLocalTasks(): Promise<number> {
  if (!supabase || !activeUserId) {
    throw new Error("Nicht eingeloggt — kein Cloud-Sync aktiv.");
  }
  const tasks = await db.entries.where("type").equals("task").toArray();
  if (!tasks.length) return 0;
  const { error } = await supabase.from(TABLE).upsert(tasks.map(toRow));
  if (error) throw new Error(error.message);
  return tasks.length;
}

// Lokalen Task-Cache aus IndexedDB entfernen. Wird bei Logout/Account-Wechsel
// gerufen, damit auf einem geteilten Gerät der nächste Nutzer keine fremden
// Tasks sieht. Betrifft NUR type === "task" — andere Module bleiben unberührt.
async function clearLocalTasks(): Promise<void> {
  await db.entries.where("type").equals("task").delete();
}

// Reaktion auf Login / Logout / Account-Wechsel.
async function handleAuthChange(prevId: string | null, newId: string | null): Promise<void> {
  if (!newId) {
    // Logout: lokalen Cloud-Cache leeren → keine fremden Daten für den
    // nächsten Nutzer dieses Geräts.
    await clearLocalTasks();
    return;
  }
  if (prevId && prevId !== newId) {
    // Account-Wechsel ohne Logout dazwischen: erst die Kopien des alten
    // Nutzers weg, dann die des neuen laden.
    await clearLocalTasks();
  } else {
    // Frischer Login: bisher rein-lokale Tasks zuerst hochladen, damit ein
    // späterer Logout-Clear sie nicht vernichtet (kein Datenverlust).
    try {
      await pushAllLocalTasks();
    } catch (e) {
      console.warn("[taskSync] Login-Push fehlgeschlagen:", (e as Error).message);
    }
  }
  await pullTasks();
}

// Einmal beim App-Start aufrufen. Verbindet Session-Status mit den
// Repository-Hooks. Ohne konfiguriertes Supabase passiert nichts.
export function initTaskSync(): void {
  if (!supabase) return;

  // Hooks immer registrieren — sie sind no-ops, solange activeUserId null ist.
  setTaskSyncHooks({ onUpsert: pushTask, onDelete: removeTaskRemote });

  // Beim Start: bestehende Session = Reload (kein Wechsel) → nur pullen.
  supabase.auth.getSession().then(({ data }) => {
    activeUserId = data.session?.user.id ?? null;
    if (activeUserId) void pullTasks();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    const newId = session?.user.id ?? null;
    if (newId === activeUserId) return; // z.B. Token-Refresh — kein echter Wechsel
    const prevId = activeUserId;
    activeUserId = newId;
    void handleAuthChange(prevId, newId);
  });
}
