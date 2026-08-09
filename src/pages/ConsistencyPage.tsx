import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { addMonthsIso, todayIso } from "../utils/date";
import { WEEKDAY_LABELS } from "../utils/recurrence";
import {
  computeDayStats,
  defaultConsistencyDay,
  dayScore,
  daysInMonth,
  groupByDate,
  hasDayActivity,
  intensityLevel,
  monthGridCells,
  summarizeConsistencyMonth,
  type DayStats,
} from "../utils/consistency";
import { fmtDuration } from "../utils/focus";
import PageHeader from "../components/PageHeader";
import ProgressBar from "../components/ProgressBar";
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const isCurrentMonth = monthStart === `${today.slice(0, 7)}-01`;

  const days = useMemo(() => daysInMonth(monthStart), [monthStart]);
  const monthEnd = days[days.length - 1];
  const cells = useMemo(() => monthGridCells(monthStart), [monthStart]);

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
        reviewDates: new Set(reviews.map((review) => review.date)),
        journalDates: new Set(journals.map((journal) => journal.date)),
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
    for (const day of days) {
      map.set(
        day,
        computeDayStats(
          day,
          data.tasksByDate,
          data.habits,
          data.focusByDate,
          data.reviewDates,
          data.journalDates,
        ),
      );
    }
    return map;
  }, [days, data]);

  const monthStats = useMemo(
    () => days.map((day) => statsByDate.get(day)).filter((stats): stats is DayStats => !!stats),
    [days, statsByDate],
  );
  const summary = useMemo(
    () => summarizeConsistencyMonth(monthStats, today, data.trackReview, data.trackJournal),
    [monthStats, today, data.trackReview, data.trackJournal],
  );
  const elapsedDays = days.filter((day) => day <= today).length;

  useEffect(() => {
    setSelectedDay((current) =>
      current?.startsWith(monthStart.slice(0, 7))
        ? current
        : defaultConsistencyDay(monthStats, today),
    );
  }, [monthStart, monthStats, today]);

  const selectedStats = selectedDay ? statsByDate.get(selectedDay) ?? null : null;
  const selectedScore = selectedStats
    ? dayScore(selectedStats, false, data.trackReview, data.trackJournal)
    : null;

  function dayLabel(day: string, stats: DayStats, score: number | null): string {
    const habitPct = stats.habitTotal > 0 ? Math.round((stats.habitDone / stats.habitTotal) * 100) : null;
    const dateLabel = new Date(`${day}T00:00:00`).toLocaleDateString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
    const items =
      language === "de"
        ? [
            score === null ? "Keine Bewertung" : `Konsistenz ${Math.round(score * 100)}%`,
            `${stats.tasksDone}/${stats.tasksTotal} Tasks erledigt`,
            habitPct !== null ? `Habits ${habitPct}%` : null,
            stats.focusSessions > 0 ? `${stats.focusMin} Min Fokus` : null,
            `Review ${stats.reviewExists ? "✓" : "–"}`,
            `Journal ${stats.journalExists ? "✓" : "–"}`,
          ]
        : [
            score === null ? "No score" : `consistency ${Math.round(score * 100)}%`,
            `${stats.tasksDone}/${stats.tasksTotal} tasks done`,
            habitPct !== null ? `habits ${habitPct}%` : null,
            stats.focusSessions > 0 ? `${stats.focusMin} min focus` : null,
            `review ${stats.reviewExists ? "yes" : "no"}`,
            `journal ${stats.journalExists ? "yes" : "no"}`,
          ];
    return `${dateLabel}: ${items.filter((item): item is string => item !== null).join(" · ")}`;
  }

  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  const selectedDateLabel = selectedDay
    ? new Date(`${selectedDay}T00:00:00`).toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const selectedTaskPct = selectedStats?.tasksTotal
    ? Math.round((selectedStats.tasksDone / selectedStats.tasksTotal) * 100)
    : 0;
  const selectedHabitPct = selectedStats?.habitTotal
    ? Math.round((selectedStats.habitDone / selectedStats.habitTotal) * 100)
    : 0;

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
            <button className="chip" onClick={() => setMonthStart((month) => addMonthsIso(month, -1))}>
              ← {tr("Monat", "Month")}
            </button>
            <span className="week-label">{monthLabel}</span>
            <button className="chip" onClick={() => setMonthStart((month) => addMonthsIso(month, 1))}>
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

      <section className="consistency-summary" aria-label={tr("Monatsübersicht", "Monthly overview")}>
        <div className="kpi-card consistency-kpi is-primary">
          <div className="consistency-kpi-head">
            <span className="kpi-label">{tr("Konsistenz", "Consistency")}</span>
            <span aria-hidden="true">%</span>
          </div>
          <strong className="kpi-value">
            {summary.averageScore === null ? "–" : `${summary.averageScore}%`}
          </strong>
          <span className="consistency-kpi-sub">
            {summary.averageScore === null
              ? tr("Noch keine Bewertung", "No score yet")
              : tr("Durchschnitt im Monat", "Monthly average")}
          </span>
          <ProgressBar value={summary.averageScore ?? 0} />
        </div>
        <div className="kpi-card consistency-kpi">
          <div className="consistency-kpi-head">
            <span className="kpi-label">{tr("Aktive Tage", "Active days")}</span>
            <span aria-hidden="true">●</span>
          </div>
          <strong className="kpi-value">{summary.activeDays}</strong>
          <span className="consistency-kpi-sub">
            {tr(`von ${elapsedDays} vergangenen Tagen`, `of ${elapsedDays} elapsed days`)}
          </span>
        </div>
        <div className="kpi-card consistency-kpi">
          <div className="consistency-kpi-head">
            <span className="kpi-label">{tr("Beste Serie", "Best streak")}</span>
            <span aria-hidden="true">↗</span>
          </div>
          <strong className="kpi-value">{summary.bestStreak}</strong>
          <span className="consistency-kpi-sub">
            {summary.bestStreak === 1 ? tr("aktiver Tag", "active day") : tr("aktive Tage", "active days")}
          </span>
        </div>
        <div className="kpi-card consistency-kpi">
          <div className="consistency-kpi-head">
            <span className="kpi-label">{tr("Fokuszeit", "Focus time")}</span>
            <span aria-hidden="true">◷</span>
          </div>
          <strong className="kpi-value">{fmtDuration(summary.focusMin * 60)}</strong>
          <span className="consistency-kpi-sub">{tr("in diesem Monat", "this month")}</span>
        </div>
      </section>

      <section className="dash-info consistency-calendar-card" aria-labelledby="consistency-month-title">
        <div className="consistency-card-head">
          <div>
            <span id="consistency-month-title" className="dash-label">
              {tr("Monatsmuster", "Monthly pattern")}
            </span>
            <p className="muted">
              {tr("Wähle einen Tag für die vollständige Aufschlüsselung.", "Select a day for the full breakdown.")}
            </p>
          </div>
          <span className="consistency-month-chip">{monthLabel}</span>
        </div>

        <div className="consistency-grid">
          {weekdayLabels.map((weekday) => (
            <div key={weekday} className="consistency-weekday">
              {weekday}
            </div>
          ))}
          {cells.map((day, index) => {
            if (!day) return <div key={`pad-${index}`} className="consistency-cell pad" aria-hidden="true" />;

            const stats = statsByDate.get(day);
            if (!stats) return <div key={day} className="consistency-cell pad" aria-hidden="true" />;

            const isFuture = day > today;
            const isToday = day === today;
            const isSelected = day === selectedDay;
            const score = dayScore(stats, isFuture, data.trackReview, data.trackJournal);
            const level = intensityLevel(score);
            const habitPct = stats.habitTotal > 0 ? Math.round((stats.habitDone / stats.habitTotal) * 100) : null;
            const label = dayLabel(day, stats, score);

            return (
              <button
                key={day}
                type="button"
                disabled={isFuture}
                className={`consistency-cell level-${level} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""} ${isFuture ? "is-future" : ""} ${hasDayActivity(stats) ? "has-activity" : ""}`}
                title={label}
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => setSelectedDay(day)}
              >
                <span className="cc-cell-head">
                  <span className="cc-daynum">{Number(day.slice(8, 10))}</span>
                  {!isFuture && score !== null && (
                    <span className="cc-score">{Math.round(score * 100)}%</span>
                  )}
                </span>
                {!isFuture && (
                  <>
                    <span className="cc-glyphs" aria-hidden="true">
                      {stats.tasksTotal > 0 && (
                        <span className="cc-glyph">✓ {stats.tasksDone}/{stats.tasksTotal}</span>
                      )}
                      {habitPct !== null && <span className="cc-glyph">↻ {habitPct}%</span>}
                      {stats.focusSessions > 0 && <span className="cc-glyph">◷ {stats.focusMin}m</span>}
                    </span>
                    {(stats.reviewExists || stats.journalExists) && (
                      <span className="cc-dots" aria-hidden="true">
                        {stats.reviewExists && <span className="cc-dot cc-dot-review" />}
                        {stats.journalExists && <span className="cc-dot cc-dot-journal" />}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="consistency-legend" aria-label={tr("Kalenderlegende", "Calendar legend")}>
          <span className="muted">{tr("Keine Daten", "No data")}</span>
          <span className="consistency-swatch level--1" aria-hidden="true" />
          <span className="consistency-legend-sep" />
          <span className="muted">{tr("Niedrig", "Low")}</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={`consistency-swatch level-${level}`} aria-hidden="true" />
          ))}
          <span className="muted">{tr("Stark", "Strong")}</span>
          <span className="consistency-legend-sep" />
          <span className="cc-leg"><span className="cc-dot cc-dot-review" /> Review</span>
          <span className="cc-leg"><span className="cc-dot cc-dot-journal" /> Journal</span>
          <span className="consistency-legend-sep" />
          <span className="cc-leg"><span className="consistency-marker is-today" />{tr("Heute", "Today")}</span>
          <span className="cc-leg"><span className="consistency-marker is-selected" />{tr("Ausgewählt", "Selected")}</span>
        </div>
      </section>

      {selectedDay && selectedStats && (
        <section className="dash-info consistency-detail" aria-labelledby="consistency-detail-title">
          <div className="consistency-detail-head">
            <div>
              <span className="dash-label">{tr("Tagesdetails", "Day details")}</span>
              <h2 id="consistency-detail-title">{selectedDateLabel}</h2>
            </div>
            <span className="consistency-score-chip">
              {selectedScore === null
                ? tr("Keine Bewertung", "No score")
                : tr(`${Math.round(selectedScore * 100)}% Konsistenz`, `${Math.round(selectedScore * 100)}% consistency`)}
            </span>
          </div>

          <div className="consistency-detail-grid">
            <div className="consistency-detail-metric">
              <span className="consistency-detail-label">Tasks</span>
              <strong>{selectedStats.tasksDone}/{selectedStats.tasksTotal}</strong>
              <ProgressBar value={selectedTaskPct} />
              <small>{tr("erledigt", "completed")}</small>
            </div>
            <div className="consistency-detail-metric">
              <span className="consistency-detail-label">Habits</span>
              <strong>{selectedStats.habitDone}/{selectedStats.habitTotal}</strong>
              <ProgressBar value={selectedHabitPct} />
              <small>{tr("erledigt", "completed")}</small>
            </div>
            <div className="consistency-detail-metric">
              <span className="consistency-detail-label">{tr("Fokus", "Focus")}</span>
              <strong>{fmtDuration(selectedStats.focusMin * 60)}</strong>
              <small>
                {selectedStats.focusSessions === 1
                  ? tr("1 Session", "1 session")
                  : tr(`${selectedStats.focusSessions} Sessions`, `${selectedStats.focusSessions} sessions`)}
              </small>
            </div>
            <div className="consistency-detail-metric is-binary">
              <span className="consistency-detail-label">Review</span>
              <strong className={selectedStats.reviewExists ? "is-done" : ""}>
                {selectedStats.reviewExists ? tr("Erfasst", "Logged") : tr("Offen", "Not logged")}
              </strong>
              <small>{tr("Daily Review", "Daily review")}</small>
            </div>
            <div className="consistency-detail-metric is-binary">
              <span className="consistency-detail-label">Journal</span>
              <strong className={selectedStats.journalExists ? "is-done" : ""}>
                {selectedStats.journalExists ? tr("Erfasst", "Logged") : tr("Offen", "Not logged")}
              </strong>
              <small>{tr("Tagebucheintrag", "Journal entry")}</small>
            </div>
          </div>

          <div className="consistency-detail-actions">
            <Link className="btn sm" to={`/tasks?date=${selectedDay}`}>
              {tr("Tasks dieses Tages öffnen", "Open this day's tasks")} →
            </Link>
            <Link className="chip sm" to={`/review?date=${selectedDay}`}>
              {tr("Daily Review öffnen", "Open daily review")} →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
