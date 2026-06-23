// Wochenplan-Kategorien. IDs sind Single Source of Truth; die Farben leben als
// CSS-Tokens (.cat-<id>) in index.css, NICHT inline im Code.
export type CategoryId =
  | "morning"
  | "clipping"
  | "break"
  | "calisthenics"
  | "learning"
  | "trading"
  | "review"
  | "wind-down";

export interface CategoryDef {
  id: CategoryId;
  label: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "morning", label: "Morning" },
  { id: "clipping", label: "Clipping" },
  { id: "calisthenics", label: "Calisthenics" },
  { id: "learning", label: "Learning" },
  { id: "trading", label: "Trading" },
  { id: "review", label: "Review" },
  { id: "wind-down", label: "Wind-down" },
  { id: "break", label: "Break" },
];

export const DEFAULT_CATEGORY: CategoryId = "morning";

export function catClass(id: CategoryId): string {
  return `cat-${id}`;
}
