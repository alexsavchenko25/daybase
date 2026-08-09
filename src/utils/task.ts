import { entriesRepo } from "../repository";
import { planRecurrenceSpawn } from "./recurrence";
import type { Entry, TaskMeta, TaskSchedule } from "../types";

const PRIORITIES: TaskMeta["priority"][] = ["low", "medium", "high"];
export const PRIORITY_ORDER: Record<TaskMeta["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// Defensiver Lesezugriff auf task.meta — analog zu habitMeta.
// Nötig, weil `meta` bewusst ungetypt ist: Backup-Import, Cloud-Zeilen und
// ältere Einträge können Felder weglassen. Ohne Defaults liefert z.B. eine
// fehlende `priority` NaN in der Sortierung (inkonsistente Reihenfolge).
export function taskMeta(e: Entry): TaskMeta {
  const m = (e.meta ?? {}) as Partial<TaskMeta>;
  return {
    ...m,
    done: m.done === true,
    priority: PRIORITIES.includes(m.priority as TaskMeta["priority"])
      ? (m.priority as TaskMeta["priority"])
      : "medium",
    subtasks: Array.isArray(m.subtasks) ? m.subtasks : [],
  };
}

// Abhaken/Wiederöffnen + ggf. Folge-Instanz einer wiederkehrenden Task
// anlegen. Zentral hier (statt in TasksPage), damit TodayPage dieselbe
// Spawn-once-Logik nutzt statt sie zu duplizieren (siehe recurrenceSpawned).
export async function toggleTaskDone(id: string): Promise<void> {
  const out: { spawn?: { date: string; m: TaskMeta } } = {};
  const updated = await entriesRepo.updateMeta(id, (_meta, current) => {
    const m = taskMeta(current);
    const done = !m.done;
    const next = planRecurrenceSpawn(m, current.date, done);
    if (!next) return { ...m, done };
    out.spawn = {
      date: next.date,
      m: { ...m, done: false, subtasks: [], recurrence: next.rule },
    };
    return { ...m, done, recurrenceSpawned: next.date };
  });
  if (out.spawn && updated) {
    await entriesRepo.create({
      type: "task",
      date: out.spawn.date,
      title: updated.title,
      content: updated.content,
      tags: updated.tags,
      meta: { ...out.spawn.m, recurrenceSpawned: undefined } satisfies TaskMeta,
    });
  }
}

// ---- Wochenplan-Einplanung ----
// Eine eingeplante Task bleibt EIN Entry: der Tag steckt in `Entry.date`, die
// Uhrzeit in `meta.schedule`. Der Wochenplan rendert sie mit, statt einen
// zweiten (weekplan-)Eintrag zu spiegeln — sonst müssten Titel, Erledigt-Status
// und Löschungen dauerhaft synchron gehalten werden.

export function isScheduled(m: TaskMeta): boolean {
  return !!m.schedule;
}

// Sortierschlüssel für die Tagesspalte. Ohne Startzeit ans Ende — identisch
// zur Regel für weekplan-Blöcke.
export function scheduleSortKey(s: TaskSchedule | undefined): string {
  return s?.startTime || "99:99";
}

// Task für `date` (+ optionale Uhrzeit) einplanen. Datum und meta wandern in
// EINEM atomaren Write, damit kein Zwischenzustand entsteht.
export async function scheduleTask(
  id: string,
  date: string,
  startTime = "",
  endTime = "",
): Promise<void> {
  await entriesRepo.updateAtomic(id, (current) => ({
    date,
    meta: { ...taskMeta(current), schedule: { startTime, endTime } } satisfies TaskMeta,
  }));
}

// Einplanung entfernen. Die Task selbst bleibt (inkl. Datum) erhalten — sie
// verschwindet nur aus dem Wochenplan.
export async function unscheduleTask(id: string): Promise<void> {
  await entriesRepo.updateAtomic(id, (current) => {
    const { schedule: _removed, ...rest } = taskMeta(current);
    return { meta: rest satisfies TaskMeta };
  });
}
