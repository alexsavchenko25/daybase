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
