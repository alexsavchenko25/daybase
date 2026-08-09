// Dashboard-Anpassung: Reihenfolge + Sichtbarkeit der Dashboard-Bereiche.
// Reine Anzeige-Einstellung, nur lokal (localStorage) — kein Entry-Typ, kein
// Cloud-Sync, keine DB-Migration. Alle Funktionen hier sind pure; nur
// readDashboardLayout/writeDashboardLayout fassen localStorage an.
//
// Section-IDs sind bewusst stabil und sprachunabhängig (Labels kommen über
// tr() aus Dashboard.tsx) — sonst würde ein Sprachwechsel die gespeicherte
// Anordnung entwerten.

export const DASHBOARD_LAYOUT_KEY = "daybase.dashboard.layout.v1";
const LAYOUT_VERSION = 1;

// Reihenfolge dieses Arrays = Standard-Dashboard von oben nach unten.
export const DASHBOARD_SECTION_IDS = [
  "focus",
  "hints",
  "kpis",
  "insights",
  "goals",
  "projects",
] as const;

export type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number];

// Bereiche, die im Standard-Layout nebeneinander in einem 2-Spalten-Grid
// stehen (.dash-grid.dash-grid-2). Nur direkt aufeinanderfolgende dieser
// Bereiche teilen sich eine Zeile.
const PAIRED_SECTIONS = new Set<DashboardSectionId>(["goals", "projects"]);

export interface DashboardLayout {
  order: DashboardSectionId[];
  hidden: DashboardSectionId[];
}

const KNOWN = new Set<string>(DASHBOARD_SECTION_IDS);

function isKnownId(value: unknown): value is DashboardSectionId {
  return typeof value === "string" && KNOWN.has(value);
}

export function defaultDashboardLayout(): DashboardLayout {
  return { order: [...DASHBOARD_SECTION_IDS], hidden: [] };
}

// Macht aus beliebigem Input ein gültiges Layout:
// - unbekannte/entfernte IDs fliegen raus (alte Speicherstände)
// - Duplikate werden entfernt
// - neu hinzugekommene Bereiche werden in ihrer Standard-Position ergänzt,
//   statt unsichtbar zu bleiben
export function normalizeDashboardLayout(order: unknown, hidden: unknown): DashboardLayout {
  const rawOrder = Array.isArray(order) ? order : [];
  const seen = new Set<DashboardSectionId>();
  const cleanOrder: DashboardSectionId[] = [];
  for (const id of rawOrder) {
    if (!isKnownId(id) || seen.has(id)) continue;
    seen.add(id);
    cleanOrder.push(id);
  }
  // Fehlende (= neu eingeführte) Bereiche hinten anhängen, in ihrer
  // Standard-Reihenfolge. Bewusst ans Ende statt "an die Default-Position":
  // sonst würde ein neuer Bereich die vom Nutzer bewusst gewählte Abfolge
  // auseinanderreißen. So bleibt die eigene Anordnung unangetastet und der
  // neue Bereich ist trotzdem sichtbar.
  for (const id of DASHBOARD_SECTION_IDS) {
    if (seen.has(id)) continue;
    seen.add(id);
    cleanOrder.push(id);
  }

  const rawHidden = Array.isArray(hidden) ? hidden : [];
  const hiddenSet = new Set<DashboardSectionId>();
  for (const id of rawHidden) {
    if (isKnownId(id)) hiddenSet.add(id);
  }

  return {
    order: cleanOrder,
    // Hidden in Order-Reihenfolge halten — stabile Anzeige im Wiederherstellen-Bereich.
    hidden: cleanOrder.filter((id) => hiddenSet.has(id)),
  };
}

// Defensiv gegen alles, was in localStorage stehen kann: kaputtes JSON,
// falscher Typ, veraltete Version → Standard-Layout statt Absturz.
export function parseDashboardLayout(raw: string | null): DashboardLayout {
  if (!raw) return defaultDashboardLayout();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultDashboardLayout();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return defaultDashboardLayout();
  }
  const record = parsed as Record<string, unknown>;
  if (record.version !== LAYOUT_VERSION) return defaultDashboardLayout();
  return normalizeDashboardLayout(record.order, record.hidden);
}

export function serializeDashboardLayout(layout: DashboardLayout): string {
  return JSON.stringify({ version: LAYOUT_VERSION, order: layout.order, hidden: layout.hidden });
}

export function visibleDashboardSections(layout: DashboardLayout): DashboardSectionId[] {
  const hidden = new Set(layout.hidden);
  return layout.order.filter((id) => !hidden.has(id));
}

export function hiddenDashboardSections(layout: DashboardLayout): DashboardSectionId[] {
  return layout.hidden;
}

// Verschiebt relativ zu den SICHTBAREN Nachbarn: liegt zwischen zwei
// sichtbaren Bereichen ein ausgeblendeter, würde ein reiner Index-Swap im
// order-Array optisch wirkungslos aussehen.
export function moveDashboardSection(
  layout: DashboardLayout,
  id: DashboardSectionId,
  direction: -1 | 1,
): DashboardLayout {
  const visible = visibleDashboardSections(layout);
  const visibleIndex = visible.indexOf(id);
  if (visibleIndex < 0) return layout;
  const neighbour = visible[visibleIndex + direction];
  if (neighbour === undefined) return layout; // schon ganz oben/unten
  const order = [...layout.order];
  const from = order.indexOf(id);
  const to = order.indexOf(neighbour);
  if (from < 0 || to < 0) return layout;
  order[from] = neighbour;
  order[to] = id;
  return { ...layout, order };
}

export function canMoveDashboardSection(
  layout: DashboardLayout,
  id: DashboardSectionId,
  direction: -1 | 1,
): boolean {
  const visible = visibleDashboardSections(layout);
  const visibleIndex = visible.indexOf(id);
  return visibleIndex >= 0 && visible[visibleIndex + direction] !== undefined;
}

export function setDashboardSectionHidden(
  layout: DashboardLayout,
  id: DashboardSectionId,
  hidden: boolean,
): DashboardLayout {
  if (!KNOWN.has(id)) return layout;
  const hiddenSet = new Set(layout.hidden);
  if (hidden) hiddenSet.add(id);
  else hiddenSet.delete(id);
  return { ...layout, hidden: layout.order.filter((s) => hiddenSet.has(s)) };
}

// Gruppiert aufeinanderfolgende "Paar"-Bereiche (Goals/Projects) in eine
// gemeinsame Grid-Zeile — so bleibt das Standard-Dashboard exakt wie vorher,
// obwohl beide jetzt einzeln sortier- und ausblendbar sind.
export function groupDashboardRows(ids: DashboardSectionId[]): DashboardSectionId[][] {
  const rows: DashboardSectionId[][] = [];
  for (const id of ids) {
    const previous = rows[rows.length - 1];
    if (previous && PAIRED_SECTIONS.has(id) && PAIRED_SECTIONS.has(previous[previous.length - 1])) {
      previous.push(id);
    } else {
      rows.push([id]);
    }
  }
  return rows;
}

export function isPairedDashboardSection(id: DashboardSectionId): boolean {
  return PAIRED_SECTIONS.has(id);
}

export function readDashboardLayout(): DashboardLayout {
  try {
    return parseDashboardLayout(localStorage.getItem(DASHBOARD_LAYOUT_KEY));
  } catch {
    return defaultDashboardLayout();
  }
}

export function writeDashboardLayout(layout: DashboardLayout): void {
  try {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, serializeDashboardLayout(layout));
  } catch {
    // Privater Modus / Speicher voll: Anpassung gilt dann nur für diese Sitzung.
  }
}
