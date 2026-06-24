import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { addDaysIso, todayIso } from "../utils/date";
import type { Entry, TaskMeta } from "../types";

type View = "day" | "open" | "done";
type Priority = TaskMeta["priority"];

const PRIO_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const PRIO_LABEL: Record<Priority, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${WD[d.getDay()]} ${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function meta(e: Entry): TaskMeta {
  return e.meta as TaskMeta;
}

export default function TasksPage() {
  const today = todayIso();
  const [view, setView] = useState<View>("day");
  const [viewDate, setViewDate] = useState(today);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  // Datum für neue Tasks. Folgt der Tagesansicht, bleibt manuell überschreibbar.
  const [formDate, setFormDate] = useState(today);

  useEffect(() => {
    setFormDate(viewDate);
  }, [viewDate]);

  const all = useLiveQuery(
    () => db.entries.where("type").equals("task").toArray(),
    [],
    [] as Entry[],
  );
  const projects = useLiveQuery(
    () => db.entries.where("type").equals("project").toArray(),
    [],
    [] as Entry[],
  );
  const goals = useLiveQuery(
    () => db.entries.where("type").equals("goal").toArray(),
    [],
    [] as Entry[],
  );
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p) => m.set(p.id, p.title));
    goals.forEach((g) => m.set(g.id, g.title));
    return m;
  }, [projects, goals]);

  const tasks = useMemo(() => {
    let list = all;
    if (view === "day") list = list.filter((e) => e.date === viewDate);
    else if (view === "open") list = list.filter((e) => !meta(e).done);
    else list = list.filter((e) => meta(e).done);

    return [...list].sort((a, b) => {
      const dn = Number(meta(a).done) - Number(meta(b).done);
      if (dn !== 0) return dn;
      const dp = PRIO_ORDER[meta(a).priority] - PRIO_ORDER[meta(b).priority];
      if (dp !== 0) return dp;
      // bei tagübergreifenden Views nach Datum, sonst neueste zuerst
      if (view !== "day" && a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [all, view, viewDate]);

  // Dashboard-Logik: immer echtes heute, unabhängig von viewDate.
  const openTodayCount = useMemo(
    () => all.filter((e) => e.date === today && !meta(e).done).length,
    [all, today],
  );

  function goDay(date: string) {
    setView("day");
    setViewDate(date);
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    await entriesRepo.create({
      type: "task",
      date: formDate,
      title: t,
      content: "",
      tags: [],
      meta: {
        done: false,
        priority,
        ...(projectId ? { projectId } : {}),
        ...(goalId ? { goalId } : {}),
      } satisfies TaskMeta,
    });
    setTitle("");
    setPriority("medium");
    setProjectId("");
    setGoalId("");
  }

  async function toggleDone(entry: Entry) {
    const m = meta(entry);
    await entriesRepo.update(entry.id, {
      meta: { ...m, done: !m.done } satisfies TaskMeta,
    });
  }

  async function remove(id: string) {
    await entriesRepo.remove(id);
  }

  const todayActive = view === "day" && viewDate === today;

  return (
    <div className="page">
      <header className="page-head">
        <h1>
          <span className="page-icon">✅</span> Tasks
        </h1>
        <p className="muted">
          Heute offen: <strong>{openTodayCount}</strong>
        </p>
      </header>

      <form className="task-form" onSubmit={addTask}>
        <input
          className="task-input"
          placeholder="Neue Task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="task-select"
          type="date"
          value={formDate}
          onChange={(e) => setFormDate(e.target.value)}
          title="Datum der Task"
        />
        <select
          className="task-select"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
        >
          <option value="high">Hoch</option>
          <option value="medium">Mittel</option>
          <option value="low">Niedrig</option>
        </select>
        <select
          className="task-select"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          title="Projekt (optional)"
        >
          <option value="">— Projekt —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select
          className="task-select"
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          title="Goal (optional)"
        >
          <option value="">— Goal —</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Hinzufügen
        </button>
      </form>

      {/* Tagesnavigation (nur in der Tagesansicht relevant) */}
      {view === "day" && (
        <div className="week-nav task-day-nav">
          <button className="chip" onClick={() => goDay(addDaysIso(viewDate, -1))}>
            ← Tag
          </button>
          <input
            className="task-select"
            type="date"
            value={viewDate}
            onChange={(e) => goDay(e.target.value)}
          />
          <span className="week-label">
            {dayLabel(viewDate)}
            {viewDate === today && <span className="week-now"> · heute</span>}
          </span>
          <button className="chip" onClick={() => goDay(addDaysIso(viewDate, 1))}>
            Tag →
          </button>
        </div>
      )}

      <div className="filter-row">
        <button
          className={`chip ${todayActive ? "chip-active" : ""}`}
          onClick={() => goDay(today)}
        >
          Heute
        </button>
        <button
          className={`chip ${view === "open" ? "chip-active" : ""}`}
          onClick={() => setView("open")}
        >
          Alle offenen
        </button>
        <button
          className={`chip ${view === "done" ? "chip-active" : ""}`}
          onClick={() => setView("done")}
        >
          Erledigt
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="muted empty">Keine Tasks.</p>
      ) : (
        <ul className="task-list">
          {tasks.map((entry) => {
            const m = meta(entry);
            const showDate = view !== "day";
            return (
              <li
                key={entry.id}
                className={`task-item ${m.done ? "task-done" : ""}`}
              >
                <label className="task-check">
                  <input
                    type="checkbox"
                    checked={m.done}
                    onChange={() => toggleDone(entry)}
                  />
                  <span className="task-title">{entry.title}</span>
                </label>
                {m.projectId && nameById.has(m.projectId) && (
                  <span className="link-tag">📂 {nameById.get(m.projectId)}</span>
                )}
                {m.goalId && nameById.has(m.goalId) && (
                  <span className="link-tag">🎯 {nameById.get(m.goalId)}</span>
                )}
                {showDate && <span className="task-date">{entry.date}</span>}
                <span className={`prio prio-${m.priority}`}>
                  {PRIO_LABEL[m.priority]}
                </span>
                <button
                  className="task-del"
                  title="Löschen"
                  onClick={() => remove(entry.id)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
