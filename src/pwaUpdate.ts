import { useSyncExternalStore } from "react";

// Zentraler PWA-Update-Zustand. Genau EINE Registrierung ist maßgeblich:
// <PwaUpdater /> besitzt useRegisterSW() und veröffentlicht Registrierung,
// needRefresh und Install-Funktion hier — Banner und Settings lesen beide
// denselben Store (useSyncExternalStore-Muster wie i18n.ts/hiddenModules.ts,
// bewusst kein React Context).
//
// Sicherheits-Grundsatz: dieser Store darf NIE den Service Worker
// deregistrieren, Caches leeren oder Nutzerdaten (IndexedDB, localStorage,
// Auth) anfassen. Er prüft nur auf Updates und aktiviert einen wartenden
// Service Worker auf ausdrücklichen Wunsch.

export type PwaUpdateState =
  | "unavailable" // kein Service-Worker-Support ODER (noch) keine Registrierung (z.B. Dev)
  | "idle" // bereit, aber noch nicht geprüft
  | "checking"
  | "upToDate"
  | "available"
  | "installing"
  | "offline"
  | "error";

export interface PwaUpdateStatus {
  state: PwaUpdateState;
  /** Zeitpunkt der letzten ERFOLGREICHEN Prüfung — nur für diese Sitzung. */
  lastCheckedAt: number | null;
  /** Ob überhaupt eine Registrierung vorliegt (in Dev/ohne SW: false). */
  hasRegistration: boolean;
  /** Ob der Browser Service Worker grundsätzlich unterstützt. */
  supported: boolean;
}

/** Minimale Sicht auf ServiceWorkerRegistration — hält Tests ohne jsdom möglich. */
export interface UpdatableRegistration {
  update: () => Promise<unknown>;
  waiting?: unknown;
  installing?: unknown;
}

export interface PwaUpdateDeps {
  now: () => number;
  isOnline: () => boolean;
  supported: boolean;
}

// Automatische Prüfungen laufen zurückhaltend: ein 60-Minuten-Intervall
// solange die App sichtbar ist, plus Ereignis-Trigger (sichtbar/online).
export const AUTO_CHECK_INTERVAL_MS = 60 * 60 * 1000;
// Erste Prüfung kurz nach der Registrierung — nicht sofort, damit der Start
// nicht mit Netzwerk-Arbeit konkurriert.
export const INITIAL_CHECK_DELAY_MS = 1500;
// Entprellung: mehrere Ereignisse kurz hintereinander (z.B. online +
// visibilitychange) lösen nur EINE Anfrage aus. Manuelle Prüfungen (force)
// umgehen die Entprellung, damit der Button immer reagiert.
export const CHECK_DEBOUNCE_MS = 30 * 1000;

export function createPwaUpdateController(deps: PwaUpdateDeps) {
  let registration: UpdatableRegistration | null = null;
  let installer: ((reload: boolean) => Promise<void> | void) | null = null;
  let lastAttemptAt: number | null = null;
  let installRequested = false;
  let initialCheckTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<() => void>();
  // Start immer "unavailable": erst wenn eine Registrierung eintrifft, ist
  // die Update-Prüfung überhaupt möglich. In Dev (SW aus) bleibt es dabei.
  let snapshot: PwaUpdateStatus = {
    state: "unavailable",
    lastCheckedAt: null,
    hasRegistration: false,
    supported: deps.supported,
  };

  function emit() {
    listeners.forEach((l) => l());
  }

  // Snapshot-Identität nur bei echter Änderung wechseln —
  // useSyncExternalStore verlangt referenzielle Stabilität.
  function patch(next: Partial<PwaUpdateStatus>) {
    const merged = { ...snapshot, ...next };
    if (
      merged.state === snapshot.state &&
      merged.lastCheckedAt === snapshot.lastCheckedAt &&
      merged.hasRegistration === snapshot.hasRegistration &&
      merged.supported === snapshot.supported
    ) {
      return;
    }
    snapshot = merged;
    emit();
  }

  function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }

  function getSnapshot(): PwaUpdateStatus {
    return snapshot;
  }

  /** Wird von <PwaUpdater /> aufgerufen, sobald die Registrierung existiert. */
  function setRegistration(reg: UpdatableRegistration | null) {
    registration = reg;
    if (!reg) {
      patch({ hasRegistration: false, state: "unavailable" });
      return;
    }
    // Ein bereits wartender Worker heißt: Update liegt schon bereit.
    const alreadyWaiting = !!reg.waiting;
    patch({
      hasRegistration: true,
      state: alreadyWaiting ? "available" : snapshot.state === "unavailable" ? "idle" : snapshot.state,
    });
    if (initialCheckTimer !== null) clearTimeout(initialCheckTimer);
    initialCheckTimer = setTimeout(() => {
      initialCheckTimer = null;
      void checkForUpdate();
    }, INITIAL_CHECK_DELAY_MS);
  }

  function setInstaller(fn: ((reload: boolean) => Promise<void> | void) | null) {
    installer = fn;
  }

  /** needRefresh aus useRegisterSW — ein wartender Worker steht bereit. */
  function markUpdateAvailable() {
    if (snapshot.state === "installing") return; // Installation läuft bereits
    patch({ state: "available" });
  }

  /** Registrierungsfehler aus useRegisterSW — bewusst ohne Stacktrace nach außen. */
  function markRegistrationError() {
    patch({ state: "error" });
  }

  async function checkForUpdate(options: { force?: boolean } = {}): Promise<void> {
    if (!deps.supported || !registration) {
      patch({ state: "unavailable" });
      return;
    }
    // Parallele Prüfungen und Prüfungen während der Installation verhindern.
    if (snapshot.state === "checking" || snapshot.state === "installing") return;
    const startedAt = deps.now();
    if (
      !options.force &&
      lastAttemptAt !== null &&
      startedAt - lastAttemptAt < CHECK_DEBOUNCE_MS
    ) {
      return;
    }
    if (!deps.isOnline()) {
      patch({ state: "offline" });
      return;
    }
    lastAttemptAt = startedAt;
    patch({ state: "checking" });
    try {
      await registration.update();
      // Erst NACH dem Auflösen von update() urteilen. `installing` zählt als
      // Update: der neue Worker lädt bereits, needRefresh folgt gleich.
      const hasUpdate = !!registration.waiting || !!registration.installing;
      patch({
        state: hasUpdate ? "available" : "upToDate",
        lastCheckedAt: deps.now(),
      });
    } catch {
      // Neutrale Fehlermeldung in der UI — kein Stacktrace, kein console.error.
      patch({ state: "error" });
    }
  }

  async function installUpdate(): Promise<void> {
    // Doppelklick- und Reload-Schleifen-Schutz: pro Sitzung genau einmal.
    if (installRequested || snapshot.state === "installing") return;
    // Ohne Registrierung gibt es keinen wartenden Worker, den man aktivieren
    // könnte. useRegisterSW liefert die Install-Funktion auch in Dev zurück —
    // ohne diese Prüfung bliebe der Zustand dort für immer auf "installing".
    if (!installer || !registration) return;
    installRequested = true;
    patch({ state: "installing" });
    try {
      // updateServiceWorker(true) aktiviert den wartenden Worker und lädt
      // die Seite genau einmal neu (vite-plugin-pwa übernimmt den Reload).
      await installer(true);
    } catch {
      installRequested = false;
      patch({ state: "error" });
    }
  }

  /** Nur für Tests/Cleanup: ausstehenden Initial-Check-Timer abräumen. */
  function dispose() {
    if (initialCheckTimer !== null) {
      clearTimeout(initialCheckTimer);
      initialCheckTimer = null;
    }
    listeners.clear();
  }

  return {
    subscribe,
    getSnapshot,
    setRegistration,
    setInstaller,
    markUpdateAvailable,
    markRegistrationError,
    checkForUpdate,
    installUpdate,
    dispose,
  };
}

export type PwaUpdateController = ReturnType<typeof createPwaUpdateController>;

const browserSupported =
  typeof navigator !== "undefined" && typeof window !== "undefined" && "serviceWorker" in navigator;

export const pwaUpdate = createPwaUpdateController({
  now: () => Date.now(),
  isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  supported: browserSupported,
});

const SERVER_SNAPSHOT: PwaUpdateStatus = {
  state: "unavailable",
  lastCheckedAt: null,
  hasRegistration: false,
  supported: false,
};

/** Gemeinsamer Zustand für Banner (App) und Settings — eine Quelle. */
export function usePwaUpdateStatus(): PwaUpdateStatus {
  return useSyncExternalStore(pwaUpdate.subscribe, pwaUpdate.getSnapshot, () => SERVER_SNAPSHOT);
}

export function checkForUpdate(options?: { force?: boolean }): Promise<void> {
  return pwaUpdate.checkForUpdate(options);
}

export function installUpdate(): Promise<void> {
  return pwaUpdate.installUpdate();
}

// Ereignisgesteuerte Prüfungen: beim Zurückkehren in den Vordergrund, beim
// Wiedererlangen der Verbindung und periodisch, solange die App sichtbar
// ist. Gibt eine Cleanup-Funktion zurück, die ALLE Listener und Timer löst.
export function startPwaAutoChecks(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const onVisible = () => {
    if (document.visibilityState === "visible") void pwaUpdate.checkForUpdate();
  };
  const onOnline = () => void pwaUpdate.checkForUpdate();
  const interval = setInterval(() => {
    if (document.visibilityState === "visible") void pwaUpdate.checkForUpdate();
  }, AUTO_CHECK_INTERVAL_MS);

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onVisible);

  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onVisible);
  };
}
