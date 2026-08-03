// Optionaler Cloud-Sync für alle Module (außer weekplan, siehe SUPABASE.md).
//
// Prinzip: IndexedDB bleibt IMMER die lokale Quelle, die UI + Backup lesen.
// Bei aktiver Supabase-Session wird ZUSÄTZLICH gespiegelt:
//   - lokale Schreibvorgänge → Supabase (push, via Repository-Hooks)
//   - Abgleich in beide Richtungen (reconcile) beim Start, bei Sichtbarkeit
//     und per Polling — jüngeres `updatedAt` gewinnt.
// Ohne Login passiert nichts — Daten bleiben rein lokal.
import { supabase } from "./supabase";
import { db } from "./db";
import { setEntrySyncHooks } from "./repository";
import { planReconcile } from "./utils/reconcile";
import type { Entry, EntryType } from "./types";

// Tabellenname pro Typ, deckungsgleich mit supabase-schema.sql.
// weekplan ist bewusst nicht enthalten (siehe SUPABASE.md).
const TABLE_BY_TYPE: Partial<Record<EntryType, string>> = {
  task: "tasks",
  habit: "habits",
  note: "notes",
  journal: "diary_entries",
  review: "daily_reviews",
  weeklyreview: "weekly_reviews",
  goal: "goals",
  project: "projects",
  trade: "trades",
  focus: "focus_sessions",
};

// Gecachte User-Id der aktiven Session (null = nicht eingeloggt → no-op).
let activeUserId: string | null = null;

export function isSyncActive(): boolean {
  return Boolean(supabase && activeUserId);
}

const dev = Boolean(import.meta.env?.DEV);
function log(...args: unknown[]): void {
  if (dev) console.info("[sync]", ...args);
}

// ---------------------------------------------------------------------------
// Persistenter Sync-Zustand (überlebt Reload, gilt pro Nutzer)
// ---------------------------------------------------------------------------
// seen:       Ids, die beim letzten Abgleich in der Cloud lagen. Fehlt eine
//             davon später dort, wurde sie auf einem anderen Gerät gelöscht →
//             lokal nachziehen. Nie in der Cloud gesehene Ids werden NIE
//             gelöscht (schützt offline angelegte Einträge).
// tombstones: lokal gelöscht, Cloud-Delete steht noch aus (z.B. offline) →
//             beim nächsten Abgleich nachholen und bis dahin nicht wieder
//             einpullen. Format: "<type>:<id>".
// lastUser:   Wer zuletzt auf diesem Gerät synchronisiert hat. Nur damit lässt
//             sich nach einem Reload "gleiche Session" von "anderer Account"
//             unterscheiden.
const STATE_KEY = "daybase.sync.state";

interface SyncState {
  userId: string;
  seen: Partial<Record<EntryType, string[]>>;
  tombstones: string[];
}

function emptyState(userId: string): SyncState {
  return { userId, seen: {}, tombstones: [] };
}

function loadState(userId: string): SyncState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return emptyState(userId);
    const s = JSON.parse(raw) as Partial<SyncState>;
    // Zustand eines anderen Nutzers ist wertlos (und gefährlich) → verwerfen.
    if (s.userId !== userId) return emptyState(userId);
    return {
      userId,
      seen: s.seen ?? {},
      tombstones: Array.isArray(s.tombstones) ? s.tombstones : [],
    };
  } catch {
    return emptyState(userId);
  }
}

function saveState(s: SyncState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn("[sync] Zustand konnte nicht gespeichert werden:", (e as Error).message);
  }
}

function clearState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* egal */
  }
}

function lastUser(): string | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? ((JSON.parse(raw) as Partial<SyncState>).userId ?? null) : null;
  } catch {
    return null;
  }
}

// Lokal gelöscht, Cloud-Delete offen → merken, bis er durchgeht.
function addTombstone(type: EntryType, id: string): void {
  if (!activeUserId) return;
  const s = loadState(activeUserId);
  const key = `${type}:${id}`;
  if (!s.tombstones.includes(key)) s.tombstones.push(key);
  saveState(s);
}

function dropTombstone(type: EntryType, id: string): void {
  if (!activeUserId) return;
  const s = loadState(activeUserId);
  const key = `${type}:${id}`;
  const i = s.tombstones.indexOf(key);
  if (i >= 0) {
    s.tombstones.splice(i, 1);
    saveState(s);
  }
}

// ---------------------------------------------------------------------------
// Mapping Entry <-> DB-Zeile
// ---------------------------------------------------------------------------

// Entry → DB-Zeile. user_id wird bewusst weggelassen → DB-Default
// `auth.uid()` füllt es. Leeres date → NULL (date-Spalte verträgt kein "").
function toRow(e: Entry) {
  return {
    id: e.id,
    entry_date: e.date || null,
    title: e.title,
    content: e.content,
    tags: e.tags,
    meta: e.meta,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

// DB-Zeile → Entry.
function toEntry(type: EntryType, row: Record<string, any>): Entry {
  return {
    id: row.id,
    type,
    date: row.entry_date ?? "",
    title: row.title ?? "",
    content: row.content ?? "",
    tags: row.tags ?? [],
    meta: row.meta ?? {},
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

// ---------------------------------------------------------------------------
// Cloud-Zugriff
// ---------------------------------------------------------------------------

// PostgREST liefert per Default max. 1000 Zeilen. Ohne Paginierung fehlten
// größere Bestände stillschweigend — und würden von der Lösch-Abgleichung
// fälschlich als "remote gelöscht" gewertet.
const PAGE = 1000;

// Alle Zeilen einer Tabelle. null = Fehler (dann wird diese Tabelle in diesem
// Durchlauf komplett übersprungen, damit nichts fälschlich gelöscht wird).
async function fetchTable(table: string): Promise<Record<string, any>[] | null> {
  if (!supabase) return null;
  const rows: Record<string, any>[] = [];
  // Weiterblättern, bis eine Seite leer zurückkommt — nicht bis eine Seite
  // "zu kurz" ist: das serverseitige Limit kann kleiner sein als PAGE.
  for (let from = 0; ; ) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1);
    if (error) {
      console.warn(`[sync] pull (${table}) fehlgeschlagen:`, error.message);
      return null;
    }
    const batch = data ?? [];
    if (batch.length === 0) break;
    rows.push(...batch);
    from += batch.length;
  }
  return rows;
}

// Verhindert eine Push-Schleife, falls der DB-Trigger `updated_at` serverseitig
// überschreibt (dann bliebe der lokale Stand dauerhaft "jünger").
// Siehe supabase-migrations/2026-08-03-drop-updated-at-triggers.sql.
const lastPushed = new Map<string, string>();

async function pushRow(table: string, e: Entry): Promise<boolean> {
  if (!supabase) return false;
  if (lastPushed.get(e.id) === e.updatedAt) return false;
  const { error } = await supabase.from(table).upsert(toRow(e));
  if (error) {
    console.warn(`[sync] push (${table}) fehlgeschlagen:`, error.message);
    return false;
  }
  lastPushed.set(e.id, e.updatedAt);
  return true;
}

// Einen Entry nach Supabase spiegeln (fire-and-forget; Fehler nur loggen, nie
// die UI blockieren). Fehlgeschlagene Pushes holt der nächste Abgleich nach.
async function pushEntry(e: Entry): Promise<void> {
  const table = TABLE_BY_TYPE[e.type];
  if (!supabase || !activeUserId || !table) return;
  lastPushed.delete(e.id); // frischer Stand → immer senden
  await pushRow(table, e);
}

// Einen Entry in der Cloud löschen. Schlägt das fehl (offline), merkt sich ein
// Tombstone die Löschung, damit der nächste Abgleich sie nachholt statt den
// Eintrag wieder einzupullen.
async function removeEntryRemote(e: Entry): Promise<void> {
  const table = TABLE_BY_TYPE[e.type];
  if (!supabase || !activeUserId || !table) return;
  lastPushed.delete(e.id);
  addTombstone(e.type, e.id);
  const { error } = await supabase.from(table).delete().eq("id", e.id);
  if (error) {
    console.warn(`[sync] delete (${table}) fehlgeschlagen:`, error.message);
    return;
  }
  dropTombstone(e.type, e.id);
}

// ---------------------------------------------------------------------------
// Abgleich
// ---------------------------------------------------------------------------

// `seen` wird pro Typ in `seen` gesammelt und erst am Ende des Durchlaufs
// geschrieben. Tombstones dagegen immer frisch lesen/schreiben: der Nutzer kann
// während eines Durchlaufs etwas löschen, und ein Snapshot würde diese Löschung
// beim abschließenden Speichern wieder verwerfen.
async function syncTable(
  type: EntryType,
  table: string,
  seenOut: Partial<Record<EntryType, string[]>>,
): Promise<void> {
  const rows = await fetchTable(table);
  if (rows === null) return; // Tabelle diesmal überspringen (kein Löschen!)

  const prefix = `${type}:`;
  const tombIds = new Set(
    (activeUserId ? loadState(activeUserId).tombstones : [])
      .filter((t) => t.startsWith(prefix))
      .map((t) => t.slice(prefix.length)),
  );

  // Offen gebliebene Cloud-Löschungen zuerst nachholen.
  for (const id of tombIds) {
    if (!supabase) break;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (!error) dropTombstone(type, id);
  }

  const remote = rows.map((r) => toEntry(type, r));
  const local = await db.entries.where("type").equals(type).toArray();
  const seen = new Set(activeUserId ? (loadState(activeUserId).seen[type] ?? []) : []);
  const plan = planReconcile(local, remote, seen, tombIds);

  if (plan.toLocal.length) await db.entries.bulkPut(plan.toLocal);
  if (plan.deleteLocal.length) await db.entries.bulkDelete(plan.deleteLocal);

  const pushed: string[] = [];
  for (const e of plan.toRemote) {
    if (await pushRow(table, e)) pushed.push(e.id);
  }

  // `seen` = tatsächlicher Cloud-Bestand + was gerade erfolgreich hochging.
  // Nur erfolgreiche Pushes zählen — sonst würde ein fehlgeschlagener Push den
  // Eintrag beim nächsten Lauf als "remote gelöscht" einstufen.
  seenOut[type] = [...plan.remoteIds, ...pushed];

  if (plan.toLocal.length || plan.deleteLocal.length || pushed.length) {
    log(
      `${table}: ${plan.toLocal.length} ↓, ${pushed.length} ↑, ${plan.deleteLocal.length} lokal gelöscht`,
    );
  }
}

// Ein Durchlauf über alle synchronisierten Tabellen. Überlappende Läufe
// (Poll trifft auf laufenden Abgleich) werden verworfen.
let running = false;

export async function syncAll(): Promise<void> {
  if (!supabase || !activeUserId || running) return;
  running = true;
  const userId = activeUserId;
  const seenOut: Partial<Record<EntryType, string[]>> = {};
  try {
    for (const [type, table] of Object.entries(TABLE_BY_TYPE) as [EntryType, string][]) {
      if (activeUserId !== userId) return; // Account gewechselt → abbrechen
      await syncTable(type, table, seenOut);
    }
    // Nur `seen` schreiben — Tombstones können sich währenddessen geändert
    // haben und werden von addTombstone/dropTombstone selbst gepflegt.
    const current = loadState(userId);
    current.seen = { ...current.seen, ...seenOut };
    saveState(current);
  } catch (e) {
    console.warn("[sync] Abgleich fehlgeschlagen:", (e as Error).message);
  } finally {
    running = false;
  }
}

// Migration: alle lokalen Daten (aller synchronisierten Module) in die Cloud
// übertragen (Button in Settings). Bestehende lokale Daten werden NICHT
// gelöscht — nur hochgeladen. Idempotent: upsert nach id, mehrfaches Ausführen
// erzeugt keine Duplikate.
export async function pushAllLocal(): Promise<number> {
  if (!supabase || !activeUserId) {
    throw new Error("Nicht eingeloggt — kein Cloud-Sync aktiv.");
  }
  const CHUNK = 500; // Upsert-Payload begrenzen (große Bestände sonst zu groß)
  let total = 0;
  for (const [type, table] of Object.entries(TABLE_BY_TYPE) as [EntryType, string][]) {
    const rows = await db.entries.where("type").equals(type).toArray();
    if (!rows.length) continue;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from(table).upsert(chunk.map(toRow));
      if (error) throw new Error(`${table}: ${error.message}`);
      total += chunk.length;
    }
  }
  return total;
}

// Lokalen Cloud-Cache aus IndexedDB entfernen (alle synchronisierten Typen).
// Wird bei Logout/Account-Wechsel gerufen, damit auf einem geteilten Gerät
// der nächste Nutzer keine fremden Daten sieht. weekplan bleibt unberührt.
async function clearLocalSynced(): Promise<void> {
  const types = Object.keys(TABLE_BY_TYPE) as EntryType[];
  await db.entries.where("type").anyOf(types).delete();
}

// Reaktion auf Login / Logout / Account-Wechsel / Reload.
// `lastUser()` macht den Unterschied zwischen "gleiche Session nach Reload"
// (nur abgleichen) und "anderer Account" (erst lokale Kopien löschen).
async function applySession(newId: string | null): Promise<void> {
  if (newId === activeUserId) return; // Token-Refresh o.ä. — kein echter Wechsel
  const prevId = activeUserId ?? lastUser();
  activeUserId = newId;
  lastPushed.clear();

  if (!newId) {
    clearState();
    await clearLocalSynced();
    log("Logout — lokaler Cloud-Cache geleert");
    return;
  }

  if (prevId && prevId !== newId) {
    // Account-Wechsel (auch über einen Reload hinweg): fremde Kopien zuerst weg.
    clearState();
    await clearLocalSynced();
    log("Account-Wechsel — lokaler Cloud-Cache geleert");
  }

  // Ein neuer Account übernimmt die bisher rein lokalen Daten beim ersten
  // Abgleich automatisch (nie in der Cloud gesehen → wird hochgeladen).
  saveState(loadState(newId));
  await syncAll();
}

// Poll-Intervall für den Abgleich zwischen Geräten, solange die App sichtbar
// ist. ponytail: 20s-Polling deckt den Fall "beide Geräte gleichzeitig offen"
// ab. Für echten Instant-Sync auf Supabase Realtime (Websocket-Subscription
// pro Tabelle) umstellen — dann kann das Polling weg.
const POLL_MS = 20000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

// Einmal beim App-Start aufrufen. Verbindet Session-Status mit den
// Repository-Hooks. Ohne konfiguriertes Supabase passiert nichts.
// Das zurückgegebene Promise ist erfüllt, sobald die Session aufgelöst und der
// erste Abgleich durch ist — abgeleitete Werte (z.B. Habit-Streaks) dürfen erst
// danach geschrieben werden, sonst überschreiben sie frischere Cloud-Daten.
// Singleton: React StrictMode ruft den Effekt in dev zweimal auf; ohne Guard
// hingen zwei Auth-Listener und zwei Poll-Timer an derselben Session.
let initGuard: Promise<void> | null = null;

export function initSync(): Promise<void> {
  if (!initGuard) initGuard = doInitSync();
  return initGuard;
}

function doInitSync(): Promise<void> {
  if (!supabase) return Promise.resolve();

  // Hooks immer registrieren — sie sind no-ops, solange activeUserId null ist.
  setEntrySyncHooks({ onUpsert: pushEntry, onDelete: removeEntryRemote });

  // Session-Auflösung und Auth-Events strikt serialisieren. supabase-js feuert
  // beim Abonnieren sofort `INITIAL_SESSION` — ohne diese Kette liefe das
  // Event gegen ein noch leeres activeUserId und würde einen Reload als
  // "frischer Login" behandeln.
  const first = supabase.auth
    .getSession()
    .then(({ data }) => applySession(data.session?.user.id ?? null))
    .catch((e) => console.warn("[sync] Session-Auflösung fehlgeschlagen:", (e as Error).message));
  let chain: Promise<unknown> = first;

  supabase.auth.onAuthStateChange((_event, session) => {
    const newId = session?.user.id ?? null;
    chain = chain
      .catch(() => undefined)
      .then(() => applySession(newId));
  });

  // Ohne Realtime-Subscription bekommt ein offen gelassener Tab/App fremde
  // Änderungen (z.B. vom Handy abgehakte Task) sonst nie mit. Deshalb:
  //  (1) sofort abgleichen, wenn Tab/App wieder in den Vordergrund kommt, und
  //  (2) regelmäßig abgleichen, solange die App sichtbar ist (deckt den Fall
  //      ab, dass beide Geräte gleichzeitig offen sind — dann feuert kein
  //      visibilitychange).
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && activeUserId) void syncAll();
    });
  }
  if (pollTimer == null) {
    pollTimer = setInterval(() => {
      if (isVisible() && activeUserId) void syncAll();
    }, POLL_MS);
  }

  return first;
}
