import type { Entry, FocusMeta } from "../types";

export function focusMeta(e: Entry): FocusMeta {
  const m = e.meta as Partial<FocusMeta>;
  return {
    plannedMin: m.plannedMin ?? 0,
    actualSec: m.actualSec ?? 0,
    linkId: m.linkId,
    linkLabel: m.linkLabel,
    focusScore: m.focusScore ?? 0,
    energyAfter: m.energyAfter ?? 0,
    distractions: m.distractions ?? "",
    note: m.note ?? "",
  };
}

// Sekunden → "Xh Ym" / "Zm" / "0m".
export function fmtDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Sekunden → "MM:SS" für den laufenden Timer.
export function fmtClock(sec: number): string {
  const s = Math.max(0, sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
