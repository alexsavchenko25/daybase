import { describe, expect, test } from "vitest";
import {
  defaultConsistencyDay,
  daysInMonth,
  monthGridCells,
  summarizeConsistencyMonth,
  type DayStats,
} from "./consistency";

function stats(date: string, patch: Partial<DayStats> = {}): DayStats {
  return {
    date,
    tasksTotal: 0,
    tasksDone: 0,
    habitTotal: 0,
    habitDone: 0,
    focusMin: 0,
    focusSessions: 0,
    reviewExists: false,
    journalExists: false,
    ...patch,
  };
}

describe("consistency calendar dates", () => {
  test("builds leap-year months and full Monday-first grids", () => {
    const february = daysInMonth("2024-02-01");
    expect(february).toHaveLength(29);
    expect(february[0]).toBe("2024-02-01");
    expect(february[28]).toBe("2024-02-29");

    const august = monthGridCells("2026-08-01");
    expect(august).toHaveLength(42);
    expect(august.slice(0, 5)).toEqual(Array(5).fill(null));
    expect(august[5]).toBe("2026-08-01");
  });

  test("keeps local dates ordered across the Europe/Berlin DST boundary", () => {
    const march = daysInMonth("2026-03-01");
    expect(march).toHaveLength(31);
    expect(march.slice(27, 31)).toEqual([
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
    ]);
  });
});

describe("summarizeConsistencyMonth", () => {
  test("derives score, active days, streak and focus while excluding future days", () => {
    const summary = summarizeConsistencyMonth(
      [
        stats("2026-08-01", { tasksTotal: 1, tasksDone: 1 }),
        stats("2026-08-02", { tasksTotal: 2, tasksDone: 2 }),
        stats("2026-08-03", { tasksTotal: 1 }),
        stats("2026-08-04", { focusSessions: 1, focusMin: 30 }),
        stats("2026-08-05", { tasksTotal: 1, tasksDone: 1, focusSessions: 1, focusMin: 90 }),
      ],
      "2026-08-04",
      false,
      false,
    );

    expect(summary).toEqual({
      averageScore: 63,
      activeDays: 3,
      bestStreak: 2,
      focusMin: 30,
    });
  });

  test("returns an empty summary when no elapsed day has a score", () => {
    expect(
      summarizeConsistencyMonth([stats("2026-09-01")], "2026-08-09", false, false),
    ).toEqual({
      averageScore: null,
      activeDays: 0,
      bestStreak: 0,
      focusMin: 0,
    });
  });

  test("resets streaks on inactive and missing dates", () => {
    const summary = summarizeConsistencyMonth(
      [
        stats("2026-08-01", { habitTotal: 1, habitDone: 1 }),
        stats("2026-08-02", { reviewExists: true }),
        stats("2026-08-04", { journalExists: true }),
      ],
      "2026-08-31",
      true,
      true,
    );

    expect(summary.activeDays).toBe(3);
    expect(summary.bestStreak).toBe(2);
  });
});

describe("defaultConsistencyDay", () => {
  test("selects today in the current month even without activity", () => {
    expect(defaultConsistencyDay([stats("2026-08-08"), stats("2026-08-09")], "2026-08-09")).toBe(
      "2026-08-09",
    );
  });

  test("selects the latest active elapsed day for another month", () => {
    expect(
      defaultConsistencyDay(
        [
          stats("2026-07-20", { tasksTotal: 1, tasksDone: 1 }),
          stats("2026-07-21"),
          stats("2026-07-22", { focusSessions: 1, focusMin: 20 }),
        ],
        "2026-08-09",
      ),
    ).toBe("2026-07-22");
  });

  test("returns null for empty and future-only months", () => {
    expect(defaultConsistencyDay([], "2026-08-09")).toBeNull();
    expect(defaultConsistencyDay([stats("2026-09-01", { tasksDone: 1 })], "2026-08-09")).toBeNull();
  });
});
