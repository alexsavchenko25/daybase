import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { addDaysIso, todayIso } from "../utils/date";
import PageHeader from "../components/PageHeader";
import type { ReviewMeta } from "../types";
import { useI18n } from "../i18n";

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
  const { locale, tr } = useI18n();
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
          ← {tr("Tag", "Day")}
        </button>
        <input
          className="task-select"
          type="date"
          value={date}
          onChange={(e) => goDay(e.target.value)}
        />
        <span className="week-label">
          {new Date(date + "T00:00:00").toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
          {date === today && <span className="week-now"> · {tr("heute", "today")}</span>}
        </span>
        <button className="chip" onClick={() => goDay(addDaysIso(date, 1))}>
          {tr("Tag", "Day")} →
        </button>
        {date !== today && (
          <button className="chip" onClick={() => goDay(today)}>
            {tr("heute", "today")}
          </button>
        )}
        <span className={`rv-status ${existing ? "done" : "open"}`}>
          {existing ? tr("✓ ausgefüllt", "✓ completed") : tr("offen", "open")}
        </span>
      </div>

      <div className="rv-form">
        <label className="rv-field">
          <span>🏆 Wins</span>
          <textarea
            value={form.wins}
            onChange={(e) => set("wins", e.target.value)}
            placeholder={tr("Was lief gut?", "What went well?")}
          />
        </label>
        <label className="rv-field">
          <span>⚠️ Problems</span>
          <textarea
            value={form.problems}
            onChange={(e) => set("problems", e.target.value)}
            placeholder={tr("Was lief schlecht / blockierte?", "What went poorly or blocked you?")}
          />
        </label>
        <label className="rv-field">
          <span>💡 Lessons</span>
          <textarea
            value={form.lessons}
            onChange={(e) => set("lessons", e.target.value)}
            placeholder={tr("Was gelernt?", "What did you learn?")}
          />
        </label>

        <div className="rv-sliders">
          {(
            [
              ["energy", tr("⚡ Energie", "⚡ Energy")],
              ["focus", tr("🎯 Fokus", "🎯 Focus")],
              ["mood", tr("🙂 Stimmung", "🙂 Mood")],
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
          <span>➡️ {tr("Priorität für morgen", "Tomorrow priority")}</span>
          <input
            className="task-input full"
            value={form.tomorrowPriority}
            onChange={(e) => set("tomorrowPriority", e.target.value)}
            placeholder={tr("Wichtigste Sache morgen", "Most important thing tomorrow")}
          />
        </label>

        <div className="rv-actions">
          <button className="btn" onClick={save}>
            {saved ? tr("Gespeichert ✓", "Saved ✓") : existing ? tr("Aktualisieren", "Update") : tr("Speichern", "Save")}
          </button>
          {existing && (
            <button className="chip" onClick={remove}>
              {tr("Löschen", "Delete")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
