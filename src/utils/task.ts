import type { Entry, TaskMeta } from "../types";

const PRIORITIES: TaskMeta["priority"][] = ["low", "medium", "high"];

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
