import { addDaysIso, dayIndex } from "./date";
import type { RecurrenceRule } from "../types";

export const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Alte Tasks speichern recurrence als reinen String ("daily"|"weekly"|
// "monthly") statt als RecurrenceRule-Objekt. Normalisiert auf die neue
// Form, Interval-Default 1.
export function normalizeRecurrence(input: unknown): RecurrenceRule | undefined {
  if (!input) return undefined;
  if (typeof input === "string") {
    if (input === "daily" || input === "weekly" || input === "monthly") {
      return { kind: input, interval: 1 };
    }
    return undefined;
  }
  const r = input as Partial<RecurrenceRule>;
  if (!r.kind) return undefined;
  return { kind: r.kind, interval: r.interval ?? 1, weekdays: r.weekdays };
}

function addMonthsIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export function nextRecurDate(date: string, rule: RecurrenceRule): string {
  const interval = Math.max(1, rule.interval || 1);
  if (rule.kind === "daily") return addDaysIso(date, interval);
  if (rule.kind === "weekly") return addDaysIso(date, 7 * interval);
  if (rule.kind === "monthly") return addMonthsIso(date, interval);
  // weekdays: nächster Tag (max. 2 Wochen voraus), dessen Wochentag matcht.
  const days = rule.weekdays?.length ? rule.weekdays : [dayIndex(date)];
  for (let i = 1; i <= 14; i++) {
    const cand = addDaysIso(date, i);
    if (days.includes(dayIndex(cand))) return cand;
  }
  return addDaysIso(date, 7);
}

export function recurrenceLabel(rule: RecurrenceRule): string {
  const interval = Math.max(1, rule.interval || 1);
  if (rule.kind === "daily") return interval === 1 ? "Täglich" : `Alle ${interval} Tage`;
  if (rule.kind === "weekly") return interval === 1 ? "Wöchentlich" : `Alle ${interval} Wochen`;
  if (rule.kind === "monthly") return interval === 1 ? "Monatlich" : `Alle ${interval} Monate`;
  const days = rule.weekdays ?? [];
  return days.length ? days.map((d) => WEEKDAY_LABELS[d]).join(", ") : "Wochentage";
}
