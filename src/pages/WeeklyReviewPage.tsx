import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { addDaysIso, isoWeekNumber, mondayOfIso, todayIso } from "../utils/date";
import { fmtUsd } from "../utils/trade";
import { fmtDuration, focusMeta } from "../utils/focus";
import PageHeader from "../components/PageHeader";
import type {
  Entry,
  HabitMeta,
  ReviewMeta,
  TaskMeta,
  TradeMeta,
  WeeklyReviewMeta,
} from "../types";
import { useI18n } from "../i18n";

const EMPTY: WeeklyReviewMeta = {
  wins: "",
  problems: "",
  lessons: "",
  improve: "",
  nextWeekFocus: "",
  score: 5,
  energy: 5,
  discipline: 5,
  movedGoalsProjects: "",
};

export default function WeeklyReviewPage() {
  const { tr } = useI18n();
  const today = todayIso();
  const [params] = useSearchParams();
  const [monday, setMonday] = useState(() =>
    mondayOfIso(params.get("week") || today),
  );
  useEffect(() => {
    const w = params.get("week");
    if (w) setMonday(mondayOfIso(w));
  }, [params]);
  const sunday = addDaysIso(monday, 6);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i)),
    [monday],
  );
  const weekNo = isoWeekNumber(monday);
  const isCurrent = monday === mondayOfIso(today);

  const [form, setForm] = useState<WeeklyReviewMeta>(EMPTY);
  const [saved, setSaved] = useState(false);

  const existing = useLiveQuery(
    () => db.entries.where("[type+date]").equals(["weeklyreview", monday]).first(),
    [monday],
  );

  // Einträge der Woche (Tasks/Trades/Daily-Reviews) + alle Habits.
  const range = useLiveQuery(
    () => db.entries.where("date").between(monday, sunday, true, true).toArray(),
    [monday, sunday],
    [] as Entry[],
  );
  const habits = useLiveQuery(
    () => db.entries.where("type").equals("habit").toArray(),
    [],
    [] as Entry[],
  );
  // Aktive Goals/Projects als Bezugspunkt im Review.
  const activeGP = useLiveQuery(
    async () => {
      const g = await db.entries.where("type").equals("goal").toArray();
      const p = await db.entries.where("type").equals("project").toArray();
      return [
        ...g.filter((x: Entry) => (x.meta as { status?: string }).status === "active"),
        ...p.filter((x: Entry) => (x.meta as { status?: string }).status === "active"),
      ];
    },
    [],
    [] as Entry[],
  );

  useEffect(() => {
    setForm(existing ? { ...EMPTY, ...(existing.meta as WeeklyReviewMeta) } : EMPTY);
    setSaved(false);
  }, [monday, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-Übersicht ----
  const summary = useMemo(() => {
    const tasks = range.filter((e) => e.type === "task");
    const tasksDone = tasks.filter((e) => (e.meta as TaskMeta).done).length;
    const tasksOpen = tasks.length - tasksDone;

    const trades = range.filter((e) => e.type === "trade");
    const pnl = trades.reduce((s, e) => s + ((e.meta as TradeMeta).pnl ?? 0), 0);

    const reviews = range.filter((e) => e.type === "review");
    const avg = (key: keyof ReviewMeta) =>
      reviews.length
        ? reviews.reduce((s, e) => s + ((e.meta as ReviewMeta)[key] as number), 0) /
          reviews.length
        : 0;

    // Habit-Completion: daily erwartet 7, weekly erwartet 1.
    const wd = new Set(weekDates);
    let done = 0;
    let expected = 0;
    for (const h of habits) {
      const m = h.meta as HabitMeta;
      const inWeek = (m.completedDates ?? []).filter((d) => wd.has(d));
      if (m.frequency === "weekly") {
        expected += 1;
        if (inWeek.length > 0) done += 1;
      } else {
        expected += 7;
        done += inWeek.length;
      }
    }
    const habitRate = expected ? Math.round((done / expected) * 100) : 0;

    const focus = range.filter((e) => e.type === "focus");
    const focusSec = focus.reduce((s, e) => s + focusMeta(e).actualSec, 0);
    const focusScore = focus.length
      ? focus.reduce((s, e) => s + focusMeta(e).focusScore, 0) / focus.length
      : 0;
    const focusEnergy = focus.length
      ? focus.reduce((s, e) => s + focusMeta(e).energyAfter, 0) / focus.length
      : 0;

    return {
      tasksDone,
      tasksOpen,
      tasksTotal: tasks.length,
      focusSec,
      focusCount: focus.length,
      focusScore,
      focusEnergy,
      trades: trades.length,
      pnl,
      reviews: reviews.length,
      energy: avg("energy"),
      focus: avg("focus"),
      mood: avg("mood"),
      habitDone: done,
      habitExpected: expected,
      habitRate,
    };
  }, [range, habits, weekDates]);

  function set<K extends keyof WeeklyReviewMeta>(k: K, v: WeeklyReviewMeta[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function save() {
    const meta: WeeklyReviewMeta = {
      ...form,
      wins: form.wins.trim(),
      problems: form.problems.trim(),
      lessons: form.lessons.trim(),
      improve: form.improve.trim(),
      nextWeekFocus: form.nextWeekFocus.trim(),
      movedGoalsProjects: form.movedGoalsProjects.trim(),
    };
    if (existing) {
      await entriesRepo.update(existing.id, { meta });
    } else {
      await entriesRepo.create({
        type: "weeklyreview",
        date: monday, // Anker = Montag der KW → ein Review/Woche
        title: `Weekly Review KW ${weekNo}`,
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

  const fmt1 = (n: number) => (n ? n.toFixed(1) : "–");

  return (
    <div className="page review-page">
      <PageHeader
        icon="weekly-review"
        title="Weekly Review"
        subtitle={tr("Fortschritt verstehen, die Woche abschließen und den nächsten Fokus setzen.", "Understand progress, close the week and set the next focus.")}
      />

      <div className="week-nav rv-nav">
        <button className="chip" onClick={() => setMonday(addDaysIso(monday, -7))}>
          ← {tr("Woche", "Week")}
        </button>
        <span className="week-label">
          {tr("KW", "Week")} {weekNo}
          {isCurrent && <span className="week-now"> · {tr("aktuell", "current")}</span>}
        </span>
        <button className="chip" onClick={() => setMonday(addDaysIso(monday, 7))}>
          {tr("Woche", "Week")} →
        </button>
        {!isCurrent && (
          <button className="chip" onClick={() => setMonday(mondayOfIso(today))}>
            {tr("aktuelle", "current")}
          </button>
        )}
        <span className="rv-range">
          {monday.slice(5)} – {sunday.slice(5)}
        </span>
        <span className={`rv-status ${existing ? "done" : "open"}`}>
          {existing ? tr("✓ ausgefüllt", "✓ completed") : tr("offen", "open")}
        </span>
      </div>

      {/* Auto-Übersicht */}
      <div className="review-section-head review-summary-head">
        <span className="eyebrow">{tr("Automatische Übersicht", "Automatic overview")}</span>
        <h2>{tr("Diese Woche in Zahlen", "This week in numbers")}</h2>
      </div>
      <div className="wr-summary">
        <div className="wr-stat">
          <span className="wr-label">{tr("Tasks erledigt", "Tasks completed")}</span>
          <span className="wr-val">
            {summary.tasksDone}
            <span className="wr-sub">/{summary.tasksTotal}</span>
          </span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">{tr("Tasks offen", "Tasks open")}</span>
          <span className="wr-val">{summary.tasksOpen}</span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">Habit Completion</span>
          <span className="wr-val">
            {summary.habitRate}%
            <span className="wr-sub">
              {summary.habitDone}/{summary.habitExpected}
            </span>
          </span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">{tr("Fokuszeit", "Focus time")}</span>
          <span className="wr-val">{fmtDuration(summary.focusSec)}</span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">Focus Sessions</span>
          <span className="wr-val">{summary.focusCount}</span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">{tr("Ø Fokus-Score", "Avg. focus score")}</span>
          <span className="wr-val">{fmt1(summary.focusScore)}</span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">{tr("Ø Energie danach", "Avg. energy after")}</span>
          <span className="wr-val">{fmt1(summary.focusEnergy)}</span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">Trades</span>
          <span className="wr-val">{summary.trades}</span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">Trading PnL</span>
          <span className={`wr-val ${summary.pnl >= 0 ? "pos" : "neg"}`}>
            {fmtUsd(summary.pnl)}
          </span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">Daily Reviews</span>
          <span className="wr-val">
            {summary.reviews}
            <span className="wr-sub">/7</span>
          </span>
        </div>
        <div className="wr-stat">
          <span className="wr-label">Ø E / F / M</span>
          <span className="wr-val wr-efm">
            {fmt1(summary.energy)} / {fmt1(summary.focus)} / {fmt1(summary.mood)}
          </span>
        </div>
      </div>

      {/* Formular */}
      <div className="rv-form weekly-review-form">
        <section className="review-section">
          <div className="review-section-head">
            <span className="eyebrow">{tr("Rückblick", "Reflection")}</span>
            <h2>{tr("Erfolge, Probleme und Erkenntnisse", "Wins, problems and lessons")}</h2>
          </div>
          <div className="review-writing-grid">
        <label className="rv-field">
          <span>🏆 Top 3 Wins</span>
          <textarea value={form.wins} onChange={(e) => set("wins", e.target.value)} />
        </label>
        <label className="rv-field">
          <span>⚠️ Top 3 Problems</span>
          <textarea
            value={form.problems}
            onChange={(e) => set("problems", e.target.value)}
          />
        </label>
        <label className="rv-field">
          <span>💡 Lessons learned</span>
          <textarea
            value={form.lessons}
            onChange={(e) => set("lessons", e.target.value)}
          />
        </label>
          </div>
        </section>

        <section className="review-section review-planning-section">
          <div className="review-section-head">
            <span className="eyebrow">{tr("Nächste Woche", "Next week")}</span>
            <h2>{tr("Verbesserung und Ausrichtung", "Improvement and direction")}</h2>
          </div>
          <div className="review-planning-grid">
        <label className="rv-field">
          <span>🔧 What to improve next week</span>
          <textarea
            value={form.improve}
            onChange={(e) => set("improve", e.target.value)}
          />
        </label>
        <label className="rv-field">
          <span>🎯 {tr("Welche Goals/Projects diese Woche bewegt?", "Which goals/projects moved this week?")}</span>
          {activeGP.length > 0 && (
            <div className="wr-ref">
              {activeGP.map((x) => (
                <span key={x.id} className="link-tag">
                  {x.type === "goal" ? "🎯" : "📂"} {x.title}
                </span>
              ))}
            </div>
          )}
          <textarea
            value={form.movedGoalsProjects}
            onChange={(e) => set("movedGoalsProjects", e.target.value)}
            placeholder={tr("Fortschritt an Zielen/Projekten…", "Progress on goals/projects…")}
          />
        </label>
        <label className="rv-field next-week-focus-field">
          <span>➡️ Next Week Focus</span>
          <textarea
            value={form.nextWeekFocus}
            onChange={(e) => set("nextWeekFocus", e.target.value)}
          />
        </label>
          </div>
        </section>

        <section className="review-section review-score-section">
          <div className="review-section-head">
            <span className="eyebrow">{tr("Wochengefühl", "Week signals")}</span>
            <h2>{tr("Score, Energie und Disziplin", "Score, energy and discipline")}</h2>
          </div>
          <div className="rv-sliders">
          {(
            [
              ["score", tr("⭐ Wochen-Score", "⭐ Weekly score")],
              ["energy", tr("⚡ Energie Ø", "⚡ Avg. energy")],
              ["discipline", tr("🛡️ Disziplin", "🛡️ Discipline")],
            ] as [keyof WeeklyReviewMeta, string][]
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
        </section>

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
