import type { EntryType } from "./types";

// Zentrale Definition der 6 Module – Single Source of Truth für Navigation
// und Routing. Jedes Modul mappt auf genau einen Entry-Typ.
export interface ModuleDef {
  path: string;
  label: string;
  type: EntryType;
  icon: string;
}

export const MODULES: ModuleDef[] = [
  { path: "/journal", label: "Tagebuch", type: "journal", icon: "📓" },
  { path: "/tasks", label: "Tasks", type: "task", icon: "✅" },
  { path: "/weekplan", label: "Wochenplan", type: "weekplan", icon: "🗓️" },
  { path: "/trades", label: "Trading Journal", type: "trade", icon: "📈" },
  { path: "/habits", label: "Habit Tracker", type: "habit", icon: "🔁" },
  { path: "/notes", label: "Notizen", type: "note", icon: "🗒️" },
  { path: "/review", label: "Daily Review", type: "review", icon: "📝" },
  { path: "/weekly-review", label: "Weekly Review", type: "weeklyreview", icon: "📅" },
];
