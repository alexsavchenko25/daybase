import type { TradeMeta } from "../types";

// Futures-PnL: (Exit − Entry) × $/Punkt × Size × Richtung.
// long: Gewinn wenn exit > entry. short: invertiert.
export function computeTradePnl(
  entryPrice: number,
  exitPrice: number,
  size: number,
  pointValue: number,
  direction: TradeMeta["direction"],
): number {
  const dir = direction === "long" ? 1 : -1;
  const raw = (exitPrice - entryPrice) * pointValue * size * dir;
  return Math.round(raw * 100) / 100;
}

// Häufige Setups als Vorschläge (datalist) — eigene trotzdem erlaubt.
export const SETUP_PRESETS = [
  "Breakout",
  "Reversal",
  "Trend",
  "Range",
  "Pullback",
  "News",
  "Scalp",
];

// Symbol-Vorschläge (nur datalist-Komfort, kein Zwang).
export const SYMBOL_PRESETS = ["NQ", "ES", "MNQ", "MES"];

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function fmtUsd(n: number): string {
  return USD.format(n);
}
