import { useState } from "react";
import { loadDemoData } from "../seed";
import { useI18n } from "../i18n";

const LS_KEY = "daybase.onboarded";

export function markOnboarded() {
  localStorage.setItem(LS_KEY, "1");
}
export function resetOnboarding() {
  localStorage.removeItem(LS_KEY);
}
export function isOnboarded() {
  return !!localStorage.getItem(LS_KEY);
}

export default function Onboarding({ onClose }: { onClose: () => void }) {
  const { tr } = useI18n();
  const steps = [
    { icon: "▦", title: tr("Willkommen bei Daybase", "Welcome to Daybase"), body: tr("Dein persönliches Produktivitäts-System — komplett offline. Tasks, Gewohnheiten, Ziele, Trading-Journal, Focus-Sessions und tägliche Reviews, alles an einem Ort. Kein Account, keine Cloud, keine Kosten.", "Your personal productivity system — fully offline. Tasks, habits, goals, trading, focus sessions and reviews in one place. No account, no cloud, no cost.") },
    { icon: "✅", title: tr("Erste Schritte", "Get started"), body: tr("Lege eine Task an, erstelle ein Ziel oder starte eine Focus-Session. Alle Module sind über die Sidebar erreichbar. Du kannst Daten jederzeit importieren, falls du bereits ein Backup hast.", "Create a task, add a goal or start a focus session. Every module is available from the sidebar. You can import an existing backup at any time.") },
    { icon: "💾", title: tr("Daten sichern", "Protect your data"), body: tr("Daybase speichert alles lokal in deinem Browser (IndexedDB). Erstelle regelmäßig ein Backup über Einstellungen → Export JSON. Nur du hast Zugriff auf deine Daten.", "Daybase stores everything locally in your browser (IndexedDB). Create regular backups in Settings → Export JSON. Only you can access your data.") },
  ];
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [demoWarn, setDemoWarn] = useState(false);
  const isLast = step === steps.length - 1;
  const s = steps[step];

  function finish() {
    markOnboarded();
    onClose();
  }

  async function handleDemo() {
    setLoading(true);
    await loadDemoData();
    finish();
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-icon">{s.icon}</div>
        <h2 className="onboarding-title">{s.title}</h2>
        <p className="onboarding-body">{s.body}</p>

        {isLast && demoWarn && (
          <p className="onboarding-warn">
            {tr("⚠️ Demo-Daten werden zu vorhandenen Daten hinzugefügt (Merge). Bestehende Einträge bleiben erhalten und werden nicht überschrieben.", "⚠️ Demo data will be added to your existing data (merge). Existing entries will be kept and not overwritten.")}
          </p>
        )}

        <div className="onboarding-dots">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot ${i === step ? "onboarding-dot-active" : ""}`}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="chip" onClick={() => setStep(step - 1)}>
              ← {tr("Zurück", "Back")}
            </button>
          )}
          {!isLast && (
            <button className="btn" onClick={() => setStep(step + 1)}>
              {tr("Weiter", "Next")} →
            </button>
          )}
          {isLast && (
            <>
              <button className="btn" onClick={finish}>
                {tr("Loslegen", "Get started")}
              </button>
              {!demoWarn ? (
                <button className="chip" onClick={() => setDemoWarn(true)}>
                  {tr("Demo-Daten laden", "Load demo data")}
                </button>
              ) : (
                <button className="chip" onClick={handleDemo} disabled={loading}>
                  {loading ? tr("Laden…", "Loading…") : tr("Ja, hinzufügen", "Yes, add")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
