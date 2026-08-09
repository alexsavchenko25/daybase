// Reine Ableitungslogik für die Consistency Calendar (Dashboard-Aggregator,
// kein eigener EntryType, kein Rollup-Store — alles live aus vorhandenen
// Entries berechnet). Siehe pages/ConsistencyPage.tsx für die UI.
import { addDaysIso, dayIndex } from "./date";
import { habitMeta } from "./habit";
import { taskMeta } from "./task";
import { focusMeta } from "./focus";
import type { Entry } from "../types";

export interface DayStats {
  date: string;
  tasksTotal: number;
  tasksDone: number;
  habitTotal: number; // an diesem Tag bereits existierende Habits
  habitDone: number;
  focusMin: number;
  focusSessions: number;
  reviewExists: boolean;
  journalExists: boolean;
}

export interface MonthConsistencySummary {
  averageScore: number | null;
  activeDays: number;
  bestStreak: number;
  focusMin: number;
}

export function groupByDate(entries: Entry[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  return map;
}

// Alle Kalendertage eines Monats, aufsteigend (monthStart = "YYYY-MM-01").
export function daysInMonth(monthStart: string): string[] {
  const prefix = monthStart.slice(0, 7);
  const days: string[] = [];
  let d = monthStart;
  while (d.slice(0, 7) === prefix) {
    days.push(d);
    d = addDaysIso(d, 1);
  }
  return days;
}

// Kalenderraster mit Mo-Padding vorne/hinten für volle Wochenzeilen.
// `null` = Füllzelle außerhalb des Monats (nicht interaktiv).
export function monthGridCells(monthStart: string): (string | null)[] {
  const days = daysInMonth(monthStart);
  const leadingPad = dayIndex(monthStart); // Mo=0..So=6
  const trailingPad = (7 - ((leadingPad + days.length) % 7)) % 7;
  return [...Array(leadingPad).fill(null), ...days, ...Array(trailingPad).fill(null)];
}

// Stats für einen Tag aus bereits monatsbegrenzt geladenen Entries. Habits
// sind ungefiltert (komplette Liste): ihre relevanten Daten (completedDates)
// stecken in meta und sind nicht über den date-Index abfragbar.
export function computeDayStats(
  date: string,
  tasksByDate: Map<string, Entry[]>,
  habits: Entry[],
  focusByDate: Map<string, Entry[]>,
  reviewDates: Set<string>,
  journalDates: Set<string>,
): DayStats {
  const dayTasks = tasksByDate.get(date) ?? [];
  const tasksDone = dayTasks.filter((t) => taskMeta(t).done).length;

  // Nur Habits, die an diesem Tag schon existierten — sonst würde eine heute
  // angelegte Habit vergangene Kalendertage fälschlich belasten.
  const eligibleHabits = habits.filter((h) => h.createdAt.slice(0, 10) <= date);
  const habitDone = eligibleHabits.filter((h) => habitMeta(h).completedDates.includes(date)).length;

  const dayFocus = focusByDate.get(date) ?? [];
  const focusMin = Math.round(dayFocus.reduce((s, e) => s + focusMeta(e).actualSec, 0) / 60);

  return {
    date,
    tasksTotal: dayTasks.length,
    tasksDone,
    habitTotal: eligibleHabits.length,
    habitDone,
    focusMin,
    focusSessions: dayFocus.length,
    reviewExists: reviewDates.has(date),
    journalExists: journalDates.has(date),
  };
}

// Gesamt-Score 0..1 fürs Hintergrund-Shading, oder null = keine Bewertung
// möglich (zukünftiger Tag, oder Tag ganz ohne Signal). Kontinuierliche
// Signale (Tasks/Habits/Fokus) zählen nur, wenn an dem Tag überhaupt etwas
// dazu vorlag — ein Tag ganz ohne geplante Tasks soll nicht wie ein
// verpasster Tag aussehen. Review/Journal zählen nur, wenn der Nutzer diese
// Module überhaupt je genutzt hat (trackReview/trackJournal) — sonst würde
// jemand, der nie Reviews schreibt, an jedem einzelnen Tag "bestraft".
export function dayScore(
  stats: DayStats,
  isFuture: boolean,
  trackReview: boolean,
  trackJournal: boolean,
): number | null {
  if (isFuture) return null;
  const hasSignal =
    stats.tasksTotal > 0 || stats.habitTotal > 0 || stats.focusSessions > 0 || trackReview || trackJournal;
  if (!hasSignal) return null;

  const signals: number[] = [];
  if (stats.tasksTotal > 0) signals.push(stats.tasksDone / stats.tasksTotal);
  if (stats.habitTotal > 0) signals.push(stats.habitDone / stats.habitTotal);
  if (stats.focusSessions > 0) signals.push(Math.min(stats.focusMin / 60, 1));
  if (trackReview) signals.push(stats.reviewExists ? 1 : 0);
  if (trackJournal) signals.push(stats.journalExists ? 1 : 0);
  return signals.length ? signals.reduce((a, b) => a + b, 0) / signals.length : null;
}

// 0..4 Intensitätsstufen (github-artig) fürs Zellen-Shading, -1 = keine Daten.
export function intensityLevel(score: number | null): number {
  if (score === null) return -1;
  if (score <= 0) return 0;
  if (score < 0.34) return 1;
  if (score < 0.67) return 2;
  if (score < 1) return 3;
  return 4;
}

export function hasDayActivity(stats: DayStats): boolean {
  return (
    stats.tasksDone > 0 ||
    stats.habitDone > 0 ||
    stats.focusSessions > 0 ||
    stats.reviewExists ||
    stats.journalExists
  );
}

export function summarizeConsistencyMonth(
  stats: DayStats[],
  today: string,
  trackReview: boolean,
  trackJournal: boolean,
): MonthConsistencySummary {
  const elapsed = stats
    .filter((day) => day.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const scores = elapsed
    .map((day) => dayScore(day, false, trackReview, trackJournal))
    .filter((score): score is number => score !== null);

  let bestStreak = 0;
  let currentStreak = 0;
  let previousDate: string | null = null;
  for (const day of elapsed) {
    const followsPrevious = previousDate === null || addDaysIso(previousDate, 1) === day.date;
    currentStreak = hasDayActivity(day) && followsPrevious ? currentStreak + 1 : hasDayActivity(day) ? 1 : 0;
    bestStreak = Math.max(bestStreak, currentStreak);
    previousDate = day.date;
  }

  return {
    averageScore: scores.length
      ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100)
      : null,
    activeDays: elapsed.filter(hasDayActivity).length,
    bestStreak,
    focusMin: elapsed.reduce((sum, day) => sum + day.focusMin, 0),
  };
}

export function defaultConsistencyDay(stats: DayStats[], today: string): string | null {
  if (stats.some((day) => day.date === today)) return today;
  return (
    stats
      .filter((day) => day.date <= today && hasDayActivity(day))
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null
  );
}
