import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { addDaysIso, mondayOfIso, todayIso } from "../utils/date";
import {
  WEEKDAY_LABELS,
  normalizeRecurrence,
  nextRecurDate,
  recurrenceLabel,
} from "../utils/recurrence";
import type { Entry, RecurrenceKind, RecurrenceRule, Subtask, TaskMeta } from "../types";

type View = "today" | "week" | "later" | "all" | "done" | "day";
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
  const [params] = useSearchParams();
  const [view, setView] = useState<View>(() => (params.get("date") ? "day" : "today"));
  const [viewDate, setViewDate] = useState(() => params.get("date") || today);
  useEffect(() => {
    const d = params.get("date");
    if (d) {
      setView("day");
      setViewDate(d);
    }
  }, [params]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [recurKind, setRecurKind] = useState<RecurrenceKind | "">("");
  const [recurInterval, setRecurInterval] = useState(1);
  const [recurWeekdays, setRecurWeekdays] = useState<Set<number>>(new Set());
  function buildRecurrence(): RecurrenceRule | undefined {
    if (!recurKind) return undefined;
    if (recurKind === "weekdays") {
      if (recurWeekdays.size === 0) return undefined;
      return { kind: "weekdays", interval: 1, weekdays: [...recurWeekdays].sort() };
    }
    return { kind: recurKind, interval: Math.max(1, recurInterval) };
  }
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

  const monday = mondayOfIso(today);
  const sunday = addDaysIso(monday, 6);

  const tasks = useMemo(() => {
    let list: Entry[];
    if (view === "today") list = all.filter((e) => e.date === today);
    else if (view === "week") list = all.filter((e) => e.date >= monday && e.date <= sunday);
    else if (view === "later") list = all.filter((e) => e.date > sunday && !meta(e).done);
    else if (view === "all") list = all.filter((e) => !meta(e).done);
    else if (view === "done") list = all.filter((e) => meta(e).done);
    else list = all.filter((e) => e.date === viewDate); // "day"

    return [...list].sort((a, b) => {
      const ma = meta(a), mb = meta(b);
      // done immer ans Ende (außer in "done"-View)
      const dn = Number(ma.done) - Number(mb.done);
      if (dn !== 0) return dn;
      // in "all": überfällig zuerst
      if (view === "all" || view === "week") {
        const aOver = a.date < today ? 0 : a.date === today ? 1 : 2;
        const bOver = b.date < today ? 0 : b.date === today ? 1 : 2;
        if (aOver !== bOver) return aOver - bOver;
      }
      // nach Datum (ASC für zukunftsorientierte Views, DESC für erledigt)
      const multiDay = view !== "today" && view !== "day";
      if (multiDay && a.date !== b.date) {
        return view === "done"
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date);
      }
      // innerhalb gleichen Datums: Prio
      const dp = PRIO_ORDER[ma.priority] - PRIO_ORDER[mb.priority];
      if (dp !== 0) return dp;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [all, view, viewDate, today, monday, sunday]);

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
    const recurrence = buildRecurrence();
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
        ...(recurrence ? { recurrence } : {}),
      } satisfies TaskMeta,
    });
    setTitle("");
    setPriority("medium");
    setProjectId("");
    setGoalId("");
    setRecurKind("");
    setRecurInterval(1);
    setRecurWeekdays(new Set());
  }

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subInput, setSubInput] = useState<Record<string, string>>({});

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function toggleDone(entry: Entry) {
    const m = meta(entry);
    await entriesRepo.update(entry.id, { meta: { ...m, done: !m.done } });
    const rule = normalizeRecurrence(m.recurrence);
    if (!m.done && rule) {
      await entriesRepo.create({
        type: "task",
        date: nextRecurDate(entry.date, rule),
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        meta: { ...m, done: false, subtasks: [], recurrence: rule } satisfies TaskMeta,
      });
    }
  }

  async function addSubtask(entry: Entry, text: string) {
    const m = meta(entry);
    const sub: Subtask = { id: crypto.randomUUID(), text, done: false };
    await entriesRepo.update(entry.id, {
      meta: { ...m, subtasks: [...(m.subtasks ?? []), sub] },
    });
  }

  async function toggleSubtask(entry: Entry, subId: string) {
    const m = meta(entry);
    await entriesRepo.update(entry.id, {
      meta: {
        ...m,
        subtasks: (m.subtasks ?? []).map((s) =>
          s.id === subId ? { ...s, done: !s.done } : s,
        ),
      },
    });
  }

  async function removeSubtask(entry: Entry, subId: string) {
    const m = meta(entry);
    await entriesRepo.update(entry.id, {
      meta: { ...m, subtasks: (m.subtasks ?? []).filter((s) => s.id !== subId) },
    });
  }

  async function remove(id: string) {
    await entriesRepo.remove(id);
  }

  const todayActive = view === "today" || (view === "day" && viewDate === today);

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
        <select
          className="task-select"
          value={recurKind}
          onChange={(e) => setRecurKind(e.target.value as RecurrenceKind | "")}
          title="Wiederholung (optional)"
        >
          <option value="">— Einmalig —</option>
          <option value="daily">Täglich</option>
          <option value="weekly">Wöchentlich</option>
          <option value="monthly">Monatlich</option>
          <option value="weekdays">Wochentage</option>
        </select>
        {(recurKind === "daily" || recurKind === "weekly" || recurKind === "monthly") && (
          <input
            className="task-select"
            type="number"
            min={1}
            value={recurInterval}
            onChange={(e) => setRecurInterval(Math.max(1, parseInt(e.target.value) || 1))}
            title="Alle N Tage/Wochen/Monate"
            style={{ width: 64 }}
          />
        )}
        {recurKind === "weekdays" && (
          <span style={{ display: "inline-flex", gap: 4 }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                className={`chip ${recurWeekdays.has(i) ? "chip-active" : ""}`}
                onClick={() =>
                  setRecurWeekdays((prev) => {
                    const next = new Set(prev);
                    next.has(i) ? next.delete(i) : next.add(i);
                    return next;
                  })
                }
              >
                {label}
              </button>
            ))}
          </span>
        )}
        <button className="btn" type="submit">
          Hinzufügen
        </button>
      </form>

      {/* Tagesnavigation nur bei ?date= deep-links */}
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
          onClick={() => setView("today")}
        >
          Heute
        </button>
        <button
          className={`chip ${view === "week" ? "chip-active" : ""}`}
          onClick={() => setView("week")}
        >
          Diese Woche
        </button>
        <button
          className={`chip ${view === "later" ? "chip-active" : ""}`}
          onClick={() => setView("later")}
        >
          Später
        </button>
        <button
          className={`chip ${view === "all" ? "chip-active" : ""}`}
          onClick={() => setView("all")}
        >
          Alle
        </button>
        <button
          className={`chip ${view === "done" ? "chip-active" : ""}`}
          onClick={() => setView("done")}
        >
          Erledigt
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="empty" data-icon="✅">
          <strong>
            {view === "today" && "Keine Tasks für heute"}
            {view === "week" && "Keine Tasks diese Woche"}
            {view === "later" && "Keine zukünftigen Tasks"}
            {view === "all" && "Alle Tasks erledigt"}
            {view === "done" && "Noch keine Tasks abgehakt"}
            {view === "day" && "Keine Tasks für diesen Tag"}
          </strong>
          <span>Neuen Task oben im Formular anlegen.</span>
        </div>
      ) : (
        <ul className="task-list">
          {tasks.map((entry) => {
            const m = meta(entry);
            const showDate = view !== "today" && view !== "day";
            const overdue = !m.done && entry.date < today;
            const subs = m.subtasks ?? [];
            const subsDone = subs.filter((s) => s.done).length;
            const isExpanded = expanded.has(entry.id);
            return (
              <li
                key={entry.id}
                className={`task-item ${m.done ? "task-done" : ""} ${overdue ? "task-overdue" : ""}`}
              >
                <div className="task-item-row">
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
                  {normalizeRecurrence(m.recurrence) && (
                    <span className="chip" title={recurrenceLabel(normalizeRecurrence(m.recurrence)!)}>
                      🔄
                    </span>
                  )}
                  <button
                    className={`chip subtask-toggle ${isExpanded ? "chip-active" : ""}`}
                    title="Subtasks"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    {subs.length > 0 ? `${subsDone}/${subs.length}` : "⋯"}
                  </button>
                  <button
                    className="task-del"
                    title="Löschen"
                    onClick={() => remove(entry.id)}
                  >
                    ✕
                  </button>
                </div>
                {isExpanded && (
                  <div className="subtask-panel">
                    {subs.map((s) => (
                      <div key={s.id} className="subtask-row">
                        <input
                          type="checkbox"
                          checked={s.done}
                          onChange={() => toggleSubtask(entry, s.id)}
                        />
                        <span className={`subtask-text ${s.done ? "subtask-done" : ""}`}>
                          {s.text}
                        </span>
                        <button
                          className="task-del"
                          onClick={() => removeSubtask(entry, s.id)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <div className="subtask-add">
                      <input
                        className="task-input"
                        placeholder="Subtask hinzufügen…"
                        value={subInput[entry.id] ?? ""}
                        onChange={(e) =>
                          setSubInput((p) => ({ ...p, [entry.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const t = subInput[entry.id]?.trim();
                            if (t) {
                              addSubtask(entry, t);
                              setSubInput((p) => ({ ...p, [entry.id]: "" }));
                            }
                          }
                        }}
                      />
                      <button
                        className="chip"
                        onClick={() => {
                          const t = subInput[entry.id]?.trim();
                          if (t) {
                            addSubtask(entry, t);
                            setSubInput((p) => ({ ...p, [entry.id]: "" }));
                          }
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
