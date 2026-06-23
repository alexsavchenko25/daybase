// Lokales Datum als ISO-Date (YYYY-MM-DD), ohne UTC-Verschiebung.
export function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

// ISO-Date n Tage verschoben (n negativ = zurück).
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

// ISO-Wochen-Key, z.B. "2026-W26". Montag = Wochenstart (ISO 8601).
export function isoWeekKey(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  // Donnerstag dieser Woche bestimmt Jahr+Woche (ISO 8601).
  const day = (d.getDay() + 6) % 7; // Mo=0 .. So=6
  d.setDate(d.getDate() - day + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const ft = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - ft + 3);
  const week =
    1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Letzte n ISO-Dates inkl. heute, ältestes zuerst.
export function lastNDays(n: number, from = todayIso()): string[] {
  return Array.from({ length: n }, (_, i) => addDaysIso(from, -(n - 1 - i)));
}

// Montag der Woche von `iso` (ISO 8601, Mo = Wochenstart).
export function mondayOfIso(iso = todayIso()): string {
  const d = new Date(iso + "T00:00:00");
  const day = (d.getDay() + 6) % 7; // Mo=0 .. So=6
  return addDaysIso(iso, -day);
}

// ISO-Wochennummer (1..53).
export function isoWeekNumber(iso: string): number {
  return parseInt(isoWeekKey(iso).split("-W")[1], 10);
}

// Wochentag-Index, Mo=0 .. So=6.
export function dayIndex(iso: string): number {
  return (new Date(iso + "T00:00:00").getDay() + 6) % 7;
}
