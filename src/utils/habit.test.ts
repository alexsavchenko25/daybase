import { describe, expect, test } from "vitest";
import { computeStreak, habitMeta, isDoneForPeriod, toggleCompletion } from "./habit";
import type { Entry } from "../types";

const entry = (meta: unknown): Entry =>
  ({
    id: "h1",
    type: "habit",
    date: "2026-08-03",
    createdAt: "",
    updatedAt: "",
    title: "",
    content: "",
    tags: [],
    meta,
  }) as Entry;

describe("computeStreak (daily)", () => {
  test("zählt aufeinanderfolgende Tage inkl. heute", () => {
    expect(computeStreak(["2026-08-01", "2026-08-02", "2026-08-03"], "daily", "2026-08-03")).toBe(3);
  });

  test("heute noch offen bricht den Streak nicht (Anker = gestern)", () => {
    expect(computeStreak(["2026-08-01", "2026-08-02"], "daily", "2026-08-03")).toBe(2);
  });

  test("eine Lücke bricht den Streak", () => {
    expect(computeStreak(["2026-07-30", "2026-08-02", "2026-08-03"], "daily", "2026-08-03")).toBe(2);
  });

  test("zwei Tage ohne Completion → 0", () => {
    expect(computeStreak(["2026-07-28"], "daily", "2026-08-03")).toBe(0);
  });

  test("über eine Sommerzeit-Umstellung hinweg (2026-03-29, Europe/Berlin)", () => {
    expect(
      computeStreak(["2026-03-28", "2026-03-29", "2026-03-30"], "daily", "2026-03-30"),
    ).toBe(3);
  });
});

describe("computeStreak (weekly)", () => {
  test("eine Completion pro ISO-Woche zählt, egal an welchem Tag", () => {
    // 2026-07-21 (KW30, Di), 2026-07-27 (KW31, Mo), 2026-08-03 (KW32, Mo)
    expect(computeStreak(["2026-07-21", "2026-07-27", "2026-08-03"], "weekly", "2026-08-03")).toBe(3);
  });

  test("mehrere Completions in derselben Woche zählen einmal", () => {
    expect(computeStreak(["2026-08-03", "2026-08-04", "2026-08-05"], "weekly", "2026-08-05")).toBe(1);
  });

  test("ausgelassene Woche bricht den Streak", () => {
    expect(computeStreak(["2026-07-13", "2026-08-03"], "weekly", "2026-08-03")).toBe(1);
  });
});

describe("toggleCompletion", () => {
  test("daily: setzt und entfernt genau heute", () => {
    expect(toggleCompletion([], "daily", "2026-08-03")).toEqual(["2026-08-03"]);
    expect(toggleCompletion(["2026-08-03"], "daily", "2026-08-03")).toEqual([]);
  });

  test("daily: andere Tage bleiben unberührt", () => {
    expect(toggleCompletion(["2026-08-02", "2026-08-03"], "daily", "2026-08-03")).toEqual([
      "2026-08-02",
    ]);
  });

  // Regression: Wochen-Habit am Montag erledigt, am Mittwoch abwählen.
  // Vorher wurde nur "Mittwoch" getoggelt — die Checkbox (die auf die ganze
  // Woche schaut) blieb dauerhaft angehakt und sammelte Zusatz-Daten an.
  test("weekly: abwählen räumt die ganze ISO-Woche", () => {
    const after = toggleCompletion(["2026-07-27", "2026-08-03"], "weekly", "2026-08-05");
    expect(after).toEqual(["2026-07-27"]);
    expect(isDoneForPeriod(after, "weekly", "2026-08-05")).toBe(false);
  });

  test("weekly: an-/abwählen ist idempotent (kein Aufsammeln von Daten)", () => {
    let dates = toggleCompletion([], "weekly", "2026-08-05"); // an
    dates = toggleCompletion(dates, "weekly", "2026-08-05"); // ab
    dates = toggleCompletion(dates, "weekly", "2026-08-05"); // an
    expect(dates).toEqual(["2026-08-05"]);
  });

  test("entfernt Duplikate aus Altdaten", () => {
    expect(toggleCompletion(["2026-08-01", "2026-08-01"], "daily", "2026-08-03")).toEqual([
      "2026-08-01",
      "2026-08-03",
    ]);
  });
});

describe("habitMeta", () => {
  test("setzt Defaults für unvollständiges meta", () => {
    expect(habitMeta(entry({}))).toEqual({
      frequency: "daily",
      streak: 0,
      completedDates: [],
    });
  });

  test("dedupliziert und sortiert completedDates", () => {
    const m = habitMeta(entry({ completedDates: ["2026-08-03", "2026-08-01", "2026-08-03"] }));
    expect(m.completedDates).toEqual(["2026-08-01", "2026-08-03"]);
  });

  test("unbekannte frequency fällt auf daily zurück", () => {
    expect(habitMeta(entry({ frequency: "monthly" })).frequency).toBe("daily");
  });
});
