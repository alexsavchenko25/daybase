import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { addMonthsIso, todayIso } from "../utils/date";
import { WEEKDAY_LABELS } from "../utils/recurrence";
import {
  computeDayStats,
  dayScore,
  daysInMonth,
  groupByDate,
  intensityLevel,
  monthGridCells,
  type DayStats,
} from "../utils/consistency";
import PageHeader from "../components/PageHeader";
import { useI18n } from "../i18n";
import type { Entry } from "../types";

const WEEKDAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EMPTY_DATA = {
  tasksByDate: new Map<string, Entry[]>(),
  focusByDate: new Map<string, Entry[]>(),
  reviewDates: new Set<string>(),
  journalDates: new Set<string>(),
  habits: [] as Entry[],
  trackReview: false,
  trackJournal: false,
};

export default function ConsistencyPage() {
  const { language, locale, tr } = useI18n();
  const today = todayIso();
  const weekdayLabels = language === "de" ? WEEKDAY_LABELS : WEEKDAY_LABELS_EN;

  const [monthStart, setMonthStart] = useState(() => `${today.slice(0, 7)}-01`);
  const isCurrentMonth = monthStart === `${today.slice(0, 7)}-01`;

  const days = useMemo(() => daysInMonth(monthStart), [monthStart]);
  const monthEnd = days[days.length - 1];
  const cells = useMemo(() => monthGridCells(monthStart), [monthStart]);

  // Monatsbegrenzte, indexierte Abfragen für Tasks/Focus/Review/Journal
  // ([type+date]-Index). Habits ungefiltert (klein, completedDates nicht
  // date-indexierbar). trackReview/trackJournal prüfen einmalig über die
  // GESAMTE Historie, ob der Nutzer diese Module überhaupt nutzt — unabhängig
  // vom angezeigten Monat (siehe dayScore in utils/consistency.ts).
  const data = useLiveQuery(
    async () => {
      const [tasks, focusEntries, reviews, journals, habits, anyReview, anyJournal] = await Promise.all([
        entriesRepo.queryByTypeAndDateRange("task", monthStart, monthEnd),
        entriesRepo.queryByTypeAndDateRange("focus", monthStart, monthEnd),
        entriesRepo.queryByTypeAndDateRange("review", monthStart, monthEnd),
        entriesRepo.queryByTypeAndDateRange("journal", monthStart, monthEnd),
        db.entries.where("type").equals("habit").toArray(),
        db.entries.where("type").equals("review").first(),
        db.entries.where("type").equals("journal").first(),
      ]);
      return {
        tasksByDate: groupByDate(tasks),
        focusByDate: groupByDate(focusEntries),
        reviewDates: new Set(reviews.map((r) => r.date)),
        journalDates: new Set(journals.map((j) => j.date)),
        habits,
        trackReview: !!anyReview,
        trackJournal: !!anyJournal,
      };
    },
    [monthStart, monthEnd],
    EMPTY_DATA,
  );

  const statsByDate = useMemo(() => {
    const map = new Map<string, DayStats>();
    for (const d of days) {
      map.set(
        d,
        computeDayStats(d, data.tasksByDate, data.habits, data.focusByDate, data.reviewDates, data.journalDates),
      );
    }
    return map;
  }, [days, data]);

  function dayLabel(day: string, stats: DayStats): string {
    const habitPct = stats.habitTotal > 0 ? Math.round((stats.habitDone / stats.habitTotal) * 100) : null;
    const dateLabel = new Date(day + "T00:00:00").toLocaleDateString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
    const items =
      language === "de"
        ? [
            `${stats.tasksDone}/${stats.tasksTotal} Tasks erledigt`,
            habitPct !== null ? `Habits ${habitPct}%` : null,
            stats.focusSessions > 0 ? `${stats.focusMin} Min Fokus` : null,
            `Review ${stats.reviewExists ? "✓" : "–"}`,
            `Journal ${stats.journalExists ? "✓" : "–"}`,
          ]
        : [
            `${stats.tasksDone}/${stats.tasksTotal} tasks done`,
            habitPct !== null ? `habits ${habitPct}%` : null,
            stats.focusSessions > 0 ? `${stats.focusMin} min focus` : null,
            `review ${stats.reviewExists ? "yes" : "no"}`,
            `journal ${stats.journalExists ? "yes" : "no"}`,
          ];
    const parts = items.filter((p): p is string => p !== null).join(" · ");
    return `${dateLabel}: ${parts}`;
  }

  const monthLabel = new Date(monthStart + "T00:00:00").toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="page consistency-page">
      <PageHeader
        icon="📆"
        title={tr("Konsistenz-Kalender", "Consistency Calendar")}
        subtitle={tr(
          "Tasks, Habits, Fokus, Review & Journal auf einen Blick.",
          "Tasks, habits, focus, review & journal at a glance.",
        )}
        actions={
          <div className="week-nav">
            <button className="chip" onClick={() => setMonthStart((m) => addMonthsIso(m, -1))}>
              ← {tr("Monat", "Month")}
            </button>
            <span className="week-label">{monthLabel}</span>
            <button className="chip" onClick={() => setMonthStart((m) => addMonthsIso(m, 1))}>
              {tr("Monat", "Month")} →
            </button>
            {!isCurrentMonth && (
              <button className="chip" onClick={() => setMonthStart(`${today.slice(0, 7)}-01`)}>
                {tr("aktueller Monat", "current month")}
              </button>
            )}
          </div>
        }
      />

      <div className="consistency-grid">
        {weekdayLabels.map((w) => (
          <div key={w} className="consistency-weekday">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`pad-${i}`} className="consistency-cell pad" aria-hidden="true" />;

          const stats = statsByDate.get(day);
          if (!stats) return <div key={day} className="consistency-cell pad" aria-hidden="true" />;

          const isFuture = day > today;
          const isToday = day === today;
          const score = dayScore(stats, isFuture, data.trackReview, data.trackJournal);
          const level = intensityLevel(score);
          const habitPct = stats.habitTotal > 0 ? Math.round((stats.habitDone / stats.habitTotal) * 100) : null;
          const label = dayLabel(day, stats);

          return (
            <Link
              key={day}
              to={`/tasks?date=${day}`}
              className={`consistency-cell level-${level} ${isToday ? "is-today" : ""} ${isFuture ? "is-future" : ""}`}
              title={label}
              aria-label={label}
            >
              <span className="cc-daynum">{Number(day.slice(8, 10))}</span>
              {!isFuture && (
                <span className="cc-glyphs">
                  {stats.tasksTotal > 0 && (
                    <span className="cc-glyph">
                      {stats.tasksDone}/{stats.tasksTotal}
                    </span>
                  )}
                  {habitPct !== null && <span className="cc-glyph">{habitPct}%</span>}
                  {stats.focusSessions > 0 && <span className="cc-glyph">{stats.focusMin}m</span>}
                  {stats.reviewExists && <span className="cc-glyph cc-icon">📝</span>}
                  {stats.journalExists && <span className="cc-glyph cc-icon">📓</span>}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="consistency-legend">
        <span className="muted">{tr("Weniger", "Less")}</span>
        {[-1, 0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`consistency-swatch level-${l}`} />
        ))}
        <span className="muted">{tr("Mehr", "More")}</span>
        <span className="consistency-legend-sep" />
        <span className="muted">
          {tr(
            "Klick auf einen Tag öffnet die Tagesansicht in Tasks. 📝 Review · 📓 Journal vorhanden.",
            "Click a day to open its day view in Tasks. 📝 Review · 📓 Journal present.",
          )}
        </span>
      </div>
    </div>
  );
}
