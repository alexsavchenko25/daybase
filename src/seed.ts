import { db } from "./db";
import { entriesRepo } from "./repository";
import { DEFAULT_WEEK } from "./data/defaultWeek";
import { DEFAULT_RULES, WEEKLY_RULES_TAG } from "./data/defaultRules";
import { addDaysIso, isoWeekNumber, mondayOfIso, todayIso } from "./utils/date";
import type { Entry } from "./types";

// Flag in localStorage: Seed läuft genau einmal. Bump die Versionsnummer,
// falls das Seed je geändert wird.
const SEED_KEY = "daybase.seeded.v1";

// Singleton-Guard: StrictMode mountet useEffect in dev doppelt; beide Aufrufe
// teilen sich dieselbe Promise statt parallel zu seeden (Race → Duplikate).
let seedGuard: Promise<void> | null = null;

export function seedIfFirstRun(): Promise<void> {
  if (seedGuard) return seedGuard;
  seedGuard = doSeed();
  return seedGuard;
}

// Legt die Standard-Woche (DEFAULT_WEEK) für eine gegebene Montags-Woche an.
async function createWeekplanWeek(monday: string): Promise<void> {
  for (const b of DEFAULT_WEEK) {
    const date = addDaysIso(monday, b.day);
    await entriesRepo.create({
      type: "weekplan",
      date,
      title: b.title,
      content: b.note,
      tags: [],
      meta: {
        weekNumber: isoWeekNumber(date),
        dayOfWeek: b.day,
        startTime: b.startTime,
        endTime: b.endTime,
        category: b.category,
        done: false,
      },
    });
  }
}

async function doSeed(): Promise<void> {
  if (localStorage.getItem(SEED_KEY)) return;

  // Robuster Check: nur seeden, wenn für DIESE Woche (Mo–So) noch keine
  // weekplan-Entries existieren.
  const monday = mondayOfIso(todayIso());
  const sunday = addDaysIso(monday, 6);
  const existing = await db.entries
    .where("[type+date]")
    .between(["weekplan", monday], ["weekplan", sunday], true, true)
    .count();
  if (existing > 0) {
    localStorage.setItem(SEED_KEY, "1");
    return;
  }

  await createWeekplanWeek(monday);

  for (const note of DEFAULT_RULES) {
    await entriesRepo.create({
      type: "note",
      date: todayIso(),
      title: note.title,
      content: note.lines.map((l) => `– ${l}`).join("\n"),
      tags: [WEEKLY_RULES_TAG],
      meta: {},
    });
  }

  localStorage.setItem(SEED_KEY, "1");
}

// Wochenplan-Vorlage (DEFAULT_WEEK) für jede Woche ab der aktuellen Woche
// bis zum Jahresende anlegen. Überschreibt bestehende weekplan-Einträge
// in jeder betroffenen Woche komplett (Button in Settings, mit Bestätigung).
// Gibt die Anzahl angelegter Wochen zurück.
export async function applyYearlyWeekplanTemplate(): Promise<number> {
  const yearEnd = `${new Date().getFullYear()}-12-31`;
  let monday = mondayOfIso(todayIso());
  let weeks = 0;
  while (monday <= yearEnd) {
    const sunday = addDaysIso(monday, 6);
    const existing = await db.entries
      .where("[type+date]")
      .between(["weekplan", monday], ["weekplan", sunday], true, true)
      .toArray();
    if (existing.length) await db.entries.bulkDelete(existing.map((e) => e.id));
    await createWeekplanWeek(monday);
    weeks++;
    monday = addDaysIso(monday, 7);
  }
  return weeks;
}

// Demo-Daten: Beispiel-Einträge für alle Module. Additiv (neue IDs) —
// überschreibt nie bestehende Nutzerdaten, fügt nur hinzu (Merge).
// Gibt die Anzahl der erstellten Demo-Einträge zurück.
export async function loadDemoData(): Promise<number> {
  const today = todayIso();
  const yest = addDaysIso(today, -1);
  const ereyest = addDaysIso(today, -2);
  const lastMon = addDaysIso(mondayOfIso(today), -7);
  let n = 0;
  const add = async (...args: Parameters<typeof entriesRepo.create>) => {
    const e = await entriesRepo.create(...args);
    n++;
    return e;
  };

  // Goal + verknüpftes Project
  const goal = await add({
    type: "goal",
    date: today,
    title: "Trading-Konto auf 10k bringen",
    content: "Konsistent profitabel über 3 Monate.",
    tags: [],
    meta: {
      category: "Finanzen",
      period: "yearly",
      deadline: addDaysIso(today, 180),
      status: "active",
      progress: 35,
    },
  });
  const project = await add({
    type: "project",
    date: today,
    title: "Trading-Strategie dokumentieren",
    content: "Setups, Regeln und Risiko-Management festhalten.",
    tags: [],
    meta: {
      category: "Trading",
      status: "active",
      deadline: addDaysIso(today, 30),
      goalId: goal.id,
    },
  });

  // Tasks (teils verknüpft, einer mit Subtasks + Recurrence)
  await add({
    type: "task",
    date: today,
    title: "Marktanalyse NQ vor Open",
    content: "",
    tags: [],
    meta: { done: false, priority: "high", projectId: project.id },
  });
  await add({
    type: "task",
    date: today,
    title: "Journal-Einträge nachtragen",
    content: "",
    tags: [],
    meta: { done: true, priority: "medium", goalId: goal.id },
  });
  await add({
    type: "task",
    date: addDaysIso(today, 1),
    title: "Wochenrückblick vorbereiten",
    content: "",
    tags: [],
    meta: {
      done: false,
      priority: "low",
      recurrence: "weekly",
      subtasks: [
        { id: crypto.randomUUID(), text: "Trades durchgehen", done: false },
        { id: crypto.randomUUID(), text: "Stats berechnen", done: false },
      ],
    },
  });

  // Habits (daily mit Streak + weekly)
  await add({
    type: "habit",
    date: today,
    title: "Morgenroutine",
    content: "",
    tags: [],
    meta: {
      frequency: "daily",
      streak: 3,
      completedDates: [ereyest, yest, today],
    },
  });
  await add({
    type: "habit",
    date: today,
    title: "Wochenplanung",
    content: "",
    tags: [],
    meta: { frequency: "weekly", streak: 1, completedDates: [today] },
  });

  // Daily Reviews
  await add({
    type: "review",
    date: yest,
    title: "Daily Review",
    content: "",
    tags: [],
    meta: {
      wins: "Diszipliniert nach Plan getradet.",
      problems: "Zu früh aus Gewinner-Trade raus.",
      lessons: "Targets vorher fixieren.",
      energy: 7,
      focus: 6,
      mood: 8,
      tomorrowPriority: "Nur A+ Setups nehmen.",
    },
  });

  // Weekly Review (letzte Woche, kollidiert nicht mit aktueller)
  await add({
    type: "weeklyreview",
    date: lastMon,
    title: `Weekly Review KW ${isoWeekNumber(lastMon)}`,
    content: "",
    tags: [],
    meta: {
      wins: "3 grüne Tage, Regeln eingehalten.",
      problems: "Mittwoch übertradet.",
      lessons: "Nach 2 Verlusten Pause machen.",
      improve: "Tageslimit strikt einhalten.",
      nextWeekFocus: "Geduld bei Einstiegen.",
      score: 7,
      energy: 6,
      discipline: 7,
      movedGoalsProjects: "Trading-Strategie dokumentiert.",
    },
  });

  // Trades (ein Gewinner, ein Verlierer)
  await add({
    type: "trade",
    date: yest,
    title: "NQ Long",
    content: "",
    tags: [],
    meta: {
      symbol: "NQ",
      direction: "long",
      entryPrice: 20100,
      exitPrice: 20180,
      size: 1,
      pointValue: 20,
      pnl: 1600,
      setupTag: "Breakout",
    },
  });
  await add({
    type: "trade",
    date: ereyest,
    title: "ES Short",
    content: "",
    tags: [],
    meta: {
      symbol: "ES",
      direction: "short",
      entryPrice: 5300,
      exitPrice: 5310,
      size: 1,
      pointValue: 50,
      pnl: -500,
      setupTag: "Failed Breakdown",
    },
  });

  // Focus Sessions
  await add({
    type: "focus",
    date: today,
    title: "Marktanalyse",
    content: "",
    tags: [],
    meta: {
      plannedMin: 25,
      actualSec: 1500,
      linkId: project.id,
      linkLabel: project.title,
      focusScore: 8,
      energyAfter: 7,
      distractions: "Handy 1x",
      note: "Guter Flow.",
    },
  });
  await add({
    type: "focus",
    date: yest,
    title: "Deep Work",
    content: "",
    tags: [],
    meta: {
      plannedMin: 50,
      actualSec: 3000,
      focusScore: 6,
      energyAfter: 5,
      distractions: "",
      note: "",
    },
  });

  // Default-Woche + Regeln (nur falls noch nie geseedet)
  await seedIfFirstRun();
  return n;
}

// Einmalige Aufräum-Migration: bestehende Duplikate aus dem alten Race löschen.
// Dup-Key = date + title + startTime + endTime. Behält den ältesten (createdAt),
// löscht nur die Kopien. Idempotent — bei jedem Load gefahrlos aufrufbar.
export async function cleanupDuplicateWeekplan(): Promise<number> {
  const all = await db.entries.where("type").equals("weekplan").toArray();
  const keep = new Map<string, Entry>();
  const dropIds: string[] = [];

  for (const e of all) {
    const m = e.meta as { startTime?: string; endTime?: string };
    const key = `${e.date}|${e.title}|${m.startTime ?? ""}|${m.endTime ?? ""}`;
    const prev = keep.get(key);
    if (!prev) {
      keep.set(key, e);
      continue;
    }
    // Älteren behalten, jüngeren verwerfen.
    if (e.createdAt < prev.createdAt) {
      keep.set(key, e);
      dropIds.push(prev.id);
    } else {
      dropIds.push(e.id);
    }
  }

  if (dropIds.length) await db.entries.bulkDelete(dropIds);
  return dropIds.length;
}
