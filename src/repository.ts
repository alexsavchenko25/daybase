import { db } from "./db";
import type { Entry, EntryType, HabitMeta } from "./types";
import { computeStreak } from "./utils/habit";

// Generisches Entry-CRUD – modulübergreifend, kein Schema pro Modul.
// Alle Module (Tagebuch, Tasks, Trades, ...) nutzen exakt diese Funktionen.

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  // crypto.randomUUID ist in allen modernen Browsern verfügbar.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback für sehr alte Umgebungen.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Felder, die der Aufrufer beim Erstellen liefert. id/Zeitstempel werden
// hier zentral gesetzt; meta/tags sind optional und bekommen Defaults.
export type CreateEntryInput = Omit<
  Entry,
  "id" | "createdAt" | "updatedAt"
> & {
  tags?: string[];
  meta?: Record<string, any>;
};

// Beim Update sind alle Inhaltsfelder optional; id/createdAt sind unveränderlich.
export type UpdateEntryInput = Partial<
  Omit<Entry, "id" | "createdAt" | "updatedAt">
>;

// ---- Task-Sync-Hooks (optional, Supabase-agnostisch) ----
// taskSync.ts registriert hier Callbacks. Sie feuern NUR für type === "task"
// und sind no-ops, solange nichts registriert ist (= kein Cloud-Sync).
let taskUpsertHook: ((e: Entry) => void) | null = null;
let taskDeleteHook: ((id: string) => void) | null = null;
export function setTaskSyncHooks(h: {
  onUpsert: (e: Entry) => void;
  onDelete: (id: string) => void;
}): void {
  taskUpsertHook = h.onUpsert;
  taskDeleteHook = h.onDelete;
}

export const entriesRepo = {
  // CREATE
  async create(input: CreateEntryInput): Promise<Entry> {
    const ts = nowIso();
    const entry: Entry = {
      id: newId(),
      type: input.type,
      date: input.date,
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      meta: input.meta ?? {},
      createdAt: ts,
      updatedAt: ts,
    };
    await db.entries.add(entry);
    if (entry.type === "task") taskUpsertHook?.(entry);
    return entry;
  },

  // READ (einzeln)
  async get(id: string): Promise<Entry | undefined> {
    return db.entries.get(id);
  },

  // READ (alle, neueste zuerst)
  async getAll(): Promise<Entry[]> {
    return db.entries.orderBy("updatedAt").reverse().toArray();
  },

  // UPDATE (partielles Patch, setzt updatedAt automatisch)
  async update(id: string, patch: UpdateEntryInput): Promise<Entry | undefined> {
    await db.entries.update(id, { ...patch, updatedAt: nowIso() });
    const updated = await db.entries.get(id);
    if (updated?.type === "task") taskUpsertHook?.(updated);
    return updated;
  },

  // DELETE
  async remove(id: string): Promise<void> {
    const existing = await db.entries.get(id);
    await db.entries.delete(id);
    if (existing?.type === "task") taskDeleteHook?.(id);
  },

  // QUERY by type (indexiert)
  async queryByType(type: EntryType): Promise<Entry[]> {
    return db.entries.where("type").equals(type).toArray();
  },

  // QUERY by date range (inklusiv, indexiert über `date`)
  // `from` und `to` als ISO-Date-Strings (YYYY-MM-DD).
  async queryByDateRange(from: string, to: string): Promise<Entry[]> {
    return db.entries.where("date").between(from, to, true, true).toArray();
  },

  // QUERY kombiniert: ein Typ innerhalb einer Datums-Range (nutzt [type+date]).
  async queryByTypeAndDateRange(
    type: EntryType,
    from: string,
    to: string,
  ): Promise<Entry[]> {
    return db.entries
      .where("[type+date]")
      .between([type, from], [type, to], true, true)
      .toArray();
  },

  // QUERY by tag (Multi-Entry-Index)
  async queryByTag(tag: string): Promise<Entry[]> {
    return db.entries.where("tags").equals(tag).toArray();
  },

  // Hilfsfunktion: für ein konkretes Datum alle Einträge eines Typs.
  async queryByTypeOnDate(type: EntryType, date: string): Promise<Entry[]> {
    return db.entries.where("[type+date]").equals([type, date]).toArray();
  },
};

// ---- Backup (Export / Import) ----

export interface Backup {
  app: "daybase";
  version: number;
  exportedAt: string;
  entries: Entry[];
}

// Alle Entries als Backup-Objekt. Reines Lesen, ändert nichts.
export async function exportBackup(): Promise<Backup> {
  const entries = await db.entries.toArray();
  return {
    app: "daybase",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

export interface BackupSummary {
  total: number;
  byType: Partial<Record<string, number>>;
}

type ValidateOk = { ok: true; backup: Backup; summary: BackupSummary };
type ValidateErr = { ok: false; error: string };

export function validateBackup(data: unknown): ValidateOk | ValidateErr {
  if (!data || typeof data !== "object")
    return { ok: false, error: "Keine gültige JSON-Datei." };
  const obj = data as Record<string, unknown>;
  if (obj.app !== "daybase")
    return { ok: false, error: "Kein Daybase-Backup — fehlendes oder falsches 'app'-Feld." };
  if (!Array.isArray(obj.entries))
    return { ok: false, error: "Ungültiges Format: 'entries'-Array fehlt." };
  const valid = (obj.entries as unknown[]).filter(
    (e): e is Entry =>
      !!e &&
      typeof (e as Entry).id === "string" &&
      typeof (e as Entry).type === "string" &&
      typeof (e as Entry).date === "string",
  );
  if (valid.length === 0)
    return { ok: false, error: "Backup enthält keine gültigen Einträge." };
  const byType: Partial<Record<string, number>> = {};
  for (const e of valid) byType[e.type] = (byType[e.type] ?? 0) + 1;
  return {
    ok: true,
    backup: {
      app: "daybase",
      version: typeof obj.version === "number" ? obj.version : 1,
      exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : "",
      entries: valid,
    },
    summary: { total: valid.length, byType },
  };
}

// Backup importieren. bulkPut = upsert nach id: vorhandene Einträge mit
// gleicher id werden überschrieben, neue ergänzt. Bestehende, nicht im
// Backup enthaltene Einträge bleiben erhalten (kein destruktives Replace).
export async function importBackup(data: unknown): Promise<number> {
  const result = validateBackup(data);
  if (!result.ok) throw new Error(result.error);
  await db.entries.bulkPut(result.backup.entries);
  return result.backup.entries.length;
}

// Beim App-Load aufrufen: gespeicherte habit.streak gegen die echten
// completedDates abgleichen. Verpasste Tage/Wochen brechen den Streak hier,
// auch ohne dass der User abhakt.
export async function syncHabitStreaks(): Promise<void> {
  const habits = await db.entries.where("type").equals("habit").toArray();
  await Promise.all(
    habits.map((h) => {
      const m = h.meta as HabitMeta;
      const live = computeStreak(m.completedDates ?? [], m.frequency ?? "daily");
      if (live !== m.streak) {
        return entriesRepo.update(h.id, { meta: { ...m, streak: live } });
      }
      return undefined;
    }),
  );
}
