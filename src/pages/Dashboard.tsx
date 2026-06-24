import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { addDaysIso, isoWeekNumber, mondayOfIso, todayIso } from "../utils/date";
import { isDoneForPeriod, habitMeta } from "../utils/habit";
import { MODULES } from "../modules";
import type { Entry, TaskMeta, ReviewMeta } from "../types";

function nowHm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Dashboard() {
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

  // Heutiges Review (Status).
  const review = useLiveQuery(
    () => db.entries.where("[type+date]").equals(["review", today]).first(),
    [today],
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

  const dateLabel = new Date(today + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="page dashboard">
      <header className="page-head">
        <h1>
          <span className="page-icon">🏠</span> Dashboard
        </h1>
        <p className="muted">{dateLabel}</p>
      </header>

      {showWeeklyHint && (
        <Link to="/weekly" className="dash-weekly-hint">
          <span className="dwh-icon">📅</span>
          <span>
            <strong>Weekly Review für KW {isoWeekNumber(monday)} steht an.</strong>{" "}
            Woche auswerten & nächste planen.
          </span>
          <span className="dwh-arrow">→</span>
        </Link>
      )}

      <div className="dash-grid">
        <div className="dash-stat">
          <span className="dash-label">Tasks heute offen</span>
          <span className="dash-value">{openTasks}</span>
          <Link to="/tasks" className="dash-link">
            zu den Tasks →
          </Link>
        </div>
        <div className="dash-stat">
          <span className="dash-label">Habits heute offen</span>
          <span className="dash-value">{openHabits}</span>
          <Link to="/habits" className="dash-link">
            zum Habit Tracker →
          </Link>
        </div>
        <div className="dash-stat">
          <span className="dash-label">Daily Review</span>
          <span className={`dash-badge ${review ? "done" : "open"}`}>
            {review ? "✓ erledigt" : "noch offen"}
          </span>
          <Link to="/review" className="dash-link">
            {review ? "ansehen →" : "jetzt ausfüllen →"}
          </Link>
        </div>
      </div>

      <div className="dash-grid dash-grid-2">
        <div className="dash-info">
          <span className="dash-label">Nächster Block</span>
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
            <span className="muted">Kein Block heute. <Link to="/weekplan">Planen →</Link></span>
          )}
        </div>
        <div className="dash-info">
          <span className="dash-label">Heutiger Fokus</span>
          {focus ? (
            <span className="dash-focus">{focus}</span>
          ) : (
            <span className="muted">Kein Fokus gesetzt (gestriges Review).</span>
          )}
        </div>
      </div>

      <p className="section-label">Module</p>
      <div className="dash-modules">
        {MODULES.map((m) => (
          <Link key={m.path} to={m.path} className="dash-module">
            <span className="dash-module-icon">{m.icon}</span>
            <span className="dash-module-label">{m.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
