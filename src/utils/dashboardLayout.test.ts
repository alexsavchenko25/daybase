import { describe, expect, test } from "vitest";
import {
  DASHBOARD_SECTION_IDS,
  canMoveDashboardSection,
  defaultDashboardLayout,
  groupDashboardRows,
  hiddenDashboardSections,
  moveDashboardSection,
  normalizeDashboardLayout,
  parseDashboardLayout,
  serializeDashboardLayout,
  setDashboardSectionHidden,
  visibleDashboardSections,
  type DashboardLayout,
  type DashboardSectionId,
} from "./dashboardLayout";

function layout(order: string[], hidden: string[] = []): DashboardLayout {
  return normalizeDashboardLayout(order, hidden);
}

describe("default layout", () => {
  test("contains every section, visible, in declaration order", () => {
    const def = defaultDashboardLayout();
    expect(def.order).toEqual([...DASHBOARD_SECTION_IDS]);
    expect(def.hidden).toEqual([]);
    expect(visibleDashboardSections(def)).toEqual([...DASHBOARD_SECTION_IDS]);
  });

  test("is returned for absent storage", () => {
    expect(parseDashboardLayout(null)).toEqual(defaultDashboardLayout());
    expect(parseDashboardLayout("")).toEqual(defaultDashboardLayout());
  });
});

describe("moving sections", () => {
  test("moves a section up and down", () => {
    const start = defaultDashboardLayout();
    const up = moveDashboardSection(start, "kpis", -1);
    expect(up.order.slice(0, 3)).toEqual(["focus", "kpis", "hints"]);

    const down = moveDashboardSection(up, "kpis", 1);
    expect(down.order).toEqual(start.order);
  });

  test("is a no-op at the boundaries", () => {
    const start = defaultDashboardLayout();
    const first = DASHBOARD_SECTION_IDS[0];
    const last = DASHBOARD_SECTION_IDS[DASHBOARD_SECTION_IDS.length - 1];

    expect(moveDashboardSection(start, first, -1)).toEqual(start);
    expect(moveDashboardSection(start, last, 1)).toEqual(start);
    expect(canMoveDashboardSection(start, first, -1)).toBe(false);
    expect(canMoveDashboardSection(start, last, 1)).toBe(false);
    expect(canMoveDashboardSection(start, first, 1)).toBe(true);
    expect(canMoveDashboardSection(start, last, -1)).toBe(true);
  });

  test("skips hidden neighbours so a move is always visible", () => {
    // hints ist ausgeblendet: kpis muss über hints hinweg direkt vor focus.
    const start = setDashboardSectionHidden(defaultDashboardLayout(), "hints", true);
    const moved = moveDashboardSection(start, "kpis", -1);

    expect(visibleDashboardSections(moved).slice(0, 2)).toEqual(["kpis", "focus"]);
    expect(moved.order).toContain("hints");
    expect(moved.hidden).toEqual(["hints"]);
  });

  test("cannot move a hidden section and ignores unknown ids", () => {
    const start = setDashboardSectionHidden(defaultDashboardLayout(), "insights", true);
    expect(moveDashboardSection(start, "insights", -1)).toEqual(start);
    expect(canMoveDashboardSection(start, "insights", -1)).toBe(false);
    expect(moveDashboardSection(start, "nope" as DashboardSectionId, -1)).toEqual(start);
  });
});

describe("hiding and restoring", () => {
  test("hides a section and keeps it out of the visible list", () => {
    const hiddenGoals = setDashboardSectionHidden(defaultDashboardLayout(), "goals", true);
    expect(visibleDashboardSections(hiddenGoals)).not.toContain("goals");
    expect(hiddenDashboardSections(hiddenGoals)).toEqual(["goals"]);
    expect(hiddenGoals.order).toContain("goals"); // Position bleibt erhalten
  });

  test("restores a section to its previous position", () => {
    const custom = moveDashboardSection(defaultDashboardLayout(), "goals", -1);
    const positionBefore = custom.order.indexOf("goals");
    const restored = setDashboardSectionHidden(
      setDashboardSectionHidden(custom, "goals", true),
      "goals",
      false,
    );

    expect(restored.hidden).toEqual([]);
    expect(restored.order.indexOf("goals")).toBe(positionBefore);
  });

  test("hiding twice does not duplicate, restoring an already visible section is a no-op", () => {
    const once = setDashboardSectionHidden(defaultDashboardLayout(), "kpis", true);
    const twice = setDashboardSectionHidden(once, "kpis", true);
    expect(twice.hidden).toEqual(["kpis"]);
    expect(setDashboardSectionHidden(defaultDashboardLayout(), "kpis", false).hidden).toEqual([]);
  });

  test("supports a layout where every section is hidden", () => {
    const allHidden = DASHBOARD_SECTION_IDS.reduce<DashboardLayout>(
      (acc, id) => setDashboardSectionHidden(acc, id, true),
      defaultDashboardLayout(),
    );

    expect(visibleDashboardSections(allHidden)).toEqual([]);
    expect(hiddenDashboardSections(allHidden)).toEqual([...DASHBOARD_SECTION_IDS]);
    expect(groupDashboardRows(visibleDashboardSections(allHidden))).toEqual([]);
    // Round-trip: ein komplett verstecktes Layout überlebt Speichern/Laden.
    expect(parseDashboardLayout(serializeDashboardLayout(allHidden))).toEqual(allHidden);
  });
});

describe("reset", () => {
  test("restores default order and full visibility", () => {
    const messy = setDashboardSectionHidden(
      moveDashboardSection(defaultDashboardLayout(), "projects", -1),
      "kpis",
      true,
    );
    expect(messy).not.toEqual(defaultDashboardLayout());
    expect(defaultDashboardLayout()).toEqual({ order: [...DASHBOARD_SECTION_IDS], hidden: [] });
  });

  test("default layout is a fresh copy that cannot be mutated through", () => {
    const first = defaultDashboardLayout();
    first.order.reverse();
    expect(defaultDashboardLayout().order).toEqual([...DASHBOARD_SECTION_IDS]);
  });
});

describe("parsing malformed storage", () => {
  test("falls back to default for invalid JSON and wrong shapes", () => {
    const def = defaultDashboardLayout();
    expect(parseDashboardLayout("{oops")).toEqual(def);
    expect(parseDashboardLayout("null")).toEqual(def);
    expect(parseDashboardLayout("42")).toEqual(def);
    expect(parseDashboardLayout('"a string"')).toEqual(def);
    expect(parseDashboardLayout("[1,2,3]")).toEqual(def);
  });

  test("falls back to default for a missing or outdated version", () => {
    const def = defaultDashboardLayout();
    expect(parseDashboardLayout(JSON.stringify({ order: ["kpis"], hidden: [] }))).toEqual(def);
    expect(parseDashboardLayout(JSON.stringify({ version: 0, order: ["kpis"] }))).toEqual(def);
    expect(parseDashboardLayout(JSON.stringify({ version: 2, order: ["kpis"] }))).toEqual(def);
  });

  test("repairs malformed order/hidden values instead of failing", () => {
    const parsed = parseDashboardLayout(
      JSON.stringify({ version: 1, order: "not-an-array", hidden: { nope: true } }),
    );
    expect(parsed).toEqual(defaultDashboardLayout());

    const withJunk = parseDashboardLayout(
      JSON.stringify({ version: 1, order: [null, 7, "kpis", {}, "focus"], hidden: [false, "goals"] }),
    );
    expect(withJunk.order.slice(0, 2)).toEqual(["kpis", "focus"]);
    expect(withJunk.order).toHaveLength(DASHBOARD_SECTION_IDS.length);
    expect(withJunk.hidden).toEqual(["goals"]);
  });

  test("survives a full serialize → parse round-trip", () => {
    const custom = setDashboardSectionHidden(
      moveDashboardSection(defaultDashboardLayout(), "insights", -1),
      "hints",
      true,
    );
    expect(parseDashboardLayout(serializeDashboardLayout(custom))).toEqual(custom);
  });
});

describe("normalization", () => {
  test("drops duplicate section ids", () => {
    const normalized = layout(["kpis", "kpis", "focus", "kpis"]);
    expect(normalized.order.filter((id) => id === "kpis")).toHaveLength(1);
    expect(normalized.order.slice(0, 2)).toEqual(["kpis", "focus"]);
    expect(normalized.order).toHaveLength(DASHBOARD_SECTION_IDS.length);
  });

  test("drops unknown and removed section ids", () => {
    const normalized = layout(["kpis", "legacy-widget", "focus"], ["gone", "goals"]);
    expect(normalized.order).not.toContain("legacy-widget");
    expect(normalized.hidden).toEqual(["goals"]);
    expect(normalized.order).toHaveLength(DASHBOARD_SECTION_IDS.length);
  });

  test("appends newly introduced sections at the end, in default order", () => {
    // Gespeichert wurde ein Layout ohne "insights" und ohne "projects" —
    // beide müssen zurückkommen, nicht dauerhaft unsichtbar bleiben, und die
    // bestehende Anordnung darf dabei nicht umsortiert werden.
    const normalized = layout(["focus", "hints", "kpis", "goals"]);
    expect(normalized.order).toEqual(["focus", "hints", "kpis", "goals", "insights", "projects"]);
  });

  test("keeps a custom order while appending the missing section", () => {
    const normalized = layout(["projects", "goals", "focus"]);
    expect(normalized.order.slice(0, 3)).toEqual(["projects", "goals", "focus"]);
    expect(normalized.order).toHaveLength(DASHBOARD_SECTION_IDS.length);
  });

  test("an empty stored order yields the full default order", () => {
    expect(layout([]).order).toEqual([...DASHBOARD_SECTION_IDS]);
  });

  test("a section cannot be hidden without being in the order", () => {
    const normalized = layout(["focus"], ["goals"]);
    expect(normalized.order).toContain("goals");
    expect(normalized.hidden).toEqual(["goals"]);
  });
});

describe("row grouping", () => {
  test("pairs adjacent goals and projects into one row", () => {
    expect(groupDashboardRows([...DASHBOARD_SECTION_IDS])).toEqual([
      ["focus"],
      ["hints"],
      ["kpis"],
      ["insights"],
      ["goals", "projects"],
    ]);
  });

  test("does not pair them when separated by another section", () => {
    expect(groupDashboardRows(["goals", "kpis", "projects"])).toEqual([
      ["goals"],
      ["kpis"],
      ["projects"],
    ]);
  });

  test("a lone paired section still forms its own row", () => {
    expect(groupDashboardRows(["goals"])).toEqual([["goals"]]);
    expect(groupDashboardRows([])).toEqual([]);
  });

  test("pairs a reversed goals/projects order too", () => {
    expect(groupDashboardRows(["projects", "goals"])).toEqual([["projects", "goals"]]);
  });
});
