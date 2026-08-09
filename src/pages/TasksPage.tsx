import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { addDaysIso, mondayOfIso, todayIso } from "../utils/date";
import {
  WEEKDAY_LABELS,
  normalizeRecurrence,
  recurrenceLabel,
} from "../utils/recurrence";
import {
  PRIORITY_ORDER,
  scheduleTask,
  taskMeta,
  toggleTaskDone,
  unscheduleTask,
} from "../utils/task";
import PageHeader from "../components/PageHeader";
import NativeDateField from "../components/NativeDateField";
import { useI18n } from "../i18n";
import type { Entry, RecurrenceKind, RecurrenceRule, Subtask, TaskMeta } from "../types";

type View =
  | "today"
  | "next7"
  | "week"
  | "later"
  | "overdue"
  | "highPriority"
  | "noProject"
  | "all"
  | "done"
  | "day";
type Priority = TaskMeta["priority"];

// Views, in denen überfällige Tasks zuerst sortiert werden sollen (unabhängig
// vom Datumsbereich der View selbst).
const OVERDUE_FIRST_VIEWS = new Set<View>([
  "all",
  "week",
  "next7",
  "overdue",
  "highPriority",
  "noProject",
]);

const PRIO_ORDER = PRIORITY_ORDER;
const meta = taskMeta;

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

  const next7End = addDaysIso(today, 6);

  const tasks = useMemo(() => {
    let list: Entry[];
    if (view === "today") list = all.filter((e) => e.date === today);
    else if (view === "next7") list = all.filter((e) => e.date >= today && e.date <= next7End);
    else if (view === "week") list = all.filter((e) => e.date >= monday && e.date <= sunday);
    else if (view === "later") list = all.filter((e) => e.date > sunday && !meta(e).done);
    // Überfällig: offen + Datum gesetzt + vor heute. Tasks ohne Datum (leerer
    // String) dürfen hier NICHT mitzählen — "" < jedes Datum wäre sonst
    // fälschlich "überfällig".
    else if (view === "overdue") list = all.filter((e) => !meta(e).done && e.date && e.date < today);
    else if (view === "highPriority") list = all.filter((e) => !meta(e).done && meta(e).priority === "high");
    else if (view === "noProject") list = all.filter((e) => !meta(e).done && !meta(e).projectId);
    else if (view === "all") list = all.filter((e) => !meta(e).done);
    else if (view === "done") list = all.filter((e) => meta(e).done);
    else list = all.filter((e) => e.date === viewDate); // "day"

    return [...list].sort((a, b) => {
      const ma = meta(a), mb = meta(b);
      // done immer ans Ende (außer in "done"-View)
      const dn = Number(ma.done) - Number(mb.done);
      if (dn !== 0) return dn;
      // überfällig zuerst
      if (OVERDUE_FIRST_VIEWS.has(view)) {
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
  }, [all, view, viewDate, today, monday, sunday, next7End]);

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

  // ---- Mehrfachauswahl + Bulk-Aktionen ----
  // Reine UI-State, nicht persistiert. Wechselt die View, könnte die Auswahl
  // sonst auf inzwischen unsichtbare Tasks zeigen — deshalb bei Wechsel leeren.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState("");
  const [bulkProjectId, setBulkProjectId] = useState("");

  useEffect(() => {
    setSelected(new Set());
  }, [view, viewDate]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allVisibleSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id));

  function toggleSelectAllVisible() {
    setSelected(allVisibleSelected ? new Set() : new Set(tasks.map((t) => t.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  // Erledigen respektiert dieselbe Spawn-once-Recurrence-Logik wie das
  // einzelne Abhaken (toggleTaskDone) — bereits erledigte Tasks werden
  // übersprungen, damit sie nicht versehentlich wieder geöffnet werden.
  async function bulkComplete() {
    const ids = [...selected];
    await Promise.all(
      ids.map(async (id) => {
        const entry = all.find((t) => t.id === id);
        if (entry && !meta(entry).done) await toggleTaskDone(id);
      }),
    );
    clearSelection();
  }

  async function bulkReschedule() {
    if (!bulkDate) return;
    const ids = [...selected];
    await Promise.all(ids.map((id) => entriesRepo.update(id, { date: bulkDate })));
    setBulkDate("");
    clearSelection();
  }

  async function bulkAssignProject() {
    if (!bulkProjectId) return;
    const ids = [...selected];
    await Promise.all(
      ids.map((id) =>
        entriesRepo.updateMeta(id, (_m, current) => ({ ...meta(current), projectId: bulkProjectId })),
      ),
    );
    setBulkProjectId("");
    clearSelection();
  }

  async function bulkRemoveProject() {
    const ids = [...selected];
    await Promise.all(
      ids.map((id) =>
        entriesRepo.updateMeta(id, (_m, current) => {
          const { projectId: _removed, ...rest } = meta(current);
          return rest;
        }),
      ),
    );
    clearSelection();
  }

  // Einplanen: offenes Panel + Draft (Datum/Uhrzeit) für genau eine Task.
  const [schedFor, setSchedFor] = useState<string | null>(null);
  const [schedDate, setSchedDate] = useState(today);
  const [schedStart, setSchedStart] = useState("");
  const [schedEnd, setSchedEnd] = useState("");

  function openSchedule(entry: Entry) {
    if (schedFor === entry.id) {
      setSchedFor(null);
      return;
    }
    const s = meta(entry).schedule;
    setSchedDate(entry.date || today);
    setSchedStart(s?.startTime ?? "");
    setSchedEnd(s?.endTime ?? "");
    setSchedFor(entry.id);
  }

  async function saveSchedule(entry: Entry) {
    await scheduleTask(entry.id, schedDate, schedStart, schedEnd);
    setSchedFor(null);
  }

  async function clearSchedule(id: string) {
    await unscheduleTask(id);
    setSchedFor(null);
  }

  async function addSubtask(entry: Entry, text: string) {
    const sub: Subtask = { id: crypto.randomUUID(), text, done: false };
    await entriesRepo.updateMeta(entry.id, (_meta, current) => {
      const m = meta(current);
      return { ...m, subtasks: [...(m.subtasks ?? []), sub] };
    });
  }

  async function toggleSubtask(entry: Entry, subId: string) {
    await entriesRepo.updateMeta(entry.id, (_meta, current) => {
      const m = meta(current);
      return {
        ...m,
        subtasks: (m.subtasks ?? []).map((s) =>
          s.id === subId ? { ...s, done: !s.done } : s,
        ),
      };
    });
  }

  async function removeSubtask(entry: Entry, subId: string) {
    await entriesRepo.updateMeta(entry.id, (_meta, current) => {
      const m = meta(current);
      return { ...m, subtasks: (m.subtasks ?? []).filter((s) => s.id !== subId) };
    });
  }

  async function remove(id: string) {
    await entriesRepo.remove(id);
  }

  const todayActive = view === "today" || (view === "day" && viewDate === today);

  return (
    <div className="page">
      <PageHeader
        icon="✅"
        title="Tasks"
        subtitle={
          <>
            {tr("Heute offen", "Open today")}: <strong>{openTodayCount}</strong>
          </>
        }
      />

      <form className="task-form" onSubmit={addTask}>
        <input
          className="task-input"
          placeholder={tr("Neue Task…", "New task…")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <NativeDateField
          className="task-select"
          value={formDate}
          onChange={setFormDate}
          title={tr("Datum der Task", "Task date")}
        />
        <select
          className="task-select"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
        >
          <option value="high">{tr("Hoch", "High")}</option>
          <option value="medium">{tr("Mittel", "Medium")}</option>
          <option value="low">{tr("Niedrig", "Low")}</option>
        </select>
        <select
          className="task-select"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          title={tr("Projekt (optional)", "Project (optional)")}
        >
          <option value="">— {tr("Projekt", "Project")} —</option>
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
          title={tr("Goal (optional)", "Goal (optional)")}
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
          title={tr("Wiederholung (optional)", "Recurrence (optional)")}
        >
          <option value="">— {tr("Einmalig", "One-time")} —</option>
          <option value="daily">{tr("Täglich", "Daily")}</option>
          <option value="weekly">{tr("Wöchentlich", "Weekly")}</option>
          <option value="monthly">{tr("Monatlich", "Monthly")}</option>
          <option value="weekdays">{tr("Wochentage", "Weekdays")}</option>
        </select>
        {(recurKind === "daily" || recurKind === "weekly" || recurKind === "monthly") && (
          <input
            className="task-select"
            type="number"
            min={1}
            value={recurInterval}
            onChange={(e) => setRecurInterval(Math.max(1, parseInt(e.target.value) || 1))}
            title={tr("Alle N Tage/Wochen/Monate", "Every N days/weeks/months")}
            style={{ width: 64 }}
          />
        )}
        {recurKind === "weekdays" && (
          <span style={{ display: "inline-flex", gap: 4 }}>
            {weekdayLabels.map((label, i) => (
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
          {tr("Hinzufügen", "Add")}
        </button>
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

      <div className="filter-row wrap task-filter-row">
        <button
          className={`chip ${todayActive ? "chip-active" : ""}`}
          onClick={() => setView("today")}
        >
          {tr("Heute", "Today")}
        </button>
        <button
          className={`chip ${view === "next7" ? "chip-active" : ""}`}
          onClick={() => setView("next7")}
        >
          {tr("Nächste 7 Tage", "Next 7 days")}
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
          className={`chip ${view === "overdue" ? "chip-active" : ""}`}
          onClick={() => setView("overdue")}
        >
          {tr("Überfällig", "Overdue")}
        </button>
        <button
          className={`chip ${view === "highPriority" ? "chip-active" : ""}`}
          onClick={() => setView("highPriority")}
        >
          {tr("Hohe Priorität", "High priority")}
        </button>
        <button
          className={`chip ${view === "noProject" ? "chip-active" : ""}`}
          onClick={() => setView("noProject")}
        >
          {tr("Ohne Projekt", "No project")}
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
          {tr("Erledigt", "Completed")}
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="empty" data-icon="✅">
          <strong>
            {view === "today" && tr("Keine Tasks für heute", "No tasks for today")}
            {view === "next7" && tr("Keine Tasks in den nächsten 7 Tagen", "No tasks in the next 7 days")}
            {view === "week" && tr("Keine Tasks diese Woche", "No tasks this week")}
            {view === "later" && tr("Keine zukünftigen Tasks", "No future tasks")}
            {view === "overdue" && tr("Keine überfälligen Tasks", "No overdue tasks")}
            {view === "highPriority" && tr("Keine offenen Tasks mit hoher Priorität", "No open high-priority tasks")}
            {view === "noProject" && tr("Alle offenen Tasks haben ein Projekt", "Every open task has a project")}
            {view === "all" && tr("Alle Tasks erledigt", "All tasks completed")}
            {view === "done" && tr("Noch keine Tasks abgehakt", "No completed tasks yet")}
            {view === "day" && tr("Keine Tasks für diesen Tag", "No tasks for this day")}
          </strong>
          <span>{tr("Neuen Task oben im Formular anlegen.", "Create a new task using the form above.")}</span>
        </div>
      ) : (
        <>
        <div className={`task-bulk-bar ${selected.size > 0 ? "is-active" : ""}`}>
          <label className="task-bulk-selectall">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              aria-label={tr("Alle sichtbaren auswählen", "Select all visible")}
            />
            {selected.size > 0
              ? tr(
                  `${selected.size} von ${tasks.length} ausgewählt`,
                  `${selected.size} of ${tasks.length} selected`,
                )
              : tr("Alle auswählen", "Select all")}
          </label>
          {selected.size > 0 && (
            <div className="task-bulk-actions">
              <button className="btn sm" onClick={bulkComplete}>
                ✓ {tr("Erledigen", "Complete")}
              </button>
              <span className="task-bulk-group">
                <input
                  className="task-select sm"
                  type="date"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  title={tr("Neues Datum", "New date")}
                />
                <button className="chip sm" onClick={bulkReschedule} disabled={!bulkDate}>
                  {tr("Verschieben", "Reschedule")}
                </button>
              </span>
              <span className="task-bulk-group">
                <select
                  className="task-select sm"
                  value={bulkProjectId}
                  onChange={(e) => setBulkProjectId(e.target.value)}
                  title={tr("Projekt zuweisen", "Assign project")}
                >
                  <option value="">— {tr("Projekt", "Project")} —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <button className="chip sm" onClick={bulkAssignProject} disabled={!bulkProjectId}>
                  {tr("Zuweisen", "Assign")}
                </button>
                <button className="chip sm" onClick={bulkRemoveProject}>
                  {tr("Projekt entfernen", "Remove project")}
                </button>
              </span>
              <button className="chip sm task-bulk-clear" onClick={clearSelection}>
                {tr("Auswahl aufheben", "Clear selection")}
              </button>
            </div>
          )}
        </div>
        <ul className="task-list">
          {tasks.map((entry) => {
            const m = meta(entry);
            const showDate = view !== "today" && view !== "day";
            const overdue = !m.done && !!entry.date && entry.date < today;
            const subs = m.subtasks ?? [];
            const subsDone = subs.filter((s) => s.done).length;
            const isExpanded = expanded.has(entry.id);
            const sched = m.schedule;
            return (
              <li
                key={entry.id}
                className={`task-item ${m.done ? "task-done" : ""} ${overdue ? "task-overdue" : ""} ${
                  sched ? "task-scheduled" : ""
                } ${selected.has(entry.id) ? "task-selected" : ""}`}
              >
                <div className="task-item-row">
                  {/* Auswahl-Checkbox bewusst anders gestylt als die
                      Erledigt-Checkbox daneben — zwei identische Boxen pro
                      Zeile waren nicht unterscheidbar. */}
                  <input
                    type="checkbox"
                    className="task-bulk-check"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    title={tr("Für Sammelaktionen auswählen", "Select for bulk actions")}
                    aria-label={tr(`${entry.title} auswählen`, `Select ${entry.title}`)}
                  />
                  <label className="task-check">
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() => toggleTaskDone(entry.id)}
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
                    <span className="chip" title={recurrenceLabel(normalizeRecurrence(m.recurrence)!)}>
                      🔄
                    </span>
                  )}
                  <button
                    className={`chip subtask-toggle ${sched ? "chip-active" : ""}`}
                    title={
                      sched
                        ? tr("Im Wochenplan eingeplant", "Scheduled in the weekly plan")
                        : tr("In den Wochenplan einplanen", "Schedule in the weekly plan")
                    }
                    onClick={() => openSchedule(entry)}
                  >
                    🗓️{sched?.startTime ? ` ${sched.startTime}` : ""}
                  </button>
                  <button
                    className={`chip subtask-toggle ${isExpanded ? "chip-active" : ""}`}
                    title="Subtasks"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    {subs.length > 0 ? `${subsDone}/${subs.length}` : "⋯"}
                  </button>
                  <button
                    className="task-del"
                    title={tr("Löschen", "Delete")}
                    onClick={() => remove(entry.id)}
                  >
                    ✕
                  </button>
                </div>
                {schedFor === entry.id && (
                  <div className="subtask-panel sched-panel">
                    <label className="sched-field">
                      <span>{tr("Tag", "Day")}</span>
                      <input
                        className="task-select"
                        type="date"
                        value={schedDate}
                        onChange={(e) => setSchedDate(e.target.value)}
                      />
                    </label>
                    <label className="sched-field">
                      <span>{tr("Von", "From")}</span>
                      <input
                        className="task-select"
                        type="time"
                        value={schedStart}
                        onChange={(e) => setSchedStart(e.target.value)}
                      />
                    </label>
                    <label className="sched-field">
                      <span>{tr("Bis", "To")}</span>
                      <input
                        className="task-select"
                        type="time"
                        value={schedEnd}
                        onChange={(e) => setSchedEnd(e.target.value)}
                      />
                    </label>
                    <div className="rv-actions">
                      <button className="btn sm" onClick={() => saveSchedule(entry)}>
                        {sched ? tr("Aktualisieren", "Update") : tr("Einplanen", "Schedule")}
                      </button>
                      {sched && (
                        <button className="chip sm" onClick={() => clearSchedule(entry.id)}>
                          {tr("Ausplanen", "Unschedule")}
                        </button>
                      )}
                      <button className="chip sm" onClick={() => setSchedFor(null)}>
                        {tr("Abbrechen", "Cancel")}
                      </button>
                    </div>
                    <span className="muted sched-hint">
                      {tr(
                        "Uhrzeit optional — ohne Zeit erscheint die Task am Tagesende im Wochenplan.",
                        "Time is optional — without one the task appears at the end of the day in the weekly plan.",
                      )}
                    </span>
                  </div>
                )}
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
        </>
      )}
    </div>
  );
}
