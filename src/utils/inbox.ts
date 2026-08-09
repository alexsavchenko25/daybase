// Kurztitel aus freiem Erfassungstext ableiten — für Listen, Suche und die
// Titel-Spalte bei Konvertierung. Erste nicht-leere Zeile, gekappt.
const TITLE_MAX = 80;

export function deriveTitle(text: string): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  const t = line.trim();
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX).trimEnd()}…` : t;
}
