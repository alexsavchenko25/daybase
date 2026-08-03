import { describe, expect, test } from "vitest";
import { nextRecurDate, normalizeRecurrence, planRecurrenceSpawn } from "./recurrence";
import { addDaysIso, isoWeekKey, mondayOfIso, todayIso } from "./date";

describe("nextRecurDate", () => {
  test("daily / weekly / monthly", () => {
    expect(nextRecurDate("2026-08-03", { kind: "daily", interval: 1 })).toBe("2026-08-04");
    expect(nextRecurDate("2026-08-03", { kind: "weekly", interval: 1 })).toBe("2026-08-10");
    expect(nextRecurDate("2026-08-03", { kind: "monthly", interval: 1 })).toBe("2026-09-03");
  });

  test("Intervall > 1", () => {
    expect(nextRecurDate("2026-08-03", { kind: "daily", interval: 3 })).toBe("2026-08-06");
    expect(nextRecurDate("2026-08-03", { kind: "weekly", interval: 2 })).toBe("2026-08-17");
  });

  test("weekdays springt auf den nächsten passenden Wochentag", () => {
    // Mo=0 … So=6; 2026-08-03 ist ein Montag → nächster Mi (2) = 2026-08-05
    expect(nextRecurDate("2026-08-03", { kind: "weekdays", interval: 1, weekdays: [0, 2, 4] })).toBe(
      "2026-08-05",
    );
    // Freitag (4) → nächster Montag der Folgewoche
    expect(nextRecurDate("2026-08-07", { kind: "weekdays", interval: 1, weekdays: [0, 2, 4] })).toBe(
      "2026-08-10",
    );
  });

  test("bleibt über die Sommerzeit-Umstellung auf dem Kalendertag", () => {
    // Europe/Berlin: Umstellung in der Nacht 2026-03-28 → 2026-03-29
    expect(nextRecurDate("2026-03-28", { kind: "daily", interval: 1 })).toBe("2026-03-29");
    expect(nextRecurDate("2026-03-28", { kind: "weekly", interval: 1 })).toBe("2026-04-04");
    // Rückumstellung Ende Oktober
    expect(nextRecurDate("2026-10-24", { kind: "daily", interval: 1 })).toBe("2026-10-25");
  });
});

describe("normalizeRecurrence", () => {
  test("akzeptiert alte String-Form", () => {
    expect(normalizeRecurrence("weekly")).toEqual({ kind: "weekly", interval: 1 });
  });

  test("null/undefined/unbekannt → undefined", () => {
    expect(normalizeRecurrence(undefined)).toBeUndefined();
    expect(normalizeRecurrence("yearly")).toBeUndefined();
    expect(normalizeRecurrence({})).toBeUndefined();
  });
});

// Regression: bisher erzeugte jedes Abhaken eine Folge-Instanz — Ab- und
// wieder Anhaken (oder ein Doppelklick) legte Duplikate an.
describe("planRecurrenceSpawn", () => {
  const rule = { kind: "daily", interval: 1 } as const;

  test("erzeugt beim ersten Abhaken genau eine Folge-Instanz", () => {
    expect(planRecurrenceSpawn({ recurrence: rule }, "2026-08-03", true)).toEqual({
      date: "2026-08-04",
      rule: { kind: "daily", interval: 1, weekdays: undefined },
    });
  });

  test("erneutes Abhaken erzeugt keine zweite", () => {
    expect(
      planRecurrenceSpawn({ recurrence: rule, recurrenceSpawned: "2026-08-04" }, "2026-08-03", true),
    ).toBeNull();
  });

  test("Wiedereröffnen erzeugt nichts", () => {
    expect(planRecurrenceSpawn({ recurrence: rule }, "2026-08-03", false)).toBeNull();
  });

  test("Task ohne Wiederholung erzeugt nichts", () => {
    expect(planRecurrenceSpawn({}, "2026-08-03", true)).toBeNull();
  });
});

describe("Datums-Hilfen (Basis für Today-/Week-Filter)", () => {
  test("mondayOfIso liefert den Montag (ISO 8601)", () => {
    expect(mondayOfIso("2026-08-03")).toBe("2026-08-03"); // Montag
    expect(mondayOfIso("2026-08-09")).toBe("2026-08-03"); // Sonntag
    expect(mondayOfIso("2026-08-10")).toBe("2026-08-10"); // nächster Montag
  });

  test("isoWeekKey teilt Sonntag noch der laufenden Woche zu", () => {
    expect(isoWeekKey("2026-08-03")).toBe(isoWeekKey("2026-08-09"));
    expect(isoWeekKey("2026-08-10")).not.toBe(isoWeekKey("2026-08-09"));
  });

  test("todayIso ist der lokale Kalendertag, nicht der UTC-Tag", () => {
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    expect(todayIso()).toBe(local);
  });

  test("addDaysIso verschiebt über Monats- und Jahresgrenzen", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });
});
