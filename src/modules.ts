import type { EntryType } from "./types";

// Zentrale Definition der 6 Module – Single Source of Truth für Navigation
// und Routing. Jedes Modul mappt auf genau einen Entry-Typ.
export interface ModuleDef {
  path: string;
  label: string;
  labelEn: string;
  type: EntryType;
  icon: string;
}

export const MODULES: ModuleDef[] = [
  { path: "/journal", label: "Tagebuch", labelEn: "Journal", type: "journal", icon: "📓" },
  { path: "/tasks", label: "Tasks", labelEn: "Tasks", type: "task", icon: "✅" },
  { path: "/weekplan", label: "Wochenplan", labelEn: "Weekly Plan", type: "weekplan", icon: "🗓️" },
  { path: "/trades", label: "Trading Journal", labelEn: "Trading Journal", type: "trade", icon: "📈" },
  { path: "/habits", label: "Habit Tracker", labelEn: "Habit Tracker", type: "habit", icon: "🔁" },
  { path: "/notes", label: "Notizen", labelEn: "Notes", type: "note", icon: "🗒️" },
  { path: "/review", label: "Daily Review", labelEn: "Daily Review", type: "review", icon: "📝" },
  { path: "/weekly-review", label: "Weekly Review", labelEn: "Weekly Review", type: "weeklyreview", icon: "📅" },
  { path: "/goals", label: "Goals", labelEn: "Goals", type: "goal", icon: "🎯" },
  { path: "/projects", label: "Projects", labelEn: "Projects", type: "project", icon: "📂" },
  { path: "/focus", label: "Focus Mode", labelEn: "Focus Mode", type: "focus", icon: "⏱️" },
];
