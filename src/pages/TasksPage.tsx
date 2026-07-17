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
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import { useI18n } from "../i18n";
import type { Entry, RecurrenceKind, RecurrenceRule, Subtask, TaskMeta } from "../types";

type View = "today" | "week" | "later" | "all" | "done" | "day";
type Priority = TaskMeta["priority"];

const PRIO_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
function meta(e: Entry): TaskMeta {
  return e.meta as TaskMeta;
}

export default function TasksPage() {
  const { language, locale, tr } = useI18n();
  const prioLabel: Record<Priority, string> = {
    high: tr("Hoch", "High"), medium: tr("Mittel", "Medium"), low: tr("Niedrig", "Low"),
  };
  const weekdayLabels = language === "de" ? WEEKDAY_LABELS : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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
  const [showOptions, setShowOptions] = useState(false);
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
      <PageHeader
        icon="tasks"
        title="Tasks"
        subtitle={
          <>
            {tr("Heute offen", "Open today")}: <strong>{openTodayCount}</strong>
          </>
        }
      />

      <form className="task-form task-quick-add" onSubmit={addTask}>
        <div className="task-form-primary">
          <input
            className="task-input"
            placeholder={tr("Was möchtest du erledigen?", "What do you want to get done?")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={tr("Task-Titel", "Task title")}
          />
          <input
            className="task-select"
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            title={tr("Datum der Task", "Task date")}
            aria-label={tr("Task-Datum", "Task date")}
          />
          <select
            className="task-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            aria-label={tr("Priorität", "Priority")}
          >
            <option value="high">{tr("Hoch", "High")}</option>
            <option value="medium">{tr("Mittel", "Medium")}</option>
            <option value="low">{tr("Niedrig", "Low")}</option>
          </select>
          <button className="btn" type="submit">
            <Icon name="plus" size={16} /> {tr("Hinzufügen", "Add")}
          </button>
        </div>
        <div className="task-form-secondary">
          <button
            className={`btn subtle sm ${showOptions ? "is-active" : ""}`}
            type="button"
            onClick={() => setShowOptions((value) => !value)}
            aria-expanded={showOptions}
          >
            {showOptions ? tr("Optionen ausblenden", "Hide options") : tr("Projekt, Goal & Wiederholung", "Project, goal & recurrence")}
          </button>
          {showOptions && (
            <div className="task-form-options">
              <select
                className="task-select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label={tr("Projekt (optional)", "Project (optional)")}
              >
                <option value="">— {tr("Projekt", "Project")} —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <select
                className="task-select"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                aria-label={tr("Goal (optional)", "Goal (optional)")}
              >
                <option value="">— Goal —</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <select
                className="task-select"
                value={recurKind}
                onChange={(e) => setRecurKind(e.target.value as RecurrenceKind | "")}
                aria-label={tr("Wiederholung (optional)", "Recurrence (optional)")}
              >
                <option value="">— {tr("Einmalig", "One-time")} —</option>
                <option value="daily">{tr("Täglich", "Daily")}</option>
                <option value="weekly">{tr("Wöchentlich", "Weekly")}</option>
                <option value="monthly">{tr("Monatlich", "Monthly")}</option>
                <option value="weekdays">{tr("Wochentage", "Weekdays")}</option>
              </select>
              {(recurKind === "daily" || recurKind === "weekly" || recurKind === "monthly") && (
                <input
                  className="task-select task-interval"
                  type="number"
                  min={1}
                  value={recurInterval}
                  onChange={(e) => setRecurInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  aria-label={tr("Wiederholungsintervall", "Recurrence interval")}
                />
              )}
              {recurKind === "weekdays" && (
                <span className="weekday-picker">
                  {weekdayLabels.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      className={`chip ${recurWeekdays.has(i) ? "chip-active" : ""}`}
                      onClick={() => setRecurWeekdays((prev) => {
                        const next = new Set(prev);
                        next.has(i) ? next.delete(i) : next.add(i);
                        return next;
                      })}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
      </form>

      {/* Tagesnavigation nur bei ?date= deep-links */}
      {view === "day" && (
        <div className="week-nav task-day-nav">
          <button className="chip" onClick={() => goDay(addDaysIso(viewDate, -1))}>
            ← {tr("Tag", "Day")}
          </button>
          <input
            className="task-select"
            type="date"
            value={viewDate}
            onChange={(e) => goDay(e.target.value)}
          />
          <span className="week-label">
            {new Date(viewDate + "T00:00:00").toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
            {viewDate === today && <span className="week-now"> · {tr("heute", "today")}</span>}
          </span>
          <button className="chip" onClick={() => goDay(addDaysIso(viewDate, 1))}>
            {tr("Tag", "Day")} →
          </button>
        </div>
      )}

      <div className="filter-row">
        <button
          className={`chip ${todayActive ? "chip-active" : ""}`}
          onClick={() => setView("today")}
        >
          {tr("Heute", "Today")}
        </button>
        <button
          className={`chip ${view === "week" ? "chip-active" : ""}`}
          onClick={() => setView("week")}
        >
          {tr("Diese Woche", "This week")}
        </button>
        <button
          className={`chip ${view === "later" ? "chip-active" : ""}`}
          onClick={() => setView("later")}
        >
          {tr("Später", "Later")}
        </button>
        <button
          className={`chip ${view === "all" ? "chip-active" : ""}`}
          onClick={() => setView("all")}
        >
          {tr("Alle", "All")}
        </button>
        <button
          className={`chip ${view === "done" ? "chip-active" : ""}`}
          onClick={() => setView("done")}
        >
          {tr("Erledigt", "Done")}
        </button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon="tasks"
          title={<>
            {view === "today" && tr("Keine Tasks für heute", "No tasks for today")}
            {view === "week" && tr("Keine Tasks diese Woche", "No tasks this week")}
            {view === "later" && tr("Keine zukünftigen Tasks", "No future tasks")}
            {view === "all" && tr("Alle Tasks erledigt", "All tasks completed")}
            {view === "done" && tr("Noch keine Tasks abgehakt", "No completed tasks yet")}
            {view === "day" && tr("Keine Tasks für diesen Tag", "No tasks for this day")}
          </>}
          description={tr("Nutze Quick Add, wenn du etwas festhalten möchtest.", "Use quick add whenever you want to capture something.")}
          compact
        />
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
                    {prioLabel[m.priority]}
                  </span>
                  {normalizeRecurrence(m.recurrence) && (
                    <span className="chip" title={recurrenceLabel(normalizeRecurrence(m.recurrence)!)} aria-label={recurrenceLabel(normalizeRecurrence(m.recurrence)!)}>
                      <Icon name="habit" size={14} />
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
                    className="icon-btn danger-ghost"
                    title={tr("Löschen", "Delete")}
                    aria-label={tr("Task löschen", "Delete task")}
                    onClick={() => remove(entry.id)}
                  >
                    <Icon name="trash" size={16} />
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
                          className="icon-btn danger-ghost"
                          aria-label={tr("Subtask löschen", "Delete subtask")}
                          onClick={() => removeSubtask(entry, s.id)}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    ))}
                    <div className="subtask-add">
                      <input
                        className="task-input"
                        placeholder={tr("Subtask hinzufügen…", "Add subtask…")}
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
