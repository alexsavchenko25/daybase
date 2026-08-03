import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { db } from "./db";
import { entriesRepo, exportBackup, importBackup, validateBackup } from "./repository";
import type { Subtask, TaskMeta } from "./types";

beforeEach(async () => {
  await db.entries.clear();
});

const newTask = (title: string, meta: Partial<TaskMeta> = {}) =>
  entriesRepo.create({
    type: "task",
    date: "2026-08-03",
    title,
    content: "",
    tags: [],
    meta: { done: false, priority: "medium", ...meta },
  });

describe("CRUD + Persistenz", () => {
  test("angelegte Task ist danach lesbar (Reload-Äquivalent)", async () => {
    const t = await newTask("Marktanalyse");
    const again = await entriesRepo.get(t.id);
    expect(again?.title).toBe("Marktanalyse");
    expect((again?.meta as TaskMeta).done).toBe(false);
  });

  test("Abhaken und Wiederöffnen bleibt erhalten", async () => {
    const t = await newTask("Task");
    await entriesRepo.updateMeta(t.id, (m) => ({ ...m, done: true }));
    expect(((await entriesRepo.get(t.id))?.meta as TaskMeta).done).toBe(true);
    await entriesRepo.updateMeta(t.id, (m) => ({ ...m, done: false }));
    expect(((await entriesRepo.get(t.id))?.meta as TaskMeta).done).toBe(false);
  });

  test("Projekt-/Goal-Verknüpfung überlebt ein meta-Update", async () => {
    const t = await newTask("Verknüpft", { projectId: "p1", goalId: "g1" });
    await entriesRepo.updateMeta(t.id, (m) => ({ ...m, done: true }));
    const m = (await entriesRepo.get(t.id))?.meta as TaskMeta;
    expect(m.projectId).toBe("p1");
    expect(m.goalId).toBe("g1");
  });

  test("update setzt updatedAt neu, createdAt bleibt", async () => {
    const t = await newTask("Task");
    await new Promise((r) => setTimeout(r, 5));
    const u = await entriesRepo.updateMeta(t.id, (m) => ({ ...m, done: true }));
    expect(u?.createdAt).toBe(t.createdAt);
    expect(Date.parse(u!.updatedAt)).toBeGreaterThan(Date.parse(t.updatedAt));
  });

  test("updateMeta auf gelöschtem Eintrag legt ihn nicht neu an", async () => {
    const t = await newTask("Task");
    await entriesRepo.remove(t.id);
    expect(await entriesRepo.updateMeta(t.id, (m) => m)).toBeUndefined();
    expect(await entriesRepo.get(t.id)).toBeUndefined();
  });
});

// Regression: die Handler lasen `meta` aus dem gerenderten Prop. Zwei schnelle
// Aktionen gingen vom selben Ausgangsstand aus — die erste ging verloren.
describe("updateMeta ist atomar", () => {
  test("parallel angelegte Subtasks überleben beide", async () => {
    const t = await newTask("Task", { subtasks: [] });
    const add = (text: string) =>
      entriesRepo.updateMeta(t.id, (m) => ({
        ...m,
        subtasks: [...((m.subtasks as Subtask[]) ?? []), { id: text, text, done: false }],
      }));
    await Promise.all([add("a"), add("b"), add("c")]);
    const subs = ((await entriesRepo.get(t.id))?.meta as TaskMeta).subtasks ?? [];
    expect(subs.map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
  });

  test("paralleles Abhaken zählt nicht doppelt", async () => {
    const t = await newTask("Task", { subtasks: [{ id: "s1", text: "s", done: false }] });
    const toggle = () =>
      entriesRepo.updateMeta(t.id, (m) => ({
        ...m,
        subtasks: ((m.subtasks as Subtask[]) ?? []).map((s) => ({ ...s, done: !s.done })),
      }));
    await Promise.all([toggle(), toggle()]);
    const subs = ((await entriesRepo.get(t.id))?.meta as TaskMeta).subtasks ?? [];
    expect(subs).toHaveLength(1);
    expect(subs[0].done).toBe(false); // zweimal gekippt = Ausgangszustand
  });
});

describe("Backup", () => {
  test("Round-Trip erhält Subtasks, Recurrence und Habit-Historie", async () => {
    await newTask("Mit Subtasks", {
      subtasks: [{ id: "s1", text: "Teil 1", done: true }],
      recurrence: { kind: "weekly", interval: 2 },
      projectId: "p1",
    });
    await entriesRepo.create({
      type: "habit",
      date: "2026-08-03",
      title: "Morgenroutine",
      content: "",
      tags: ["routine"],
      meta: { frequency: "daily", streak: 3, completedDates: ["2026-08-01", "2026-08-02"] },
    });

    const backup = await exportBackup();
    await db.entries.clear();
    const n = await importBackup(JSON.parse(JSON.stringify(backup)));

    expect(n).toBe(2);
    const [habit] = await db.entries.where("type").equals("habit").toArray();
    expect(habit.meta.completedDates).toEqual(["2026-08-01", "2026-08-02"]);
    expect(habit.tags).toEqual(["routine"]);
    const [task] = await db.entries.where("type").equals("task").toArray();
    expect(task.meta.subtasks[0]).toEqual({ id: "s1", text: "Teil 1", done: true });
    expect(task.meta.recurrence).toEqual({ kind: "weekly", interval: 2 });
    expect(task.meta.projectId).toBe("p1");
  });

  test("Import führt zusammen und löscht nichts", async () => {
    const keep = await newTask("Bleibt");
    const backup = await exportBackup();
    await db.entries.clear();
    await newTask("Anderer Eintrag");

    await importBackup(JSON.parse(JSON.stringify(backup)));
    expect(await db.entries.count()).toBe(2);
    expect(await entriesRepo.get(keep.id)).toBeDefined();
  });

  test("zweimaliger Import erzeugt keine Duplikate", async () => {
    await newTask("Einmalig");
    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    await importBackup(backup);
    await importBackup(backup);
    expect(await db.entries.count()).toBe(1);
  });

  test("validateBackup weist Fremdformate ab", () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ entries: [] }).ok).toBe(false);
    expect(validateBackup({ app: "daybase", entries: [] }).ok).toBe(false);
    expect(validateBackup({ app: "daybase", entries: [{ nope: 1 }] }).ok).toBe(false);
  });
});
