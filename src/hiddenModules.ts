// Sichtbarkeit optionaler Sidebar-Module — rein eine Anzeige-Einstellung.
// MODULES (modules.ts) bleibt die unveränderte Single Source of Truth für
// Routing; hier wird nur eine Menge "versteckter" Pfade in localStorage
// gepflegt, die Layout.tsx beim Rendern der Sidebar herausfiltert. Versteckte
// Module bleiben unter ihrer Route voll erreichbar/funktionsfähig — nur die
// Navigation blendet den Link aus.
import { useSyncExternalStore } from "react";
import { MODULES } from "./modules";

const KEY = "daybase.hiddenModules";
const EVENT = "daybase-hidden-modules-change";

// Kernnavigation — kann nicht ausgeblendet werden, unabhängig von der
// gespeicherten Einstellung. "/today" und "/auth" liegen wie "/" (Dashboard)
// außerhalb von MODULES, werden hier aber sicherheitshalber mitgeführt,
// falls sie je in MODULES aufgenommen werden.
export const REQUIRED_PATHS = new Set([
  "/",
  "/today",
  "/inbox",
  "/tasks",
  "/weekplan",
  "/settings",
  "/auth",
]);

export const TOGGLEABLE_MODULES = MODULES.filter((m) => !REQUIRED_PATHS.has(m.path));
const TOGGLEABLE_PATHS = new Set(TOGGLEABLE_MODULES.map((m) => m.path));

const EMPTY_SET: ReadonlySet<string> = new Set();
let cache: Set<string> | null = null;

function computeHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    // Nur bekannte, aktuell togglebare Pfade übernehmen — schützt vor
    // veralteten/fremden Einträgen (z.B. ein Pfad, der später Pflicht wurde).
    return new Set(arr.filter((p) => TOGGLEABLE_PATHS.has(p)));
  } catch {
    return new Set();
  }
}

// useSyncExternalStore verlangt eine stabile Referenz, solange sich der
// Store nicht ändert — computeHidden() legt daher nur bei Invalidierung neu
// an, nicht bei jedem Aufruf (sonst Endlos-Re-Render).
function getHiddenModules(): ReadonlySet<string> {
  if (!cache) cache = computeHidden();
  return cache;
}

export function isModuleHidden(path: string): boolean {
  return !REQUIRED_PATHS.has(path) && getHiddenModules().has(path);
}

export function setModuleHidden(path: string, hidden: boolean): void {
  if (REQUIRED_PATHS.has(path)) return; // Kernnavigation lässt sich nicht ausblenden.
  const next = new Set(getHiddenModules());
  hidden ? next.add(path) : next.delete(path);
  localStorage.setItem(KEY, JSON.stringify([...next]));
  cache = null;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    cache = null;
    onChange();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// Reaktiver Hook (gleiches useSyncExternalStore-Muster wie useI18n in i18n.ts).
export function useHiddenModules(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getHiddenModules, () => EMPTY_SET);
}
