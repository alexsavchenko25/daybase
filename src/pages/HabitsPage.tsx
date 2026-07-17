import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso, lastNDays } from "../utils/date";
import { computeStreak, isDoneForPeriod, habitMeta } from "../utils/habit";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
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
    <div className="page habits-page">
      <PageHeader
        icon="habit"
        title="Habit Tracker"
        subtitle={tr("Konstanz sichtbar machen — Tag für Tag.", "Make consistency visible — day by day.")}
      />

      <form className="task-form quick-add-bar" onSubmit={addHabit}>
        <input
          className="task-input"
          placeholder={tr("Neue Gewohnheit…", "New habit…")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={tr("Name der Gewohnheit", "Habit name")}
        />
        <select
          className="task-select"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          aria-label={tr("Häufigkeit", "Frequency")}
        >
          <option value="daily">{tr("Täglich", "Daily")}</option>
          <option value="weekly">{tr("Wöchentlich", "Weekly")}</option>
        </select>
        <button className="btn" type="submit">
          <Icon name="plus" size={16} /> {tr("Hinzufügen", "Add")}
        </button>
      </form>

      {habits.length === 0 ? (
        <EmptyState
          icon="habit"
          title={tr("Noch keine Habits", "No habits yet")}
          description={tr("Lege deine erste tägliche oder wöchentliche Gewohnheit an.", "Create your first daily or weekly habit.")}
          compact
        />
      ) : (
        <ul className="habit-list">
          {habits.map((habit) => {
            const m = habitMeta(habit);
            const done = isDoneForPeriod(m.completedDates, m.frequency, today);
            const doneSet = new Set(m.completedDates);
            return (
              <li key={habit.id} className={`habit-item ${done ? "habit-complete" : ""}`}>
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
                  <Icon name="sparkles" size={15} /> {m.streak}
                </span>

                <button
                  className="icon-btn danger-ghost"
                  title={tr("Löschen", "Delete")}
                  aria-label={tr("Habit löschen", "Delete habit")}
                  onClick={() => remove(habit.id)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
