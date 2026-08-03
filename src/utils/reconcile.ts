import type { Entry } from "../types";

// Reine Abgleich-Logik für den Cloud-Sync — bewusst ohne I/O und ohne Import
// von supabase/db, damit sie isoliert testbar ist. Ausführung: src/sync.ts.

export interface ReconcilePlan {
  toLocal: Entry[]; // Cloud → IndexedDB (Cloud-Stand ist jünger oder lokal unbekannt)
  toRemote: Entry[]; // IndexedDB → Cloud (lokaler Stand ist jünger oder nie hochgeladen)
  deleteLocal: string[]; // auf einem anderen Gerät gelöscht → lokal nachziehen
  remoteIds: string[]; // aktueller Cloud-Bestand (Basis für `seen`)
}

// Zeitstempel robust vergleichen: lokal ist es ein JS-ISO-String, aus Postgres
// kommt "…+00:00" mit Mikrosekunden. Lexikografisch wäre das falsch.
function ts(iso: string): number {
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Entscheidet pro Eintrag, in welche Richtung synchronisiert wird.
 *
 * @param local  alle lokalen Entries EINES Typs
 * @param remote alle Cloud-Entries desselben Typs
 * @param seen   Ids, die beim letzten Abgleich in der Cloud lagen. Nur solche
 *               dürfen lokal gelöscht werden, wenn sie dort fehlen — alles
 *               andere ist ein noch nie hochgeladener (z.B. offline
 *               angelegter) Eintrag und würde sonst verloren gehen.
 * @param tombstones lokal gelöscht, Cloud-Delete steht noch aus → diese Zeilen
 *               nicht wieder einpullen.
 */
export function planReconcile(
  local: Entry[],
  remote: Entry[],
  seen: Set<string>,
  tombstones: Set<string> = new Set(),
): ReconcilePlan {
  const localById = new Map(local.map((e) => [e.id, e]));
  const plan: ReconcilePlan = { toLocal: [], toRemote: [], deleteLocal: [], remoteIds: [] };
  const remoteIds = new Set<string>();

  for (const r of remote) {
    if (tombstones.has(r.id)) continue;
    remoteIds.add(r.id);
    const l = localById.get(r.id);
    if (!l) {
      plan.toLocal.push(r);
      continue;
    }
    const dr = ts(r.updatedAt);
    const dl = ts(l.updatedAt);
    if (dr > dl) plan.toLocal.push(r);
    else if (dl > dr) plan.toRemote.push(l);
  }

  for (const l of local) {
    if (remoteIds.has(l.id)) continue;
    if (seen.has(l.id)) plan.deleteLocal.push(l.id);
    else plan.toRemote.push(l);
  }

  plan.remoteIds = [...remoteIds];
  return plan;
}
