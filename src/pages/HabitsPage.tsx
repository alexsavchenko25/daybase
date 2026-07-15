import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso, lastNDays } from "../utils/date";
import { computeStreak, isDoneForPeriod, habitMeta } from "../utils/habit";
import type { Entry, HabitMeta } from "../types";

type Frequency = HabitMeta["frequency"];

export default function HabitsPage() {
  const today = todayIso();
  const week = lastNDays(7);
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");

  const habits = useLiveQuery(
    () => db.entries.where("type").equals("habit").sortBy("createdAt"),
    [],
    [] as Entry[],
  );

  async function addHabit(e: React.FormEvent) {
    e.preventDefault();
    const t = name.trim();
    if (!t) return;
    await entriesRepo.create({
      type: "habit",
      date: today,
      title: t,
      content: "",
      tags: [],
      meta: { frequency, streak: 0, completedDates: [] } satisfies HabitMeta,
    });
    setName("");
    setFrequency("daily");
  }

  // Heute an/abhaken. Streak direkt aus neuen completedDates neu berechnen.
  async function toggleToday(habit: Entry) {
    const m = habitMeta(habit);
    const set = new Set(m.completedDates);
    if (set.has(today)) set.delete(today);
    else set.add(today);
    const completedDates = [...set].sort();
    const streak = computeStreak(completedDates, m.frequency);
    await entriesRepo.update(habit.id, {
      meta: { ...m, completedDates, streak } satisfies HabitMeta,
    });
  }

  async function remove(id: string) {
    await entriesRepo.remove(id);
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>
          <span className="page-icon">🔁</span> Habit Tracker
        </h1>
      </header>

      <form className="task-form" onSubmit={addHabit}>
        <input
          className="task-input"
          placeholder="Neue Gewohnheit…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="task-select"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
        >
          <option value="daily">Täglich</option>
          <option value="weekly">Wöchentlich</option>
        </select>
        <button className="btn" type="submit">
          Hinzufügen
        </button>
      </form>

      {habits.length === 0 ? (
        <div className="empty" data-icon="🔁">
          <strong>Noch keine Habits</strong>
          <span>Lege oben deine erste Gewohnheit an — täglich oder wöchentlich.</span>
        </div>
      ) : (
        <ul className="habit-list">
          {habits.map((habit) => {
            const m = habitMeta(habit);
            const done = isDoneForPeriod(m.completedDates, m.frequency, today);
            const doneSet = new Set(m.completedDates);
            return (
              <li key={habit.id} className="habit-item">
                <label className="habit-check">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggleToday(habit)}
                  />
                  <span className="habit-name">{habit.title}</span>
                </label>

                <span className="habit-freq">
                  {m.frequency === "daily" ? "täglich" : "wöchentl."}
                </span>

                <div className="habit-week" title="letzte 7 Tage">
                  {week.map((d) => (
                    <span
                      key={d}
                      className={`dot ${doneSet.has(d) ? "dot-on" : ""} ${
                        d === today ? "dot-today" : ""
                      }`}
                      title={d}
                    />
                  ))}
                </div>

                <span className="habit-streak" title="aktueller Streak">
                  🔥 {m.streak}
                </span>

                <button
                  className="task-del"
                  title="Löschen"
                  onClick={() => remove(habit.id)}
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
