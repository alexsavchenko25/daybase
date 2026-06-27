import { useState } from "react";
import { loadDemoData } from "../seed";

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

const STEPS = [
  {
    icon: "▦",
    title: "Willkommen bei Daybase",
    body: "Dein persönliches Produktivitäts-System — komplett offline. Tasks, Gewohnheiten, Ziele, Trading-Journal, Focus-Sessions und tägliche Reviews, alles an einem Ort. Kein Account, keine Cloud, keine Kosten.",
  },
  {
    icon: "✅",
    title: "Erste Schritte",
    body: "Lege eine Task an, erstelle ein Ziel oder starte eine Focus-Session. Alle Module sind über die Sidebar erreichbar. Du kannst Daten jederzeit importieren, falls du bereits ein Backup hast.",
  },
  {
    icon: "💾",
    title: "Daten sichern",
    body: "Daybase speichert alles lokal in deinem Browser (IndexedDB). Erstelle regelmäßig ein Backup über Einstellungen → Export JSON. Nur du hast Zugriff auf deine Daten.",
  },
];

export default function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [demoWarn, setDemoWarn] = useState(false);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

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
            ⚠️ Demo-Daten werden zu vorhandenen Daten hinzugefügt (Merge).
            Bestehende Einträge bleiben erhalten und werden nicht überschrieben.
          </p>
        )}

        <div className="onboarding-dots">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot ${i === step ? "onboarding-dot-active" : ""}`}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="chip" onClick={() => setStep(step - 1)}>
              ← Zurück
            </button>
          )}
          {!isLast && (
            <button className="btn" onClick={() => setStep(step + 1)}>
              Weiter →
            </button>
          )}
          {isLast && (
            <>
              <button className="btn" onClick={finish}>
                Loslegen
              </button>
              {!demoWarn ? (
                <button className="chip" onClick={() => setDemoWarn(true)}>
                  Demo-Daten laden
                </button>
              ) : (
                <button className="chip" onClick={handleDemo} disabled={loading}>
                  {loading ? "Laden…" : "Ja, hinzufügen"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
