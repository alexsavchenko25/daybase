import { addDaysIso, isoWeekKey, todayIso } from "./date";
import type { Entry, HabitMeta } from "../types";

// Streak aus completedDates ableiten (Single Source of Truth = die Daten,
// nicht der gespeicherte Zähler). Dadurch bricht Streak automatisch, sobald
// ein Tag/Woche fehlt — egal ob beim Abhaken oder beim App-Load geprüft.
export function computeStreak(
  completedDates: string[],
  frequency: HabitMeta["frequency"],
  ref = todayIso(),
): number {
  if (frequency === "daily") {
    const set = new Set(completedDates);
    // Anchor: heute, sonst gestern (heute darf noch offen sein ohne Bruch).
    let cur: string;
    if (set.has(ref)) cur = ref;
    else if (set.has(addDaysIso(ref, -1))) cur = addDaysIso(ref, -1);
    else return 0;
    let streak = 0;
    while (set.has(cur)) {
      streak++;
      cur = addDaysIso(cur, -1);
    }
    return streak;
  }

  // weekly: ≥1 Completion pro ISO-Woche zählt. Konsekutive Wochen.
  const weeks = new Set(completedDates.map(isoWeekKey));
  let cur: string;
  if (weeks.has(isoWeekKey(ref))) cur = ref;
  else if (weeks.has(isoWeekKey(addDaysIso(ref, -7)))) cur = addDaysIso(ref, -7);
  else return 0;
  let streak = 0;
  while (weeks.has(isoWeekKey(cur))) {
    streak++;
    cur = addDaysIso(cur, -7);
  }
  return streak;
}

// Im aktuellen Zeitraum erledigt? daily = heute, weekly = diese Woche.
export function isDoneForPeriod(
  completedDates: string[],
  frequency: HabitMeta["frequency"],
  ref = todayIso(),
): boolean {
  if (frequency === "daily") return completedDates.includes(ref);
  const wk = isoWeekKey(ref);
  return completedDates.some((d) => isoWeekKey(d) === wk);
}

export function habitMeta(e: Entry): HabitMeta {
  const m = e.meta as Partial<HabitMeta>;
  return {
    frequency: m.frequency ?? "daily",
    streak: m.streak ?? 0,
    completedDates: m.completedDates ?? [],
  };
}
