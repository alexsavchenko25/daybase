import { describe, expect, test } from "vitest";
import { planReconcile } from "./reconcile";
import type { Entry } from "../types";

const e = (id: string, updatedAt: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  type: "task",
  date: "2026-08-03",
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt,
  title: id,
  content: "",
  tags: [],
  meta: { done: false, priority: "medium" },
  ...extra,
});

describe("planReconcile", () => {
  test("in der Cloud unbekannter Eintrag wird lokal angelegt", () => {
    const plan = planReconcile([], [e("a", "2026-08-03T10:00:00.000Z")], new Set());
    expect(plan.toLocal.map((x) => x.id)).toEqual(["a"]);
    expect(plan.toRemote).toEqual([]);
    expect(plan.deleteLocal).toEqual([]);
  });

  test("jüngerer Cloud-Stand gewinnt", () => {
    const plan = planReconcile(
      [e("a", "2026-08-03T10:00:00.000Z")],
      [e("a", "2026-08-03T11:00:00.000Z")],
      new Set(["a"]),
    );
    expect(plan.toLocal.map((x) => x.id)).toEqual(["a"]);
    expect(plan.toRemote).toEqual([]);
  });

  // Regression: der 20s-Poll durfte einen gerade lokal abgehakten Task nicht
  // mit dem älteren Cloud-Stand überschreiben.
  test("jüngerer lokaler Stand überlebt einen laufenden Abgleich", () => {
    const local = e("a", "2026-08-03T11:00:00.000Z", { meta: { done: true, priority: "medium" } });
    const plan = planReconcile([local], [e("a", "2026-08-03T10:00:00.000Z")], new Set(["a"]));
    expect(plan.toLocal).toEqual([]);
    expect(plan.toRemote.map((x) => x.id)).toEqual(["a"]);
  });

  test("gleicher Zeitstempel → nichts zu tun", () => {
    const plan = planReconcile(
      [e("a", "2026-08-03T10:00:00.000Z")],
      [e("a", "2026-08-03T10:00:00.000Z")],
      new Set(["a"]),
    );
    expect(plan.toLocal).toEqual([]);
    expect(plan.toRemote).toEqual([]);
    expect(plan.deleteLocal).toEqual([]);
  });

  test("Postgres-Zeitstempel werden korrekt gegen JS-ISO verglichen", () => {
    // "+00:00" statt "Z", Mikrosekunden — lexikografisch wäre der Vergleich falsch
    const plan = planReconcile(
      [e("a", "2026-08-03T10:00:00.000Z")],
      [e("a", "2026-08-03 10:00:00.500123+00:00".replace(" ", "T"))],
      new Set(["a"]),
    );
    expect(plan.toLocal.map((x) => x.id)).toEqual(["a"]);
  });

  // Regression: Löschungen auf einem anderen Gerät kamen nie an.
  test("bereits synchronisierter Eintrag fehlt in der Cloud → lokal löschen", () => {
    const plan = planReconcile([e("a", "2026-08-03T10:00:00.000Z")], [], new Set(["a"]));
    expect(plan.deleteLocal).toEqual(["a"]);
    expect(plan.toRemote).toEqual([]);
  });

  // Schutz vor Datenverlust: was nie in der Cloud war, darf nie gelöscht werden.
  test("nie hochgeladener Eintrag wird gepusht, nicht gelöscht", () => {
    const plan = planReconcile([e("neu", "2026-08-03T10:00:00.000Z")], [], new Set());
    expect(plan.deleteLocal).toEqual([]);
    expect(plan.toRemote.map((x) => x.id)).toEqual(["neu"]);
  });

  test("offline gelöschter Eintrag wird nicht wieder eingepullt", () => {
    const plan = planReconcile(
      [],
      [e("a", "2026-08-03T10:00:00.000Z")],
      new Set(["a"]),
      new Set(["a"]),
    );
    expect(plan.toLocal).toEqual([]);
    expect(plan.remoteIds).toEqual([]);
  });

  test("remoteIds spiegelt den Cloud-Bestand (Basis für die nächste Runde)", () => {
    const plan = planReconcile(
      [e("lokal", "2026-08-03T10:00:00.000Z")],
      [e("a", "2026-08-03T10:00:00.000Z"), e("b", "2026-08-03T10:00:00.000Z")],
      new Set(),
    );
    expect(plan.remoteIds.sort()).toEqual(["a", "b"]);
  });

  test("gemischter Fall bleibt für jeden Eintrag bei genau einer Aktion", () => {
    const plan = planReconcile(
      [
        e("alt", "2026-08-03T09:00:00.000Z"), // Cloud jünger → toLocal
        e("neu", "2026-08-03T12:00:00.000Z"), // lokal jünger → toRemote
        e("weg", "2026-08-03T09:00:00.000Z"), // remote gelöscht → deleteLocal
        e("frisch", "2026-08-03T12:00:00.000Z"), // nie hochgeladen → toRemote
      ],
      [e("alt", "2026-08-03T10:00:00.000Z"), e("neu", "2026-08-03T10:00:00.000Z")],
      new Set(["alt", "neu", "weg"]),
    );
    expect(plan.toLocal.map((x) => x.id)).toEqual(["alt"]);
    expect(plan.toRemote.map((x) => x.id).sort()).toEqual(["frisch", "neu"]);
    expect(plan.deleteLocal).toEqual(["weg"]);
  });

  // Idempotenz der Migration: ein zweiter Lauf über denselben Stand ändert nichts.
  test("zweiter Durchlauf nach vollständigem Abgleich ist ein No-op", () => {
    const local = [e("a", "2026-08-03T10:00:00.000Z"), e("b", "2026-08-03T10:00:00.000Z")];
    const first = planReconcile(local, [], new Set());
    expect(first.toRemote).toHaveLength(2);

    // Nach erfolgreichem Push liegen beide in der Cloud und gelten als "seen".
    const seen = new Set([...first.remoteIds, ...first.toRemote.map((x) => x.id)]);
    const second = planReconcile(local, local, seen);
    expect(second.toLocal).toEqual([]);
    expect(second.toRemote).toEqual([]);
    expect(second.deleteLocal).toEqual([]);
  });
});
