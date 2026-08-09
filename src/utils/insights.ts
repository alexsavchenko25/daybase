// Leichte, rein lokale Muster-Erkennung für das Dashboard-Insights-Panel.
// Keine KI, keine externen Aufrufe — nur Aggregation bereits vorhandener
// Entries. Ergebnisse werden nie persistiert (rein abgeleitet bei jedem Call).
import { addDaysIso, dayIndex, mondayOfIso } from "./date";
import { habitMeta } from "./habit";
import { focusMeta, fmtDuration } from "./focus";
import { lastTaskActivityIso } from "../pages/ProjectsPage";
import type { Entry, ReviewMeta, TaskMeta } from "../types";

export interface Insight {
  id: string;
  icon: string;
  de: string;
  en: string;
}

const WEEKDAY_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAY_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekDates(monday: string): Set<string> {
  return new Set(Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i)));
}

// Habit-Completion diese Woche vs. letzte Woche. Nur Habits, die vor Beginn
// der letzten Woche existierten, zählen — sonst würde eine heute angelegte
// Habit die Vorwoche fälschlich mit 0% belasten.
function habitTrend(habits: Entry[], today: string): Insight | null {
  const curMonday = mondayOfIso(today);
  const prevMonday = addDaysIso(curMonday, -7);
  const eligible = habits.filter((h) => h.createdAt.slice(0, 10) <= prevMonday);
  if (eligible.length === 0) return null;

  function rate(dates: Set<string>): number {
    let done = 0;
    let expected = 0;
    for (const h of eligible) {
      const m = habitMeta(h);
      const inRange = m.completedDates.filter((d) => dates.has(d));
      if (m.frequency === "weekly") {
        expected += 1;
        if (inRange.length > 0) done += 1;
      } else {
        expected += 7;
        done += inRange.length;
      }
    }
    return expected ? Math.round((done / expected) * 100) : 0;
  }

  const cur = rate(weekDates(curMonday));
  const prev = rate(weekDates(prevMonday));
  const delta = cur - prev;
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return {
    id: "habit-trend",
    icon: "🔁",
    de: `Habit-Quote diese Woche ${cur}% ${arrow} letzte Woche ${prev}%.`,
    en: `Habit completion this week ${cur}% ${arrow} last week ${prev}%.`,
  };
}

// Fokuszeit diese Woche vs. letzte Woche. Mind. 3 Sessions zusammen, sonst
// ist die Aussage zu verrauscht (eine einzelne lange Session verzerrt stark).
function focusTrend(focusEntries: Entry[], today: string): Insight | null {
  const curMonday = mondayOfIso(today);
  const prevMonday = addDaysIso(curMonday, -7);
  const curDates = weekDates(curMonday);
  const prevDates = weekDates(prevMonday);

  let curSec = 0, curCount = 0, prevSec = 0, prevCount = 0;
  for (const e of focusEntries) {
    const sec = focusMeta(e).actualSec;
    if (curDates.has(e.date)) { curSec += sec; curCount++; }
    else if (prevDates.has(e.date)) { prevSec += sec; prevCount++; }
  }
  if (curCount + prevCount < 3) return null;

  const diff = curSec - prevSec;
  const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  const diffStr = fmtDuration(Math.abs(diff));
  return {
    id: "focus-trend",
    icon: "⏱️",
    de: `Fokuszeit diese Woche ${fmtDuration(curSec)} — ${arrow} ${diffStr} ggü. letzter Woche.`,
    en: `Focus time this week ${fmtDuration(curSec)} — ${arrow} ${diffStr} vs. last week.`,
  };
}

// Ø aus Energie/Fokus/Stimmung der Daily Reviews, diese vs. letzte Woche.
// Mind. 3 Reviews pro Woche (von max. 7), sonst zu wenig Grundlage.
function wellbeingTrend(reviews: Entry[], today: string): Insight | null {
  const curMonday = mondayOfIso(today);
  const prevMonday = addDaysIso(curMonday, -7);
  const curDates = weekDates(curMonday);
  const prevDates = weekDates(prevMonday);

  const cur = reviews.filter((r) => curDates.has(r.date));
  const prev = reviews.filter((r) => prevDates.has(r.date));
  if (cur.length < 3 || prev.length < 3) return null;

  const avg = (list: Entry[]) =>
    list.reduce((s, r) => {
      const m = r.meta as ReviewMeta;
      return s + (m.energy + m.focus + m.mood) / 3;
    }, 0) / list.length;

  const curAvg = avg(cur);
  const prevAvg = avg(prev);
  const delta = curAvg - prevAvg;
  const arrow = delta > 0.05 ? "↑" : delta < -0.05 ? "↓" : "→";
  const fmt1 = (n: number) => n.toFixed(1);
  return {
    id: "wellbeing-trend",
    icon: "⚡",
    de: `Ø Energie/Fokus/Stimmung diese Woche ${fmt1(curAvg)}/10 ${arrow} letzte Woche ${fmt1(prevAvg)}/10.`,
    en: `Avg. energy/focus/mood this week ${fmt1(curAvg)}/10 ${arrow} last week ${fmt1(prevAvg)}/10.`,
  };
}

// Aktivstes/wartendes Project ohne Task-Aktivität seit ≥14 Tagen. Braucht
// mind. eine verknüpfte Task (sonst gibt's keine "Aktivität" zu bewerten —
// dafür gibt es bereits den separaten "fehlende nächste Aktion"-Hinweis).
function staleProjectInsight(projects: Entry[], tasks: Entry[]): Insight | null {
  const candidates = projects
    .filter((p) => {
      const status = (p.meta as { status?: string }).status;
      return status === "active" || status === "waiting";
    })
    .map((p) => {
      const linked = tasks.filter((t) => (t.meta as TaskMeta).projectId === p.id);
      const last = lastTaskActivityIso(p.id, tasks);
      return { p, linkedCount: linked.length, last };
    })
    .filter((x) => x.linkedCount > 0 && x.last)
    .map((x) => ({
      ...x,
      days: Math.floor((Date.now() - new Date(x.last as string).getTime()) / 86_400_000),
    }))
    .filter((x) => x.days >= 14)
    .sort((a, b) => b.days - a.days);

  if (candidates.length === 0) return null;
  const top = candidates[0];
  return {
    id: "stale-project",
    icon: "📂",
    de: `„${top.p.title}“ hatte seit ${top.days} Tagen keine Task-Aktivität.`,
    en: `"${top.p.title}" has had no task activity in ${top.days} days.`,
  };
}

// Bester Wochentag für Fokuszeit über alle Sessions. Braucht mind. 8
// Sessions über mind. 3 verschiedene Wochentage, und der Spitzenreiter muss
// mind. 20% vor dem Zweitplatzierten liegen — sonst ist es kein echtes Muster.
function bestFocusDay(focusEntries: Entry[]): Insight | null {
  const byDay = Array.from({ length: 7 }, () => ({ sec: 0, count: 0 }));
  for (const e of focusEntries) {
    const idx = dayIndex(e.date);
    byDay[idx].sec += focusMeta(e).actualSec;
    byDay[idx].count += 1;
  }
  const totalCount = focusEntries.length;
  const distinctDays = byDay.filter((d) => d.count > 0).length;
  if (totalCount < 8 || distinctDays < 3) return null;

  const ranked = byDay
    .map((d, idx) => ({ idx, ...d }))
    .sort((a, b) => b.sec - a.sec);
  const [best, second] = ranked;
  if (best.sec <= 0) return null;
  if (second && best.sec < second.sec * 1.2) return null;

  return {
    id: "best-focus-day",
    icon: "📈",
    de: `${WEEKDAY_DE[best.idx]} ist dein stärkster Fokus-Tag (Ø ${fmtDuration(best.sec / best.count)} über ${best.count} Sessions).`,
    en: `${WEEKDAY_EN[best.idx]} is your strongest focus day (avg. ${fmtDuration(best.sec / best.count)} over ${best.count} sessions).`,
  };
}

export function deriveInsights(data: {
  today: string;
  habits: Entry[];
  focus: Entry[];
  reviews: Entry[];
  projects: Entry[];
  tasks: Entry[];
}): Insight[] {
  const candidates = [
    habitTrend(data.habits, data.today),
    focusTrend(data.focus, data.today),
    wellbeingTrend(data.reviews, data.today),
    staleProjectInsight(data.projects, data.tasks),
    bestFocusDay(data.focus),
  ];
  return candidates.filter((x): x is Insight => x !== null);
}
