import type { EntryType } from "./types";
import type { IconName } from "./components/Icon";

// Zentrale Definition der 6 Module – Single Source of Truth für Navigation
// und Routing. Jedes Modul mappt auf genau einen Entry-Typ.
export interface ModuleDef {
  path: string;
  label: string;
  labelEn: string;
  type: EntryType;
  icon: IconName;
}

export const MODULES: ModuleDef[] = [
  { path: "/journal", label: "Tagebuch", labelEn: "Journal", type: "journal", icon: "journal" },
  { path: "/tasks", label: "Tasks", labelEn: "Tasks", type: "task", icon: "tasks" },
  { path: "/weekplan", label: "Wochenplan", labelEn: "Weekly Plan", type: "weekplan", icon: "weekplan" },
  { path: "/trades", label: "Trading Journal", labelEn: "Trading Journal", type: "trade", icon: "trades" },
  { path: "/habits", label: "Habit Tracker", labelEn: "Habit Tracker", type: "habit", icon: "habit" },
  { path: "/notes", label: "Notizen", labelEn: "Notes", type: "note", icon: "notes" },
  { path: "/review", label: "Daily Review", labelEn: "Daily Review", type: "review", icon: "review" },
  { path: "/weekly-review", label: "Weekly Review", labelEn: "Weekly Review", type: "weeklyreview", icon: "weekly-review" },
  { path: "/goals", label: "Goals", labelEn: "Goals", type: "goal", icon: "goal" },
  { path: "/projects", label: "Projects", labelEn: "Projects", type: "project", icon: "project" },
  { path: "/focus", label: "Focus Mode", labelEn: "Focus Mode", type: "focus", icon: "focus" },
];
