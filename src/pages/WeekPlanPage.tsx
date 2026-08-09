import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { addDaysIso, isoWeekNumber, mondayOfIso, todayIso } from "../utils/date";
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  catClass,
  type CategoryId,
} from "../data/weekplanCategories";
import {
  isScheduled,
  scheduleSortKey,
  scheduleTask,
  taskMeta,
  toggleTaskDone,
  unscheduleTask,
} from "../utils/task";
import PageHeader from "../components/PageHeader";
import type { Entry } from "../types";
import { useI18n } from "../i18n";

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface PlanMeta {
  weekNumber: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  category: CategoryId;
  done: boolean;
}

function planMeta(e: Entry): PlanMeta {
  const m = e.meta as Partial<PlanMeta>;
  return {
    weekNumber: m.weekNumber ?? 0,
    dayOfWeek: m.dayOfWeek ?? 0,
    startTime: m.startTime ?? "",
    endTime: m.endTime ?? "",
    category: (m.category as CategoryId) ?? DEFAULT_CATEGORY,
    done: m.done ?? false,
  };
}

// Eine Tagesspalte mischt echte weekplan-Blöcke mit eingeplanten Tasks.
// Die Task bleibt dabei ihr eigener Entry (kein gespiegelter Block) — siehe
// utils/task.ts. `sort` ist die gemeinsame Startzeit für die Sortierung.
type DayItem =
  | { kind: "block"; entry: Entry; sort: string }
  | { kind: "task"; entry: Entry; sort: string };

export default function WeekPlanPage() {
  const { tr } = useI18n();
  const today = todayIso();
  const [monday, setMonday] = useState(() => mondayOfIso(today));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [compact, setCompact] = useState(true);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i)),
    [monday],
  );
  const sunday = weekDates[6];
  const weekNo = isoWeekNumber(monday);
  const isCurrentWeek = monday === mondayOfIso(today);

  const items = useLiveQuery(
    () =>
      db.entries
        .where("[type+date]")
        .between(["weekplan", monday], ["weekplan", sunday], true, true)
        .toArray(),
    [monday, sunday],
    [] as Entry[],
  );

  // Eingeplante Tasks derselben Woche. Nur Tasks mit meta.schedule tauchen im
  // Wochenplan auf — der Rest bleibt allein auf der Tasks-Seite.
  const scheduledTasks = useLiveQuery(
    async () => {
      const list = await db.entries
        .where("[type+date]")
        .between(["task", monday], ["task", sunday], true, true)
        .toArray();
      return list.filter((e) => isScheduled(taskMeta(e)));
    },
    [monday, sunday],
    [] as Entry[],
  );

  const byDay = useMemo(() => {
    const map: Record<number, DayItem[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    items.forEach((e) => {
      const m = planMeta(e);
      map[m.dayOfWeek]?.push({ kind: "block", entry: e, sort: m.startTime || "99:99" });
    });
    scheduledTasks.forEach((e) => {
      // Tag kommt beim Task aus dem Datum (kein dayOfWeek in TaskMeta).
      const di = weekDates.indexOf(e.date);
      if (di >= 0) {
        map[di]?.push({ kind: "task", entry: e, sort: scheduleSortKey(taskMeta(e).schedule) });
      }
    });
    Object.values(map).forEach((list) => list.sort((a, b) => a.sort.localeCompare(b.sort)));
    return map;
  }, [items, scheduledTasks, weekDates]);

  async function addBlock(di: number) {
    const date = weekDates[di];
    const created = await entriesRepo.create({
      type: "weekplan",
      date,
      title: "Neuer Block",
      content: "",
      tags: [],
      meta: {
        weekNumber: isoWeekNumber(date),
        dayOfWeek: di,
        startTime: "12:00",
        endTime: "13:00",
        category: DEFAULT_CATEGORY,
        done: false,
      } satisfies PlanMeta,
    });
    setEditingId(created.id);
  }

  async function saveBlock(
    entry: Entry,
    patch: {
      title: string;
      note: string;
      startTime: string;
      endTime: string;
      category: CategoryId;
    },
  ) {
    const m = planMeta(entry);
    await entriesRepo.update(entry.id, {
      title: patch.title.trim() || "(ohne Titel)",
      content: patch.note,
      meta: {
        ...m,
        startTime: patch.startTime,
        endTime: patch.endTime,
        category: patch.category,
      } satisfies PlanMeta,
    });
    setEditingId(null);
  }

  async function moveItem(entry: Entry, toDay: number) {
    if (planMeta(entry).dayOfWeek === toDay) return;
    const date = weekDates[toDay];
    const m = planMeta(entry);
    await entriesRepo.update(entry.id, {
      date,
      meta: {
        ...m,
        dayOfWeek: toDay,
        weekNumber: isoWeekNumber(date),
      } satisfies PlanMeta,
    });
  }

  async function toggleDone(entry: Entry) {
    const m = planMeta(entry);
    await entriesRepo.update(entry.id, {
      meta: { ...m, done: !m.done } satisfies PlanMeta,
    });
  }

  async function remove(id: string) {
    if (editingId === id) setEditingId(null);
    await entriesRepo.remove(id);
  }

  // Eingeplante Task auf einen anderen Tag ziehen: nur das Datum ändert sich,
  // die Uhrzeit bleibt. Titel/Prio/Subtasks/Verknüpfungen werden nicht angefasst.
  async function moveTask(entry: Entry, toDay: number) {
    const s = taskMeta(entry).schedule;
    await scheduleTask(entry.id, weekDates[toDay], s?.startTime ?? "", s?.endTime ?? "");
  }

  // Aus dem Wochenplan heraus darf an einer Task NUR die Uhrzeit geändert
  // werden — Titel, Prio, Subtasks, Projekt/Goal und Recurrence bleiben der
  // Tasks-Seite vorbehalten und können hier gar nicht überschrieben werden.
  async function saveTaskSchedule(entry: Entry, startTime: string, endTime: string) {
    await scheduleTask(entry.id, entry.date, startTime, endTime);
    setEditingId(null);
  }

  function dropToDay(id: string, toDay: number) {
    const block = items.find((i) => i.id === id);
    if (block) {
      moveItem(block, toDay);
      return;
    }
    const task = scheduledTasks.find((t) => t.id === id);
    if (task) moveTask(task, toDay);
  }

  return (
    <div className="page week-page">
      <PageHeader
        icon="🗓️"
        title={tr("Wochenplan", "Weekly Plan")}
        actions={
          <div className="week-nav">
            <button className="chip" onClick={() => setMonday(addDaysIso(monday, -7))}>
              ← {tr("Woche", "Week")}
            </button>
            <span className="week-label">
              {tr("KW", "Week")} {weekNo}
              {isCurrentWeek && <span className="week-now"> · {tr("aktuell", "current")}</span>}
            </span>
            <button className="chip" onClick={() => setMonday(addDaysIso(monday, 7))}>
              {tr("Woche", "Week")} →
            </button>
            {!isCurrentWeek && (
              <button className="chip" onClick={() => setMonday(mondayOfIso(today))}>
                {tr("heute", "today")}
              </button>
            )}
            <span className="week-sep" />
            <button
              className={`chip ${compact ? "chip-active" : ""}`}
              onClick={() => setCompact(true)}
            >
              {tr("Kompakt", "Compact")}
            </button>
            <button
              className={`chip ${!compact ? "chip-active" : ""}`}
              onClick={() => setCompact(false)}
            >
              {tr("Detailliert", "Detailed")}
            </button>
          </div>
        }
      />

      <div className="legend">
        {CATEGORIES.map((c) => (
          <span key={c.id} className="legend-item">
            <span className={`legend-dot ${catClass(c.id)}`} />
            {c.label}
          </span>
        ))}
      </div>

      <div className="week-grid">
        {weekDates.map((date, di) => (
          <DayColumn
            key={date}
            date={date}
            dayIdx={di}
            isToday={date === today}
            items={byDay[di]}
            editingId={editingId}
            compact={compact}
            onAdd={addBlock}
            onEdit={setEditingId}
            onSave={saveBlock}
            onMove={moveItem}
            onToggle={toggleDone}
            onRemove={remove}
            onDropToDay={dropToDay}
            onSaveTask={saveTaskSchedule}
            onUnscheduleTask={unscheduleTask}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn(props: {
  date: string;
  dayIdx: number;
  isToday: boolean;
  items: DayItem[];
  editingId: string | null;
  compact: boolean;
  onAdd: (di: number) => void;
  onEdit: (id: string | null) => void;
  onSave: (
    entry: Entry,
    patch: {
      title: string;
      note: string;
      startTime: string;
      endTime: string;
      category: CategoryId;
    },
  ) => void;
  onMove: (entry: Entry, toDay: number) => void;
  onToggle: (entry: Entry) => void;
  onRemove: (id: string) => void;
  onDropToDay: (id: string, toDay: number) => void;
  onSaveTask: (entry: Entry, startTime: string, endTime: string) => void;
  onUnscheduleTask: (id: string) => void;
}) {
  const { language, tr } = useI18n();
  const { date, dayIdx, isToday, items, editingId } = props;
  const dayLabels = language === "de" ? DAY_LABELS : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`day-col ${isToday ? "day-today" : ""} ${dragOver ? "day-drop" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) props.onDropToDay(id, dayIdx);
      }}
    >
      <div className="day-head">
        <span className="day-name">{dayLabels[dayIdx]}</span>
        <span className="day-date">
          {date.slice(8)}.{date.slice(5, 7)}.
        </span>
      </div>

      <ul className="day-items">
        {items.map((item) =>
          item.kind === "task" ? (
            <TaskBlockCard
              key={item.entry.id}
              entry={item.entry}
              editing={editingId === item.entry.id}
              compact={props.compact}
              onEdit={props.onEdit}
              onSave={props.onSaveTask}
              onUnschedule={props.onUnscheduleTask}
            />
          ) : (
            <BlockCard
              key={item.entry.id}
              entry={item.entry}
              dayIdx={dayIdx}
              editing={editingId === item.entry.id}
              compact={props.compact}
              onEdit={props.onEdit}
              onSave={props.onSave}
              onMove={props.onMove}
              onToggle={props.onToggle}
              onRemove={props.onRemove}
            />
          ),
        )}
      </ul>

      <button className="day-add-btn" onClick={() => props.onAdd(dayIdx)}>
        + {tr("Block", "Block")}
      </button>
    </div>
  );
}

// Eingeplante Task im Wochenplan. Bewusst NUR Uhrzeit + Erledigt + Ausplanen:
// alles andere (Titel, Prio, Subtasks, Projekt/Goal, Recurrence) gehört der
// Task und wird auf der Tasks-Seite bearbeitet — so kann der Wochenplan sie
// gar nicht überschreiben.
function TaskBlockCard(props: {
  entry: Entry;
  editing: boolean;
  compact: boolean;
  onEdit: (id: string | null) => void;
  onSave: (entry: Entry, startTime: string, endTime: string) => void;
  onUnschedule: (id: string) => void;
}) {
  const { tr } = useI18n();
  const { entry, editing, compact } = props;
  const m = taskMeta(entry);
  const s = m.schedule ?? { startTime: "", endTime: "" };
  const [startTime, setStartTime] = useState(s.startTime);
  const [endTime, setEndTime] = useState(s.endTime);

  function openEdit() {
    setStartTime(s.startTime);
    setEndTime(s.endTime);
    props.onEdit(entry.id);
  }

  if (editing) {
    return (
      <li className="plan-block cat-task pb-editing">
        <div className="pb-times">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <span>–</span>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="pb-task-name">✅ {entry.title}</div>
        <div className="pb-edit-actions">
          <button className="btn sm" onClick={() => props.onSave(entry, startTime, endTime)}>
            {tr("Speichern", "Save")}
          </button>
          <button className="chip sm" onClick={() => props.onEdit(null)}>
            {tr("Abbrechen", "Cancel")}
          </button>
          <button
            className="plan-del"
            title={tr("Aus Wochenplan entfernen", "Remove from weekly plan")}
            onClick={() => {
              props.onUnschedule(entry.id);
              props.onEdit(null);
            }}
          >
            ⤺
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`plan-block cat-task ${m.done ? "plan-done" : ""} ${
        compact ? "pb-compact" : "pb-detailed"
      }`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", entry.id)}
      title={tr("Eingeplante Task", "Scheduled task")}
    >
      <input
        type="checkbox"
        className="pb-check"
        checked={m.done}
        onChange={() => toggleTaskDone(entry.id)}
      />
      <div className="pb-main" onClick={openEdit}>
        <div className="pb-line">
          {(s.startTime || s.endTime) && (
            <span className="pb-time">
              {s.startTime}
              {s.endTime && `–${s.endTime}`}
            </span>
          )}
          <span className="pb-title">✅ {entry.title}</span>
        </div>
      </div>
      <Link
        className="pb-edit-btn"
        to={`/tasks?date=${entry.date}`}
        title={tr("In Tasks öffnen", "Open in tasks")}
        onClick={(e) => e.stopPropagation()}
      >
        ↗
      </Link>
    </li>
  );
}

function BlockCard(props: {
  entry: Entry;
  dayIdx: number;
  editing: boolean;
  compact: boolean;
  onEdit: (id: string | null) => void;
  onSave: (
    entry: Entry,
    patch: {
      title: string;
      note: string;
      startTime: string;
      endTime: string;
      category: CategoryId;
    },
  ) => void;
  onMove: (entry: Entry, toDay: number) => void;
  onToggle: (entry: Entry) => void;
  onRemove: (id: string) => void;
}) {
  const { language, tr } = useI18n();
  const dayLabels = language === "de" ? DAY_LABELS : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const { entry, dayIdx, editing, compact } = props;
  const m = planMeta(entry);

  // Edit-Draft.
  const [title, setTitle] = useState(entry.title);
  const [note, setNote] = useState(entry.content);
  const [startTime, setStartTime] = useState(m.startTime);
  const [endTime, setEndTime] = useState(m.endTime);
  const [category, setCategory] = useState<CategoryId>(m.category);

  function openEdit() {
    setTitle(entry.title);
    setNote(entry.content);
    setStartTime(m.startTime);
    setEndTime(m.endTime);
    setCategory(m.category);
    props.onEdit(entry.id);
  }

  if (editing) {
    return (
      <li className={`plan-block ${catClass(category)} pb-editing`}>
        <div className="pb-times">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <span>–</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
        <input
          className="pb-edit-title"
          placeholder={tr("Titel", "Title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="pb-edit-note"
          placeholder={tr("Notiz", "Note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="pb-edit-row">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryId)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            title={tr("Tag verschieben", "Move day")}
            value={dayIdx}
            onChange={(e) => props.onMove(entry, Number(e.target.value))}
          >
            {dayLabels.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="pb-edit-actions">
          <button
            className="btn sm"
            onClick={() =>
              props.onSave(entry, { title, note, startTime, endTime, category })
            }
          >
            {tr("Speichern", "Save")}
          </button>
          <button className="chip sm" onClick={() => props.onEdit(null)}>
            {tr("Abbrechen", "Cancel")}
          </button>
          <button
            className="plan-del"
            title={tr("Löschen", "Delete")}
            onClick={() => props.onRemove(entry.id)}
          >
            ✕
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`plan-block ${catClass(m.category)} ${
        m.done ? "plan-done" : ""
      } ${compact ? "pb-compact" : "pb-detailed"}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", entry.id)}
      // Kompakt: volle Notiz als nativer Hover-Tooltip.
      title={compact && entry.content ? entry.content : undefined}
    >
      <input
        type="checkbox"
        className="pb-check"
        checked={m.done}
        onChange={() => props.onToggle(entry)}
      />
      {/* Klick auf Kartenkörper öffnet vollen Edit-Modus. */}
      <div className="pb-main" onClick={openEdit}>
        <div className="pb-line">
          {(m.startTime || m.endTime) && (
            <span className="pb-time">
              {m.startTime}
              {m.endTime && `–${m.endTime}`}
            </span>
          )}
          <span className="pb-title">{entry.title}</span>
        </div>
        {!compact && entry.content && (
          <div className="pb-note">{entry.content}</div>
        )}
      </div>
      <button className="pb-edit-btn" title={tr("Bearbeiten", "Edit")} onClick={openEdit}>
        ✎
      </button>
    </li>
  );
}
