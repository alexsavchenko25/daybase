import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { pwaUpdate, startPwaAutoChecks, usePwaUpdateStatus } from "../pwaUpdate";
import { useI18n } from "../i18n";

// Einzige Stelle im Projekt, die useRegisterSW() aufruft. Registrierung,
// needRefresh und die Install-Funktion werden in den gemeinsamen Store
// (pwaUpdate.ts) veröffentlicht — Settings liest denselben Zustand, statt
// eine zweite Registrierung aufzumachen.
export default function PwaUpdater() {
  const { tr } = useI18n();
  const status = usePwaUpdateStatus();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, registration) => {
      // In Dev ist der SW aus → registration ist undefined. Kein Fehler,
      // der Store bleibt schlicht auf "unavailable".
      pwaUpdate.setRegistration(registration ?? null);
    },
    onRegisterError: () => {
      pwaUpdate.markRegistrationError();
    },
  });

  useEffect(() => {
    pwaUpdate.setInstaller(updateServiceWorker);
  }, [updateServiceWorker]);

  useEffect(() => {
    if (needRefresh) pwaUpdate.markUpdateAvailable();
  }, [needRefresh]);

  // Sichtbarkeits-/Online-/Intervall-Prüfungen; Cleanup löst alles wieder.
  useEffect(() => startPwaAutoChecks(), []);

  if (status.state !== "available" && status.state !== "installing") return null;

  const installing = status.state === "installing";
  return (
    <div className="pwa-update-banner" role="status">
      <span>{tr("Neue Version verfügbar.", "A new version is available.")}</span>
      <button
        className="btn sm"
        type="button"
        disabled={installing}
        onClick={() => void pwaUpdate.installUpdate()}
      >
        {installing
          ? tr("Wird installiert…", "Installing…")
          : tr("Update installieren", "Install update")}
      </button>
    </div>
  );
}
