// Zentrales, modulübergreifendes Datenmodell.
// EIN Entry-Objekt für alle Module – typ-spezifische Felder leben in `meta`.

export type EntryType =
  | "journal"
  | "task"
  | "weekplan"
  | "trade"
  | "habit"
  | "note"
  | "review"
  | "weeklyreview"
  | "goal"
  | "project";

export interface Entry {
  id: string;
  type: EntryType;
  date: string; // ISO date (YYYY-MM-DD)
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  title: string;
  content: string;
  tags: string[];
  meta: Record<string, any>; // typ-spezifische Felder, siehe unten
}

// --- Typ-spezifische meta-Shapes (Dokumentation + optionale Helfer-Typen) ---
// Diese Interfaces beschreiben, was in `meta` je Typ erwartet wird. Sie werden
// (noch) nicht hart erzwungen – `meta` bleibt bewusst flexibel –, dienen aber
// als Vertrag für die späteren Module.

export interface TaskMeta {
  done: boolean;
  priority: "low" | "medium" | "high";
  projectId?: string; // optionale Zuordnung
  goalId?: string;
}

export type GoalPeriod = "weekly" | "monthly" | "yearly";
export type GoalStatus = "active" | "done" | "paused" | "dropped";

export interface GoalMeta {
  category: string;
  period: GoalPeriod;
  deadline: string; // ISO date, optional ""
  status: GoalStatus;
  progress: number; // 0-100, manuell
}

export type ProjectStatus = "active" | "done" | "paused";

export interface ProjectMeta {
  category: string;
  status: ProjectStatus;
  deadline: string; // ISO date, optional ""
}

export interface NoteMeta {
  projectId?: string;
  goalId?: string;
}

export interface HabitMeta {
  frequency: "daily" | "weekly";
  streak: number;
  completedDates: string[]; // ISO dates
}

export interface TradeMeta {
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  size: number;
  pointValue: number; // $ pro Punkt (Futures: NQ=20, ES=50, MNQ=2, MES=5)
  pnl: number; // berechnet, gespeichert
  setupTag: string;
  screenshot?: string; // Base64 Data-URL, optional
}

export interface WeekplanMeta {
  weekNumber: number;
  dayOfWeek: number; // 0 = Sonntag ... 6 = Samstag
}

export interface ReviewMeta {
  wins: string;
  problems: string;
  lessons: string;
  energy: number; // 1-10
  focus: number; // 1-10
  mood: number; // 1-10
  tomorrowPriority: string;
}

export interface WeeklyReviewMeta {
  wins: string; // Top 3 Wins
  problems: string; // Top 3 Problems
  lessons: string;
  improve: string; // What to improve next week
  nextWeekFocus: string;
  score: number; // Weekly Score 1-10
  energy: number; // subjektiv 1-10
  discipline: number; // subjektiv 1-10
  movedGoalsProjects: string; // welche Goals/Projects bewegt
}

// journal & note: keine zusätzlichen meta-Felder nötig.

// Mapping Typ -> meta-Shape (für späteren typsicheren Zugriff verfügbar).
export interface MetaByType {
  journal: Record<string, never>;
  note: Record<string, never>;
  task: TaskMeta;
  habit: HabitMeta;
  trade: TradeMeta;
  weekplan: WeekplanMeta;
  review: ReviewMeta;
  weeklyreview: WeeklyReviewMeta;
  goal: GoalMeta;
  project: ProjectMeta;
}
