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

// Completion für `ref` setzen/entfernen — passend zur Periode, die die
// Checkbox anzeigt (isDoneForPeriod). Bei "weekly" hakt die Box ab, sobald
// IRGENDEIN Tag der ISO-Woche erledigt ist; das Entfernen muss deshalb die
// ganze Woche räumen, sonst lässt sich eine am Montag erledigte Wochen-Habit
// am Mittwoch nicht mehr abwählen (jeder Klick hätte nur weitere Daten
// hinzugefügt bzw. entfernt, ohne den Haken je zu ändern).
export function toggleCompletion(
  completedDates: string[],
  frequency: HabitMeta["frequency"],
  ref = todayIso(),
): string[] {
  const unique = [...new Set(completedDates)];
  if (!isDoneForPeriod(unique, frequency, ref)) return [...unique, ref].sort();
  const wk = isoWeekKey(ref);
  return unique
    .filter((d) => (frequency === "weekly" ? isoWeekKey(d) !== wk : d !== ref))
    .sort();
}

export function habitMeta(e: Entry): HabitMeta {
  const m = (e.meta ?? {}) as Partial<HabitMeta>;
  return {
    ...m,
    frequency: m.frequency === "weekly" ? "weekly" : "daily",
    streak: m.streak ?? 0,
    // Doppelte Daten würden Statistiken (z.B. Weekly-Review-Quote) über 100%
    // treiben — hier einmal zentral entschärft.
    completedDates: [...new Set(m.completedDates ?? [])].sort(),
  };
}
