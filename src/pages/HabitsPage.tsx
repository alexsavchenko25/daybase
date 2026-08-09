import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso, lastNDays } from "../utils/date";
import { computeStreak, isDoneForPeriod, habitMeta, toggleCompletion } from "../utils/habit";
import PageHeader from "../components/PageHeader";
import HabitHeatmap from "../components/HabitHeatmap";
import { useI18n } from "../i18n";
import type { Entry, HabitMeta } from "../types";

type Frequency = HabitMeta["frequency"];

export default function HabitsPage() {
  const { tr } = useI18n();
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
  // Basis ist der gespeicherte Stand (updateMeta), nicht das gerenderte Prop —
  // sonst verliert ein zweiter schneller Klick die erste Änderung.
  async function toggleToday(habit: Entry) {
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

  async function remove(id: string) {
    await entriesRepo.remove(id);
  }

  return (
    <div className="page habits-page">
      <PageHeader icon="🔁" title="Habit Tracker" />

      <form className="task-form" onSubmit={addHabit}>
        <input
          className="task-input"
          placeholder={tr("Neue Gewohnheit…", "New habit…")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="task-select"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
        >
          <option value="daily">{tr("Täglich", "Daily")}</option>
          <option value="weekly">{tr("Wöchentlich", "Weekly")}</option>
        </select>
        <button className="btn" type="submit">
          {tr("Hinzufügen", "Add")}
        </button>
      </form>

      {habits.length === 0 ? (
        <div className="empty" data-icon="🔁">
          <strong>{tr("Noch keine Habits", "No habits yet")}</strong>
          <span>{tr("Lege oben deine erste Gewohnheit an — täglich oder wöchentlich.", "Create your first habit above — daily or weekly.")}</span>
        </div>
      ) : (
        <>
          <HabitHeatmap habits={habits} today={today} />
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
                  {m.frequency === "daily" ? tr("täglich", "daily") : tr("wöchentl.", "weekly")}
                </span>

                <div className="habit-week" title={tr("letzte 7 Tage", "last 7 days")}>
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

                <span className="habit-streak" title={tr("aktueller Streak", "current streak")}>
                  🔥 {m.streak}
                </span>

                <button
                  className="task-del"
                  title={tr("Löschen", "Delete")}
                  onClick={() => remove(habit.id)}
                >
                  ✕
                </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
