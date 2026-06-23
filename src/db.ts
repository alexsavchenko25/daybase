import Dexie, { type Table } from "dexie";
import type { Entry } from "./types";

// Daybase nutzt Dexie.js als IndexedDB-Wrapper.
//
// Warum Dexie statt "idb"?
//  - Deklarative Indizes: Wir indexieren `type` und `date` direkt im Schema,
//    wodurch query-by-type und query-by-date-range zu schnellen, indexierten
//    Lookups werden (where().between(...)) statt zu manuellen Full-Scans.
//  - `dexie-react-hooks` (useLiveQuery) liefert reaktive Queries – die UI
//    aktualisiert sich automatisch bei Datenänderungen, ideal für React.
//  - Eingebaute Versionierung/Migrationen über `.version()` – wichtig, da das
//    Schema mit weiteren Modulen wachsen wird.
//  - "idb" ist nur ein dünner Promise-Wrapper ohne Query-/Index-Komfort; das
//    müssten wir alles selbst bauen.

export class DaybaseDB extends Dexie {
  // Eine einzige Tabelle für ALLE Entry-Typen (zentrales Datenmodell).
  entries!: Table<Entry, string>;

  constructor() {
    super("daybase");

    // Schema v1: Primärschlüssel `id`, plus Indizes für die häufigsten Queries.
    // `*tags` ist ein Multi-Entry-Index, damit später nach einzelnen Tags
    // gefiltert werden kann.
    this.version(1).stores({
      entries: "id, type, date, createdAt, updatedAt, *tags, [type+date]",
    });
  }
}

export const db = new DaybaseDB();
