import { useEffect, useMemo, useRef, useState } from "react";
import {
  HABIT_HEATMAP_PERIOD_KEY,
  HABIT_HEATMAP_PERIODS,
  buildHabitHeatmap,
  normalizeHabitHeatmapPeriod,
  type HabitHeatmapPeriod,
  type HabitHeatmapRow,
  type HabitHeatmapState,
} from "../utils/habitHeatmap";
import { dayIndex, isoWeekNumber } from "../utils/date";
import { useI18n } from "../i18n";
import ProgressBar from "./ProgressBar";
import type { Entry } from "../types";

const DAY_LABELS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function stateLabel(state: HabitHeatmapState, language: "de" | "en"): string {
  const labels = {
    completed: language === "de" ? "Erledigt" : "Completed",
    open: language === "de" ? "Offen" : "Open",
    missed: language === "de" ? "Nicht erledigt" : "Missed",
    notApplicable: language === "de" ? "Noch nicht aktiv" : "Not active yet",
  } satisfies Record<HabitHeatmapState, string>;
  return labels[state];
}

function Cell({
  state,
  current,
  label,
  weekly = false,
  separator = false,
}: {
  state: HabitHeatmapState;
  current: boolean;
  label: string;
  weekly?: boolean;
  separator?: boolean;
}) {
  return (
    <td
      className={`hh-data-cell ${weekly ? "is-weekly" : ""} ${separator ? "is-separator" : ""}`}
      aria-label={label}
      title={label}
    >
      <span
        className={`hh-cell state-${state} ${current ? "is-current" : ""}`}
        aria-hidden="true"
      />
    </td>
  );
}

function RowLabel({ row, language }: { row: HabitHeatmapRow; language: "de" | "en" }) {
  const hasEligible = row.eligibleCount > 0;
  const percentage = hasEligible ? `${row.completionRate}%` : "–";
  const count = `${row.completedCount}/${row.eligibleCount}`;
  const ariaLabel = language === "de"
    ? `${row.title}, ${percentage}, ${row.completedCount} von ${row.eligibleCount} erledigt`
    : `${row.title}, ${percentage}, ${row.completedCount} of ${row.eligibleCount} completed`;

  return (
    <th scope="row" className="hh-row-label" title={ariaLabel} aria-label={ariaLabel}>
      <div className="hh-row-title-line">
        <span className="hh-row-name">{row.title}</span>
        <strong>{percentage}</strong>
      </div>
      <div className="hh-row-progress">
        <ProgressBar value={row.completionRate} />
        <span>{count}</span>
      </div>
    </th>
  );
}

export default function HabitHeatmap({ habits, today }: { habits: Entry[]; today: string }) {
  const { language, locale, tr } = useI18n();
  const [period, setPeriod] = useState<HabitHeatmapPeriod>(() =>
    normalizeHabitHeatmapPeriod(localStorage.getItem(HABIT_HEATMAP_PERIOD_KEY)),
  );
  const data = useMemo(() => buildHabitHeatmap(habits, today, period), [habits, today, period]);
  const dailyScrollRef = useRef<HTMLDivElement>(null);
  const weeklyScrollRef = useRef<HTMLDivElement>(null);
  const dayLabels = language === "de" ? DAY_LABELS_DE : DAY_LABELS_EN;

  useEffect(() => {
    const scrollers = [dailyScrollRef.current, weeklyScrollRef.current].filter(
      (scroller): scroller is HTMLDivElement => !!scroller,
    );
    if (!scrollers.length) return;

    const scrollToLatest = () => {
      scrollers.forEach((scroller) => {
        scroller.scrollLeft = scroller.scrollWidth;
      });
    };
    scrollToLatest();

    const observer = new ResizeObserver(scrollToLatest);
    scrollers.forEach((scroller) => observer.observe(scroller));
    return () => observer.disconnect();
  }, [period, data.dates[data.dates.length - 1], data.dailyRows.length, data.weeklyRows.length]);

  function selectPeriod(next: HabitHeatmapPeriod) {
    setPeriod(next);
    localStorage.setItem(HABIT_HEATMAP_PERIOD_KEY, String(next));
  }

  const formatDate = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const formatMonth = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
      month: "short",
      year: "2-digit",
    });

  const periodText = tr(`${period} Tage`, `${period} days`);

  return (
    <section className={`dash-info habit-history period-${period}`} aria-labelledby="habit-history-title">
      <div className="habit-history-head">
        <div>
          <h2 id="habit-history-title">{tr("Verlauf", "History")}</h2>
          <p className="muted">
            {tr(
              `Deine Habit-Check-ins der letzten ${period} Tage.`,
              `Your habit check-ins from the last ${period} days.`,
            )}
          </p>
        </div>
        <div
          className="habit-period-switch"
          role="group"
          aria-label={tr("Zeitraum auswählen", "Choose time range")}
        >
          {HABIT_HEATMAP_PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip sm ${period === value ? "chip-active" : ""}`}
              aria-pressed={period === value}
              onClick={() => selectPeriod(value)}
            >
              {tr(`${value} Tage`, `${value} days`)}
            </button>
          ))}
        </div>
      </div>

      {data.dailyRows.length > 0 && (
        <div className="habit-heatmap-group">
          <div className="habit-heatmap-group-head">
            <span className="dash-label">{tr("Tägliche Habits", "Daily habits")}</span>
            <span className="section-count">{data.dailyRows.length}</span>
          </div>
          <div className="habit-heatmap-scroll" ref={dailyScrollRef}>
            <table className="habit-heatmap-table">
              <caption>
                {tr(
                  `Tägliche Habit-Check-ins der letzten ${period} Tage`,
                  `Daily habit check-ins for the last ${period} days`,
                )}
              </caption>
              <thead>
                <tr className="hh-month-row">
                  <th scope="col" className="hh-corner hh-month-corner">{tr("Zeitraum", "Period")}</th>
                  {data.months.map((month) => (
                    <th
                      key={month.key}
                      scope="colgroup"
                      colSpan={month.columnCount}
                      className="hh-month"
                    >
                      {formatMonth(month.start)}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th scope="col" className="hh-corner">Habit</th>
                  {data.dates.map((date) => {
                    const weekday = dayIndex(date);
                    const isToday = date === today;
                    const isMonthStart = date.endsWith("-01");
                    return (
                      <th
                        key={date}
                        scope="col"
                        className={`hh-date ${weekday === 0 ? "is-week-start" : ""} ${isMonthStart ? "is-month-start" : ""} ${isToday ? "is-current" : ""}`}
                        title={formatDate(date)}
                        aria-label={formatDate(date)}
                      >
                        <span>{Number(date.slice(8))}</span>
                        <small>{dayLabels[weekday].slice(0, 1)}</small>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.dailyRows.map((row) => (
                  <tr key={row.habitId}>
                    <RowLabel row={row} language={language} />
                    {row.cells.map((cell) => {
                      const label = `${row.title}, ${formatDate(cell.key)}: ${stateLabel(cell.state, language)}`;
                      const separator = dayIndex(cell.key) === 0 || cell.key.endsWith("-01");
                      return (
                        <Cell
                          key={cell.key}
                          state={cell.state}
                          current={cell.isCurrent}
                          label={label}
                          separator={separator}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.weeklyRows.length > 0 && (
        <div className="habit-heatmap-group">
          <div className="habit-heatmap-group-head">
            <span className="dash-label">{tr("Wöchentliche Habits", "Weekly habits")}</span>
            <span className="section-count">{data.weeklyRows.length}</span>
          </div>
          <div className="habit-heatmap-scroll weekly" ref={weeklyScrollRef}>
            <table className="habit-heatmap-table weekly">
              <caption>
                {tr(
                  `Wöchentliche Habit-Check-ins der letzten ${period} Tage`,
                  `Weekly habit check-ins for the last ${period} days`,
                )}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="hh-corner">Habit</th>
                  {data.weeks.map((week) => {
                    const range = `${week.start.slice(8, 10)}.${week.start.slice(5, 7)}.–${week.end.slice(8, 10)}.${week.end.slice(5, 7)}.`;
                    const label = `${tr("KW", "Week")} ${isoWeekNumber(week.start)}, ${range}`;
                    return (
                      <th
                        key={week.key}
                        scope="col"
                        className={`hh-week ${week.isCurrent ? "is-current" : ""}`}
                        title={label}
                        aria-label={label}
                      >
                        <span>{tr("KW", "W")} {isoWeekNumber(week.start)}</span>
                        <small>{range}</small>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.weeklyRows.map((row) => (
                  <tr key={row.habitId}>
                    <RowLabel row={row} language={language} />
                    {row.cells.map((cell, index) => {
                      const week = data.weeks[index];
                      const range = `${formatDate(week.start)} – ${formatDate(week.end)}`;
                      const label = `${row.title}, ${range}: ${stateLabel(cell.state, language)}`;
                      return (
                        <Cell
                          key={cell.key}
                          state={cell.state}
                          current={cell.isCurrent}
                          label={label}
                          weekly
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="habit-heatmap-legend" aria-label={tr("Legende", "Legend")}>
        {(
          [
            ["completed", tr("Erledigt", "Completed")],
            ["open", tr("Offen", "Open")],
            ["missed", tr("Nicht erledigt", "Missed")],
            ["notApplicable", tr("Noch nicht aktiv", "Not active yet")],
          ] as [HabitHeatmapState, string][]
        ).map(([state, label]) => (
          <span key={state} className="hh-legend-item">
            <span className={`hh-cell hh-swatch state-${state}`} aria-hidden="true" />
            {label}
          </span>
        ))}
        <span className="hh-legend-item">
          <span className="hh-cell hh-swatch state-open is-current" aria-hidden="true" />
          {tr("Heute / aktuelle Woche", "Today / current week")}
        </span>
        <span className="habit-legend-range">{periodText}</span>
      </div>
    </section>
  );
}
