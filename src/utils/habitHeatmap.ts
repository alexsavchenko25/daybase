import { addDaysIso, isoWeekKey, lastNDays, mondayOfIso, todayIso } from "./date";
import { habitMeta } from "./habit";
import type { Entry } from "../types";

export type HabitHeatmapState = "completed" | "open" | "missed" | "notApplicable";

export interface HabitHeatmapCell {
  key: string;
  state: HabitHeatmapState;
  isCurrent: boolean;
}

export interface HabitHeatmapRow {
  habitId: string;
  title: string;
  cells: HabitHeatmapCell[];
}

export interface HabitHeatmapWeek {
  key: string;
  start: string;
  end: string;
  isCurrent: boolean;
}

export interface HabitHeatmapData {
  dates: string[];
  weeks: HabitHeatmapWeek[];
  dailyRows: HabitHeatmapRow[];
  weeklyRows: HabitHeatmapRow[];
}

function habitStartDate(habit: Entry): string {
  // Habit dates are local ISO dates and are never rescheduled. Prefer that
  // over createdAt, whose UTC timestamp can fall on the previous local day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(habit.date)) return habit.date;
  const createdDate = habit.createdAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(createdDate) ? createdDate : "0000-01-01";
}

function dailyState(habit: Entry, date: string, ref: string): HabitHeatmapState {
  if (date < habitStartDate(habit)) return "notApplicable";
  if (habitMeta(habit).completedDates.includes(date)) return "completed";
  return date === ref ? "open" : "missed";
}

function heatmapWeeks(dates: string[], ref: string): HabitHeatmapWeek[] {
  const seen = new Set<string>();
  const weeks: HabitHeatmapWeek[] = [];
  const currentKey = isoWeekKey(ref);

  for (const date of dates) {
    const key = isoWeekKey(date);
    if (seen.has(key)) continue;
    seen.add(key);
    const start = mondayOfIso(date);
    weeks.push({
      key,
      start,
      end: addDaysIso(start, 6),
      isCurrent: key === currentKey,
    });
  }
  return weeks;
}

function weeklyState(habit: Entry, week: HabitHeatmapWeek): HabitHeatmapState {
  const startDate = habitStartDate(habit);
  if (week.end < startDate) return "notApplicable";

  const completed = habitMeta(habit).completedDates.some(
    (date) => date >= startDate && isoWeekKey(date) === week.key,
  );
  if (completed) return "completed";
  return week.isCurrent ? "open" : "missed";
}

/** Builds the read-only heatmap from existing habit entries. */
export function buildHabitHeatmap(
  habits: Entry[],
  ref = todayIso(),
  dayCount = 30,
): HabitHeatmapData {
  const dates = lastNDays(dayCount, ref);
  const weeks = heatmapWeeks(dates, ref);
  const dailyRows: HabitHeatmapRow[] = [];
  const weeklyRows: HabitHeatmapRow[] = [];

  for (const habit of habits) {
    const meta = habitMeta(habit);
    if (meta.frequency === "daily") {
      dailyRows.push({
        habitId: habit.id,
        title: habit.title,
        cells: dates.map((date) => ({
          key: date,
          state: dailyState(habit, date, ref),
          isCurrent: date === ref,
        })),
      });
    } else {
      weeklyRows.push({
        habitId: habit.id,
        title: habit.title,
        cells: weeks.map((week) => ({
          key: week.key,
          state: weeklyState(habit, week),
          isCurrent: week.isCurrent,
        })),
      });
    }
  }

  return { dates, weeks, dailyRows, weeklyRows };
}
