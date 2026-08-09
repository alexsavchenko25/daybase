import { describe, expect, test } from "vitest";
import { buildHabitHeatmap } from "./habitHeatmap";
import type { Entry, HabitMeta } from "../types";

function habit(
  id: string,
  frequency: HabitMeta["frequency"],
  date: string,
  completedDates: string[] = [],
): Entry {
  return {
    id,
    type: "habit",
    date,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    title: id,
    content: "",
    tags: [],
    meta: { frequency, streak: 0, completedDates } satisfies HabitMeta,
  };
}

describe("buildHabitHeatmap", () => {
  test("returns exactly 30 ordered dates ending at the reference date", () => {
    const data = buildHabitHeatmap([], "2026-08-09");

    expect(data.dates).toHaveLength(30);
    expect(data.dates[0]).toBe("2026-07-11");
    expect(data.dates[29]).toBe("2026-08-09");
    expect([...data.dates].sort()).toEqual(data.dates);
  });

  test("derives daily completed, missed, open and pre-creation states", () => {
    const data = buildHabitHeatmap(
      [habit("read", "daily", "2026-08-06", ["2026-08-07"])],
      "2026-08-09",
      5,
    );

    expect(data.dailyRows[0].cells.map((cell) => cell.state)).toEqual([
      "notApplicable",
      "missed",
      "completed",
      "missed",
      "open",
    ]);
  });

  test("groups weekly habits by ISO week across a year boundary", () => {
    const data = buildHabitHeatmap(
      [habit("plan", "weekly", "2025-12-01", ["2025-12-29", "2026-01-02"])],
      "2026-01-05",
      10,
    );

    expect(data.weeks.map((week) => week.key)).toEqual(["2025-W52", "2026-W01", "2026-W02"]);
    expect(data.weeklyRows[0].cells.map((cell) => cell.state)).toEqual([
      "missed",
      "completed",
      "open",
    ]);
  });

  test("counts multiple completion dates in one ISO week as one completed cell", () => {
    const data = buildHabitHeatmap(
      [habit("gym", "weekly", "2026-07-01", ["2026-07-27", "2026-07-29", "2026-08-03"])],
      "2026-08-05",
      10,
    );

    expect(data.weeklyRows[0].cells.map((cell) => cell.state)).toEqual([
      "completed",
      "completed",
    ]);
  });

  test("marks weekly periods before creation as not applicable", () => {
    const data = buildHabitHeatmap(
      [habit("review", "weekly", "2026-08-03")],
      "2026-08-09",
      14,
    );

    expect(data.weeklyRows[0].cells.map((cell) => cell.state)).toEqual([
      "notApplicable",
      "open",
    ]);
  });

  test("separates daily and weekly rows and handles empty inputs", () => {
    const empty = buildHabitHeatmap([], "2026-08-09");
    expect(empty.dailyRows).toEqual([]);
    expect(empty.weeklyRows).toEqual([]);

    const dailyOnly = buildHabitHeatmap([habit("walk", "daily", "2026-08-01")], "2026-08-09");
    expect(dailyOnly.dailyRows).toHaveLength(1);
    expect(dailyOnly.weeklyRows).toEqual([]);
  });

  test("keeps consecutive local dates across the Europe/Berlin DST change", () => {
    const data = buildHabitHeatmap([], "2026-03-30", 4);
    expect(data.dates).toEqual(["2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30"]);
  });
});
