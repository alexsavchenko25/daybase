import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { nowHm, todayIso } from "../utils/date";
import { PRIORITY_ORDER, taskMeta, toggleTaskDone } from "../utils/task";
import { computeStreak, habitMeta, isDoneForPeriod, toggleCompletion } from "../utils/habit";
import { fmtDuration, focusMeta } from "../utils/focus";
import { catClass, DEFAULT_CATEGORY, type CategoryId } from "../data/weekplanCategories";
import PageHeader from "../components/PageHeader";
import { useI18n } from "../i18n";
import type { Entry, HabitMeta, TaskMeta } from "../types";

// Today aggregiert nur bestehende Entries — kein eigener EntryType, kein
// Zwischenspeicher. Analog zum Dashboard (index-Route), aber action-first:
// jede Zeile ist direkt bedienbar statt nur Kennzahlen zu zeigen.

interface BlockMeta {
  startTime: string;
  endTime: string;
  done: boolean;
  category: CategoryId;
}
function blockMeta(e: Entry): BlockMeta {
  const m = e.meta as Partial<BlockMeta>;
  return {
    startTime: m.startTime ?? "",
    endTime: m.endTime ?? "",
    done: m.done === true,
    category: (m.category as CategoryId) ?? DEFAULT_CATEGORY,
  };
}

// Überfällige Tasks werden hier nur angerissen — Today soll handlungsfähig
// bleiben und nicht zur zweiten Tasks-Seite werden.
const OVERDUE_PREVIEW = 4;

type NextUp =
  | { kind: "block"; entry: Entry; meta: BlockMeta }
  | { kind: "task"; entry: Entry; meta: TaskMeta }
  | null;

export default function TodayPage() {
  const { tr, locale } = useI18n();
  const today = todayIso();

  const allTasks = useLiveQuery(
    () => db.entries.where("type").equals("task").toArray(),
    [],
    [] as Entry[],
  );
  const blocksToday = useLiveQuery(
    () => db.entries.where("[type+date]").equals(["weekplan", today]).toArray(),
    [today],
    [] as Entry[],
  );
  const habits = useLiveQuery(
    () => db.entries.where("type").equals("habit").toArray(),
    [],
    [] as Entry[],
  );
  const focusToday = useLiveQuery(
    () => db.entries.where("[type+date]").equals(["focus", today]).toArray(),
    [today],
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

  const openToday = useMemo(
    () =>
      allTasks
        .filter((e) => e.date === today && !taskMeta(e).done)
        .sort((a, b) => {
          const dp = PRIORITY_ORDER[taskMeta(a).priority] - PRIORITY_ORDER[taskMeta(b).priority];
          return dp !== 0 ? dp : b.createdAt.localeCompare(a.createdAt);
        }),
    [allTasks, today],
  );

  // Datum muss gesetzt sein: "" sortiert lexikografisch vor jedem echten
  // Datum und würde sonst als überfällig gezählt (siehe TasksPage).
  const overdue = useMemo(
    () =>
      allTasks
        .filter((e) => !!e.date && e.date < today && !taskMeta(e).done)
        .sort((a, b) => a.date.localeCompare(b.date) || PRIORITY_ORDER[taskMeta(a).priority] - PRIORITY_ORDER[taskMeta(b).priority]),
    [allTasks, today],
  );

  const blocksSorted = useMemo(
    () =>
      [...blocksToday].sort((a, b) =>
        (blockMeta(a).startTime || "99:99").localeCompare(blockMeta(b).startTime || "99:99"),
      ),
    [blocksToday],
  );

  const openHabits = useMemo(
    () =>
      habits.filter(
        (h) => !isDoneForPeriod(habitMeta(h).completedDates, habitMeta(h).frequency, today),
      ),
    [habits, today],
  );

  const focusSummary = useMemo(() => {
    const totalSec = focusToday.reduce((s, e) => s + focusMeta(e).actualSec, 0);
    return { totalSec, count: focusToday.length };
  }, [focusToday]);

  // "Next up": nächster noch offener Zeitblock (nach aktueller Uhrzeit,
  // sonst der früheste offene von heute); ohne Blöcke die Top-Prio-Task.
  const nextUp: NextUp = useMemo(() => {
    const unfinished = blocksSorted.filter((b) => !blockMeta(b).done);
    if (unfinished.length) {
      const now = nowHm();
      const upcoming = unfinished.find((b) => {
        const m = blockMeta(b);
        return (m.endTime || m.startTime || "") >= now;
      });
      const entry = upcoming ?? unfinished[0];
      return { kind: "block", entry, meta: blockMeta(entry) };
    }
    if (openToday.length) {
      const entry = openToday[0];
      return { kind: "task", entry, meta: taskMeta(entry) };
    }
    return null;
  }, [blocksSorted, openToday]);

  async function toggleBlock(entry: Entry) {
    const m = blockMeta(entry);
    await entriesRepo.updateMeta(entry.id, () => ({ ...entry.meta, done: !m.done }));
  }

  async function toggleHabit(habit: Entry) {
    await entriesRepo.updateMeta(habit.id, (_meta, current) => {
      const m = habitMeta(current);
      const completedDates = toggleCompletion(m.completedDates, m.frequency, today);
      return {
        ...m,
        completedDates,
        streak: computeStreak(completedDates, m.frequency, today),
      } satisfies HabitMeta;
    });
  }

  const dateLabel = new Date(today + "T00:00:00").toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="page today-page">
      <PageHeader icon="☀️" title={tr("Heute", "Today")} subtitle={dateLabel} />

      {/* Next up — die eine Sache, mit der man jetzt anfängt. */}
      <div className="dash-hero-card dash-hero-focus today-nextup">
        <span className="dash-label">{tr("Nächstes", "Next up")}</span>
        {nextUp?.kind === "block" && (
          <>
            <div className="dash-next">
              {(nextUp.meta.startTime || nextUp.meta.endTime) && (
                <span className="dash-next-time">
                  {nextUp.meta.startTime}
                  {nextUp.meta.endTime && `–${nextUp.meta.endTime}`}
                </span>
              )}
              <span className="dash-hero-text">
                <span className={`legend-dot ${catClass(nextUp.meta.category)}`} />{" "}
                {nextUp.entry.title}
              </span>
            </div>
            <div className="rv-actions">
              <Link className="btn sm" to={`/focus?title=${encodeURIComponent(nextUp.entry.title)}`}>
                ▶ {tr("Fokus starten", "Start focus")}
              </Link>
              <Link className="dash-link" to="/weekplan">
                {tr("Wochenplan", "Weekly plan")} →
              </Link>
            </div>
          </>
        )}
        {nextUp?.kind === "task" && (
          <>
            <label className="task-check today-nextup-task">
              <input
                type="checkbox"
                checked={nextUp.meta.done}
                onChange={() => toggleTaskDone(nextUp!.entry.id)}
              />
              <span className="dash-hero-text">{nextUp.entry.title}</span>
              <span className={`prio prio-${nextUp.meta.priority}`}>{prioLabel(nextUp.meta.priority, tr)}</span>
            </label>
            <div className="rv-actions">
              <Link className="btn sm" to={`/focus?linkId=${nextUp.entry.id}`}>
                ▶ {tr("Fokus starten", "Start focus")}
              </Link>
              <Link className="dash-link" to={`/tasks?date=${today}`}>
                {tr("Alle Tasks", "All tasks")} →
              </Link>
            </div>
          </>
        )}
        {!nextUp && (
          <p className="dash-hero-text muted">
            {tr("Alles erledigt für heute. 🎉", "Everything's done for today. 🎉")}
          </p>
        )}
      </div>

      {/* Überfällig — klar getrennt, damit es nicht mit heutigen Tasks verschwimmt. */}
      {overdue.length > 0 && (
        <>
          <div className="section-head">
            <p className="section-label">
              {tr("Überfällig", "Overdue")} <span className="section-count">{overdue.length}</span>
            </p>
            <Link to="/tasks" className="dash-link">
              {tr("in Tasks bearbeiten", "handle in tasks")} →
            </Link>
          </div>
          <ul className="task-list">
            {overdue.slice(0, OVERDUE_PREVIEW).map((entry) => {
              const m = taskMeta(entry);
              return (
                <li key={entry.id} className="task-item task-overdue">
                  <div className="task-item-row">
                    <label className="task-check">
                      <input
                        type="checkbox"
                        checked={m.done}
                        onChange={() => toggleTaskDone(entry.id)}
                      />
                      <span className="task-title">{entry.title}</span>
                    </label>
                    <span className="task-date">{entry.date}</span>
                    <span className={`prio prio-${m.priority}`}>{prioLabel(m.priority, tr)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {overdue.length > OVERDUE_PREVIEW && (
            <Link to="/tasks" className="dash-link today-more">
              {tr(
                `+ ${overdue.length - OVERDUE_PREVIEW} weitere überfällige Tasks`,
                `+ ${overdue.length - OVERDUE_PREVIEW} more overdue tasks`,
              )}{" "}
              →
            </Link>
          )}
        </>
      )}

      {/* Kennzahlen */}
      <div className="dash-kpis today-kpis">
        <Link to="/focus" className="dash-kpi">
          <span className="dash-kpi-value">{fmtDuration(focusSummary.totalSec)}</span>
          <span className="dash-kpi-label">
            {tr("Fokuszeit heute", "Focus time today")} · {focusSummary.count} {tr("Sessions", "sessions")}
          </span>
        </Link>
        <Link to="/tasks" className="dash-kpi">
          <span className="dash-kpi-value">{openToday.length}</span>
          <span className="dash-kpi-label">{tr("Tasks offen", "Open tasks")}</span>
        </Link>
        <Link to="/habits" className="dash-kpi">
          <span className="dash-kpi-value">{openHabits.length}</span>
          <span className="dash-kpi-label">{tr("Habits offen", "Open habits")}</span>
        </Link>
      </div>

      <div className="dash-grid dash-grid-2">
        {/* Heutige Tasks */}
        <div className="dash-info">
          <div className="dash-info-head">
            <span className="dash-label">{tr("Tasks heute", "Today's tasks")}</span>
            <Link to={`/tasks?date=${today}`} className="dash-link">
              {tr("alle", "all")} →
            </Link>
          </div>
          {openToday.length === 0 ? (
            <span className="muted">{tr("Keine offenen Tasks heute.", "No open tasks today.")}</span>
          ) : (
            <ul className="task-list">
              {openToday.map((entry) => {
                const m = taskMeta(entry);
                return (
                  <li key={entry.id} className="task-item">
                    <div className="task-item-row">
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
                      <span className={`prio prio-${m.priority}`}>{prioLabel(m.priority, tr)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Heutiger Wochenplan */}
        <div className="dash-info">
          <div className="dash-info-head">
            <span className="dash-label">{tr("Wochenplan heute", "Today's plan")}</span>
            <Link to="/weekplan" className="dash-link">
              {tr("Wochenplan", "Weekly plan")} →
            </Link>
          </div>
          {blocksSorted.length === 0 ? (
            <span className="muted">{tr("Keine Blöcke heute geplant.", "No blocks planned today.")}</span>
          ) : (
            <ul className="task-list">
              {blocksSorted.map((entry) => {
                const m = blockMeta(entry);
                return (
                  <li key={entry.id} className={`task-item ${m.done ? "task-done" : ""}`}>
                    <div className="task-item-row">
                      <label className="task-check">
                        <input type="checkbox" checked={m.done} onChange={() => toggleBlock(entry)} />
                        <span className="task-title">
                          <span className={`legend-dot ${catClass(m.category)}`} /> {entry.title}
                        </span>
                      </label>
                      {(m.startTime || m.endTime) && (
                        <span className="task-date">
                          {m.startTime}
                          {m.endTime && `–${m.endTime}`}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Habits */}
      <div className="section-head">
        <p className="section-label">
          {tr("Habits heute", "Today's habits")}
          {openHabits.length > 0 && <span className="section-count">{openHabits.length}</span>}
        </p>
        <Link to="/habits" className="dash-link">
          {tr("alle", "all")} →
        </Link>
      </div>
      {habits.length === 0 ? (
        <div className="empty" data-icon="🔁">
          <strong>{tr("Noch keine Habits", "No habits yet")}</strong>
          <span>{tr("Lege eine Gewohnheit an, um sie hier täglich abzuhaken.", "Create a habit to check it off here every day.")}</span>
          <Link className="btn sm" to="/habits">
            {tr("Habit anlegen", "Create habit")}
          </Link>
        </div>
      ) : openHabits.length === 0 ? (
        <div className="empty" data-icon="🔥">
          <strong>{tr("Alle Habits erledigt", "All habits done")}</strong>
          <span>{tr("Streak gehalten — nichts mehr offen für heute.", "Streak kept — nothing left for today.")}</span>
        </div>
      ) : (
        <ul className="habit-list">
          {openHabits.map((habit) => {
            const m = habitMeta(habit);
            return (
              <li key={habit.id} className="habit-item">
                <label className="habit-check">
                  <input type="checkbox" checked={false} onChange={() => toggleHabit(habit)} />
                  <span className="habit-name">{habit.title}</span>
                </label>
                <span className="habit-freq">
                  {m.frequency === "daily" ? tr("täglich", "daily") : tr("wöchentl.", "weekly")}
                </span>
                <span className="habit-streak" title={tr("aktueller Streak", "current streak")}>
                  🔥 {m.streak}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function prioLabel(p: TaskMeta["priority"], tr: (de: string, en: string) => string): string {
  return p === "high" ? tr("Hoch", "High") : p === "low" ? tr("Niedrig", "Low") : tr("Mittel", "Medium");
}
