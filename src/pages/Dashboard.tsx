import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { todayIso } from "../utils/date";
import { isDoneForPeriod, habitMeta } from "../utils/habit";
import { MODULES } from "../modules";
import type { Entry, TaskMeta } from "../types";

// Dashboard-Startseite. Tasks- und Habits-Zahl sind echt (live aus IndexedDB).
export default function Dashboard() {
  const today = todayIso();

  const openTasks = useLiveQuery(
    async () => {
      const tasks = await db.entries
        .where("[type+date]")
        .equals(["task", today])
        .toArray();
      return tasks.filter((e: Entry) => !(e.meta as TaskMeta).done).length;
    },
    [today],
    0,
  );

  // Habits heute noch offen: daily nicht heute, weekly nicht diese Woche.
  const openHabits = useLiveQuery(
    async () => {
      const habits = await db.entries.where("type").equals("habit").toArray();
      return habits.filter((h: Entry) => {
        const m = habitMeta(h);
        return !isDoneForPeriod(m.completedDates, m.frequency, today);
      }).length;
    },
    [today],
    0,
  );

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
