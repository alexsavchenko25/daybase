import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { addDaysIso, todayIso } from "../utils/date";
import PageHeader from "../components/PageHeader";
import type { ReviewMeta } from "../types";

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${WD[d.getDay()]} ${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

const EMPTY: ReviewMeta = {
  wins: "",
  problems: "",
  lessons: "",
  energy: 5,
  focus: 5,
  mood: 5,
  tomorrowPriority: "",
};

export default function ReviewPage() {
  const today = todayIso();
  const [params] = useSearchParams();
  const [date, setDate] = useState(() => params.get("date") || today);
  useEffect(() => {
    const d = params.get("date");
    if (d) setDate(d);
  }, [params]);
  const [form, setForm] = useState<ReviewMeta>(EMPTY);
  const [saved, setSaved] = useState(false);

  // Das (höchstens eine) Review für den gewählten Tag.
  const existing = useLiveQuery(
    () =>
      db.entries
        .where("[type+date]")
        .equals(["review", date])
        .first(),
    [date],
  );

  // Draft laden, wenn Tag wechselt oder Datensatz reinkommt.
  useEffect(() => {
    setForm(existing ? ({ ...EMPTY, ...(existing.meta as ReviewMeta) }) : EMPTY);
    setSaved(false);
  }, [date, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof ReviewMeta>(k: K, v: ReviewMeta[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function save() {
    const meta: ReviewMeta = {
      ...form,
      wins: form.wins.trim(),
      problems: form.problems.trim(),
      lessons: form.lessons.trim(),
      tomorrowPriority: form.tomorrowPriority.trim(),
    };
    if (existing) {
      await entriesRepo.update(existing.id, { meta });
    } else {
      // Upsert garantiert genau ein Review pro Datum.
      await entriesRepo.create({
        type: "review",
        date,
        title: `Review ${date}`,
        content: "",
        tags: [],
        meta,
      });
    }
    setSaved(true);
  }

  async function remove() {
    if (existing) await entriesRepo.remove(existing.id);
    setForm(EMPTY);
    setSaved(false);
  }

  function goDay(d: string) {
    setDate(d);
  }

  return (
    <div className="page review-page">
      <PageHeader icon="📝" title="Daily Review" />

      <div className="week-nav rv-nav">
        <button className="chip" onClick={() => goDay(addDaysIso(date, -1))}>
          ← Tag
        </button>
        <input
          className="task-select"
          type="date"
          value={date}
          onChange={(e) => goDay(e.target.value)}
        />
        <span className="week-label">
          {dayLabel(date)}
          {date === today && <span className="week-now"> · heute</span>}
        </span>
        <button className="chip" onClick={() => goDay(addDaysIso(date, 1))}>
          Tag →
        </button>
        {date !== today && (
          <button className="chip" onClick={() => goDay(today)}>
            heute
          </button>
        )}
        <span className={`rv-status ${existing ? "done" : "open"}`}>
          {existing ? "✓ ausgefüllt" : "offen"}
        </span>
      </div>

      <div className="rv-form">
        <label className="rv-field">
          <span>🏆 Wins</span>
          <textarea
            value={form.wins}
            onChange={(e) => set("wins", e.target.value)}
            placeholder="Was lief gut?"
          />
        </label>
        <label className="rv-field">
          <span>⚠️ Problems</span>
          <textarea
            value={form.problems}
            onChange={(e) => set("problems", e.target.value)}
            placeholder="Was lief schlecht / blockierte?"
          />
        </label>
        <label className="rv-field">
          <span>💡 Lessons</span>
          <textarea
            value={form.lessons}
            onChange={(e) => set("lessons", e.target.value)}
            placeholder="Was gelernt?"
          />
        </label>

        <div className="rv-sliders">
          {(
            [
              ["energy", "⚡ Energy"],
              ["focus", "🎯 Focus"],
              ["mood", "🙂 Mood"],
            ] as [keyof ReviewMeta, string][]
          ).map(([key, label]) => (
            <label key={key} className="rv-slider">
              <span>
                {label} <strong>{form[key] as number}</strong>/10
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={form[key] as number}
                onChange={(e) => set(key, Number(e.target.value) as never)}
              />
            </label>
          ))}
        </div>

        <label className="rv-field">
          <span>➡️ Tomorrow Priority</span>
          <input
            className="task-input full"
            value={form.tomorrowPriority}
            onChange={(e) => set("tomorrowPriority", e.target.value)}
            placeholder="Wichtigste Sache morgen"
          />
        </label>

        <div className="rv-actions">
          <button className="btn" onClick={save}>
            {saved ? "Gespeichert ✓" : existing ? "Aktualisieren" : "Speichern"}
          </button>
          {existing && (
            <button className="chip" onClick={remove}>
              Löschen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
