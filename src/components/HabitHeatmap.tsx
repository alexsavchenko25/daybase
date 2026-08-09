import { useEffect, useMemo, useRef } from "react";
import { buildHabitHeatmap, type HabitHeatmapState } from "../utils/habitHeatmap";
import { dayIndex, isoWeekNumber } from "../utils/date";
import { useI18n } from "../i18n";
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
}: {
  state: HabitHeatmapState;
  current: boolean;
  label: string;
  weekly?: boolean;
}) {
  return (
    <td className={`hh-data-cell ${weekly ? "is-weekly" : ""}`} aria-label={label} title={label}>
      <span
        className={`hh-cell state-${state} ${current ? "is-current" : ""}`}
        aria-hidden="true"
      />
    </td>
  );
}

export default function HabitHeatmap({ habits, today }: { habits: Entry[]; today: string }) {
  const { language, locale, tr } = useI18n();
  const data = useMemo(() => buildHabitHeatmap(habits, today), [habits, today]);
  const dailyScrollRef = useRef<HTMLDivElement>(null);
  const dayLabels = language === "de" ? DAY_LABELS_DE : DAY_LABELS_EN;

  useEffect(() => {
    const scroller = dailyScrollRef.current;
    if (!scroller) return;

    const scrollToLatest = () => {
      scroller.scrollLeft = scroller.scrollWidth;
    };
    scrollToLatest();

    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [data.dates[data.dates.length - 1], data.dailyRows.length]);

  const formatDate = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return (
    <section className="dash-info habit-history" aria-labelledby="habit-history-title">
      <div className="habit-history-head">
        <div>
          <h2 id="habit-history-title">{tr("Verlauf", "History")}</h2>
          <p className="muted">
            {tr(
              "Deine Habit-Check-ins der letzten 30 Tage.",
              "Your habit check-ins from the last 30 days.",
            )}
          </p>
        </div>
        <span className="habit-history-range">{tr("30 Tage", "30 days")}</span>
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
                  "Tägliche Habit-Check-ins der letzten 30 Tage",
                  "Daily habit check-ins for the last 30 days",
                )}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="hh-corner">Habit</th>
                  {data.dates.map((date) => {
                    const weekday = dayIndex(date);
                    const isToday = date === today;
                    return (
                      <th
                        key={date}
                        scope="col"
                        className={`hh-date ${weekday === 0 ? "is-week-start" : ""} ${isToday ? "is-current" : ""}`}
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
                    <th scope="row" className="hh-row-label" title={row.title}>{row.title}</th>
                    {row.cells.map((cell) => {
                      const label = `${row.title}, ${formatDate(cell.key)}: ${stateLabel(cell.state, language)}`;
                      return (
                        <Cell
                          key={cell.key}
                          state={cell.state}
                          current={cell.isCurrent}
                          label={label}
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
          <div className="habit-heatmap-scroll weekly">
            <table className="habit-heatmap-table weekly">
              <caption>
                {tr(
                  "Wöchentliche Habit-Check-ins der letzten 30 Tage",
                  "Weekly habit check-ins for the last 30 days",
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
                    <th scope="row" className="hh-row-label" title={row.title}>{row.title}</th>
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
      </div>
    </section>
  );
}
