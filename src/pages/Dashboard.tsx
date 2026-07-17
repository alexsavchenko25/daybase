import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { addDaysIso, isoWeekNumber, mondayOfIso, todayIso } from "../utils/date";
import { isDoneForPeriod, habitMeta } from "../utils/habit";
import ProgressBar from "../components/ProgressBar";
import { fmtDuration, focusMeta } from "../utils/focus";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import { useI18n } from "../i18n";
import { daysSinceBackup } from "../utils/backup";
import { projectProgress } from "./ProjectsPage";
import { goalProgress } from "./GoalsPage";
import type {
  Entry,
  TaskMeta,
  ReviewMeta,
  WeeklyReviewMeta,
  GoalMeta,
} from "../types";

function nowHm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Dashboard() {
  const { locale, tr } = useI18n();
  const today = todayIso();

  const openTasks = useLiveQuery(
    async () => {
      const t = await db.entries.where("[type+date]").equals(["task", today]).toArray();
      return t.filter((e: Entry) => !(e.meta as TaskMeta).done).length;
    },
    [today],
    0,
  );

  const openHabits = useLiveQuery(
    async () => {
      const habits = await db.entries.where("type").equals("habit").toArray();
      return habits.filter(
        (h: Entry) => !isDoneForPeriod(habitMeta(h).completedDates, habitMeta(h).frequency, today),
      ).length;
    },
    [today],
    0,
  );

  // Überfällige Tasks: offen + Datum vor heute.
  const overdueTasks = useLiveQuery(
    async () => {
      const t = await db.entries.where("type").equals("task").toArray();
      return t.filter((e: Entry) => !(e.meta as TaskMeta).done && e.date < today).length;
    },
    [today],
    0,
  );

  // Heutiges Review (Status).
  const review = useLiveQuery(
    () => db.entries.where("[type+date]").equals(["review", today]).first(),
    [today],
  );

  // Heutige Focus-Sessions: Summe, Anzahl, letzte Session.
  const focusSummary = useLiveQuery(
    async () => {
      const s = await db.entries.where("[type+date]").equals(["focus", today]).toArray();
      const totalSec = s.reduce((sum: number, e: Entry) => sum + focusMeta(e).actualSec, 0);
      const last = s.length ? s[s.length - 1] : null;
      return { totalSec, count: s.length, last };
    },
    [today],
    { totalSec: 0, count: 0, last: null as Entry | null },
  );

  // Tagesfokus = gestern gesetzte "Tomorrow Priority".
  const focus = useLiveQuery(
    async () => {
      const y = await db.entries
        .where("[type+date]")
        .equals(["review", addDaysIso(today, -1)])
        .first();
      return (y?.meta as ReviewMeta | undefined)?.tomorrowPriority || "";
    },
    [today],
    "",
  );

  // Nächster Wochenplan-Block heute (ab jetzt, sonst erster offener).
  const nextBlock = useLiveQuery(
    async () => {
      const blocks = await db.entries
        .where("[type+date]")
        .equals(["weekplan", today])
        .toArray();
      const sorted = blocks
        .map((b: Entry) => ({ b, m: b.meta as { startTime?: string; endTime?: string; done?: boolean } }))
        .sort((a, z) => (a.m.startTime ?? "").localeCompare(z.m.startTime ?? ""));
      const now = nowHm();
      const upcoming = sorted.find((x) => (x.m.endTime ?? x.m.startTime ?? "") >= now);
      const pick = upcoming ?? sorted[0];
      return pick
        ? { title: pick.b.title, start: pick.m.startTime ?? "", end: pick.m.endTime ?? "" }
        : null;
    },
    [today],
    null as null | { title: string; start: string; end: string },
  );

  // Weekly-Review-Hinweis: nur So/Mo, wenn KW-Review fehlt.
  const weekday = new Date(today + "T00:00:00").getDay(); // 0=So,1=Mo
  const monday = mondayOfIso(today);
  const weeklyDone = useLiveQuery(
    async () =>
      !!(await db.entries.where("[type+date]").equals(["weeklyreview", monday]).first()),
    [monday],
    false,
  );
  const showWeeklyHint = (weekday === 0 || weekday === 1) && !weeklyDone;

  // Backup-Reminder: Daten vorhanden + nie oder >7 Tage kein Export.
  const totalEntries = useLiveQuery(() => db.entries.count(), [], 0);
  const backupDays = daysSinceBackup();
  const showBackupHint = totalEntries > 0 && (backupDays === null || backupDays >= 7);

  // Wochenfokus = Next Week Focus aus dem jüngsten Weekly Review.
  const weeklyFocus = useLiveQuery(
    async () => {
      const all = await db.entries.where("type").equals("weeklyreview").toArray();
      if (!all.length) return "";
      all.sort((a, b) => b.date.localeCompare(a.date));
      return (all[0].meta as WeeklyReviewMeta).nextWeekFocus || "";
    },
    [],
    "",
  );

  // Top Goals (aktiv) mit Auto-Progress aus verknüpften Tasks/Projects.
  const topGoals = useLiveQuery(
    async () => {
      const gs = (await db.entries.where("type").equals("goal").toArray()).filter(
        (g: Entry) => (g.meta as GoalMeta).status === "active",
      );
      const tasks = await db.entries.where("type").equals("task").toArray();
      const projects = await db.entries.where("type").equals("project").toArray();
      return gs
        .map((g: Entry) => ({
          g,
          pct: goalProgress(g.id, (g.meta as GoalMeta).progress, tasks, projects).pct,
        }))
        .sort(
          (a, b) =>
            ((a.g.meta as GoalMeta).deadline || "9999").localeCompare(
              (b.g.meta as GoalMeta).deadline || "9999",
            ) || b.pct - a.pct,
        )
        .slice(0, 3);
    },
    [],
    [] as { g: Entry; pct: number }[],
  );

  // Aktive Projects + Task-basierter Fortschritt.
  const activeProjects = useLiveQuery(
    async () => {
      const ps = (await db.entries.where("type").equals("project").toArray()).filter(
        (p: Entry) => (p.meta as { status?: string }).status === "active",
      );
      const tasks = await db.entries.where("type").equals("task").toArray();
      return ps
        .slice(0, 3)
        .map((p: Entry) => ({ p, prog: projectProgress(p.id, tasks) }));
    },
    [],
    [] as { p: Entry; prog: { done: number; total: number; pct: number } }[],
  );

  const dateLabel = new Date(today + "T00:00:00").toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="page dashboard">
      <PageHeader icon="dashboard" title="Dashboard" subtitle={dateLabel} />

      {/* Primär: heutiger Fokus + nächster Block */}
      <div className="dash-hero">
        <div className="dash-hero-card dash-hero-focus">
          <span className="dash-label">{tr("Heutiger Fokus", "Today's focus")}</span>
          {focus ? (
            <p className="dash-hero-text">{focus}</p>
          ) : (
            <p className="dash-hero-text muted">
              {tr("Kein Fokus gesetzt — im", "No focus set — define it in")} <Link to="/review">{tr("gestrigen Review", "yesterday's review")}</Link>.
            </p>
          )}
          {weeklyFocus && (
            <div className="dash-hero-week">
              <span className="dash-label">{tr("Wochenfokus", "Weekly focus")}</span>
              <span>{weeklyFocus}</span>
            </div>
          )}
        </div>
        <div className="dash-hero-card dash-hero-next">
          <span className="dash-label">{tr("Nächster Block", "Next block")}</span>
          {nextBlock ? (
            <div className="dash-next">
              {nextBlock.start && (
                <span className="dash-next-time">
                  {nextBlock.start}
                  {nextBlock.end && `–${nextBlock.end}`}
                </span>
              )}
              <span className="dash-next-title">{nextBlock.title}</span>
            </div>
          ) : (
            <span className="muted">{tr("Kein Block heute.", "No block today.")}</span>
          )}
          <Link to="/weekplan" className="dash-link">
            {tr("Wochenplan", "Weekly plan")} →
          </Link>
        </div>
      </div>

      {/* Kompakte Hinweise */}
      <div className="dash-hints">
        {showBackupHint && (
          <Link to="/settings" className="dash-weekly-hint dash-backup-hint">
            <span className="dwh-icon"><Icon name="backup" size={17} /></span>
            <span>
              <strong>
                {backupDays === null
                  ? tr("Noch kein Backup erstellt.", "No backup created yet.")
                  : tr(`Letztes Backup vor ${backupDays} Tagen.`, `Last backup ${backupDays} days ago.`)}
              </strong>{" "}
              {tr("Daten liegen nur lokal — jetzt exportieren.", "Data is local only — export it now.")}
            </span>
            <span className="dwh-arrow">→</span>
          </Link>
        )}
        {showWeeklyHint && (
          <Link to="/weekly-review" className="dash-weekly-hint">
            <span className="dwh-icon"><Icon name="weekly-review" size={17} /></span>
            <span>
              <strong>{tr(`Weekly Review für KW ${isoWeekNumber(monday)} steht an.`, `Weekly Review for week ${isoWeekNumber(monday)} is due.`)}</strong>{" "}
              {tr("Woche auswerten & nächste planen.", "Review this week and plan the next.")}
            </span>
            <span className="dwh-arrow">→</span>
          </Link>
        )}
        {overdueTasks > 0 && (
          <Link to="/tasks" className="dash-weekly-hint dash-overdue-hint">
            <span className="dwh-icon"><Icon name="alert" size={17} /></span>
            <span>
              <strong>
                {tr(`${overdueTasks} überfällige ${overdueTasks === 1 ? "Task" : "Tasks"}.`, `${overdueTasks} overdue ${overdueTasks === 1 ? "task" : "tasks"}.`)}
              </strong>{" "}
              {tr("Erledigen oder neu terminieren.", "Complete or reschedule.")}
            </span>
            <span className="dwh-arrow">→</span>
          </Link>
        )}
        {!review && (
          <Link to="/review" className="dash-weekly-hint">
            <span className="dwh-icon"><Icon name="review" size={17} /></span>
            <span>
              <strong>{tr("Daily Review noch offen.", "Daily Review still open.")}</strong> {tr("Tag kurz auswerten.", "Take a moment to review your day.")}
            </span>
            <span className="dwh-arrow">→</span>
          </Link>
        )}
        {openHabits > 0 && (
          <Link to="/habits" className="dash-weekly-hint">
            <span className="dwh-icon"><Icon name="habit" size={17} /></span>
            <span>
              <strong>
                {tr(`${openHabits} ${openHabits === 1 ? "Habit" : "Habits"} heute offen.`, `${openHabits} ${openHabits === 1 ? "habit" : "habits"} open today.`)}
              </strong>{" "}
              {tr("Noch abhaken.", "Check them off.")}
            </span>
            <span className="dwh-arrow">→</span>
          </Link>
        )}
      </div>

      {/* Sekundäre KPIs */}
      <div className="dash-kpis">
        <Link to="/tasks" className="dash-kpi">
          <span className="dash-kpi-value">{openTasks}</span>
          <span className="dash-kpi-label">{tr("Tasks offen", "Open tasks")}</span>
        </Link>
        <Link to="/habits" className="dash-kpi">
          <span className="dash-kpi-value">{openHabits}</span>
          <span className="dash-kpi-label">{tr("Habits offen", "Open habits")}</span>
        </Link>
        <Link to="/focus" className="dash-kpi">
          <span className="dash-kpi-value">{fmtDuration(focusSummary.totalSec)}</span>
          <span className="dash-kpi-label">{tr("Fokuszeit", "Focus time")} · {focusSummary.count} {tr("Sessions", "sessions")}</span>
        </Link>
      </div>

      {(topGoals.length > 0 || activeProjects.length > 0) && (
        <div className="dash-grid dash-grid-2">
          <div className="dash-info">
            <div className="dash-info-head">
              <span className="dash-label">Top Goals</span>
              <Link to="/goals" className="dash-link">
                {tr("alle", "all")} →
              </Link>
            </div>
            {topGoals.length === 0 ? (
              <span className="muted">{tr("Keine aktiven Ziele.", "No active goals.")}</span>
            ) : (
              topGoals.map(({ g, pct }) => (
                <div key={g.id} className="dash-prog-row">
                  <span className="dash-prog-title">
                    {g.title}
                    <span className="dash-prog-sub">{Math.round(pct)}%</span>
                  </span>
                  <ProgressBar value={pct} label={`${g.title}: ${Math.round(pct)}%`} />
                </div>
              ))
            )}
          </div>
          <div className="dash-info">
            <div className="dash-info-head">
              <span className="dash-label">{tr("Aktive Projects", "Active projects")}</span>
              <Link to="/projects" className="dash-link">
                {tr("alle", "all")} →
              </Link>
            </div>
            {activeProjects.length === 0 ? (
              <span className="muted">{tr("Keine aktiven Projekte.", "No active projects.")}</span>
            ) : (
              activeProjects.map(({ p, prog }) => (
                <div key={p.id} className="dash-prog-row">
                  <span className="dash-prog-title">
                    {p.title}
                    <span className="dash-prog-sub">
                      {prog.done}/{prog.total}
                    </span>
                  </span>
                  <ProgressBar value={prog.pct} label={`${p.title}: ${Math.round(prog.pct)}%`} />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
