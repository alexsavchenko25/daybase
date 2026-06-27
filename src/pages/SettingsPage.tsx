import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { exportBackup, importBackup, validateBackup } from "../repository";
import type { Backup, BackupSummary } from "../repository";
import { todayIso } from "../utils/date";
import { markBackup, lastBackup, daysSinceBackup } from "../utils/backup";
import { resetOnboarding } from "../components/Onboarding";
import { loadDemoData } from "../seed";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured, useSession } from "../supabase";
import { pushAllLocalTasks } from "../taskSync";

export default function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary } | null>(null);
  const [backupAt, setBackupAt] = useState(lastBackup());
  const [demoPending, setDemoPending] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || "dark",
  );

  function setThemeMode(mode: "dark" | "light") {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem("daybase.theme", mode);
    setTheme(mode);
  }

  const count = useLiveQuery(() => db.entries.count(), [], 0);
  const { session } = useSession();
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);

  async function doMigrateTasks() {
    setMigrating(true);
    setMigrateMsg(null);
    try {
      const n = await pushAllLocalTasks();
      setMigrateMsg(
        n === 0 ? "Keine lokalen Tasks vorhanden." : `${n} Tasks in die Cloud übertragen.`,
      );
    } catch (err) {
      setMigrateMsg(`Fehler: ${(err as Error).message}`);
    } finally {
      setMigrating(false);
    }
  }

  async function doExport() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${todayIso()}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
    a.download = `daybase-backup-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    markBackup();
    setBackupAt(lastBackup());
    setMsg({ tone: "ok", text: `Exportiert: ${backup.entries.length} Einträge.` });
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    setMsg(null);
    try {
      const data = JSON.parse(await file.text());
      const result = validateBackup(data);
      if (!result.ok) {
        setMsg({ tone: "err", text: result.error });
        return;
      }
      setPending({ backup: result.backup, summary: result.summary });
    } catch {
      setMsg({ tone: "err", text: "Datei konnte nicht gelesen werden (kein gültiges JSON)." });
    }
  }

  async function doImport() {
    if (!pending) return;
    try {
      const n = await importBackup(pending.backup);
      setMsg({ tone: "ok", text: `Importiert: ${n} Einträge (zusammengeführt).` });
    } catch (err) {
      setMsg({ tone: "err", text: `Import fehlgeschlagen: ${(err as Error).message}` });
    } finally {
      setPending(null);
    }
  }

  async function doLoadDemo() {
    setDemoLoading(true);
    setDemoMsg(null);
    try {
      const n = await loadDemoData();
      setDemoMsg(`Demo-Daten geladen: ${n} Beispiel-Einträge hinzugefügt.`);
    } catch (err) {
      setDemoMsg(`Fehler: ${(err as Error).message}`);
    } finally {
      setDemoLoading(false);
      setDemoPending(false);
    }
  }

  return (
    <div className="page settings-page">
      <header className="page-head">
        <h1>
          <span className="page-icon">⚙️</span> Einstellungen
        </h1>
      </header>

      <section className="set-card">
        <div className="set-row">
          <div>
            <div className="set-title">App-Version</div>
            <div className="muted">Daybase</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="set-version">v{__APP_VERSION__}</span>
            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 2 }}>{__BUILD_DATE__}</div>
          </div>
        </div>
      </section>

      <section className="set-card">
        <div className="set-title">Konto / Cloud Sync</div>
        {!isSupabaseConfigured ? (
          <p className="muted set-sub">
            Cloud Sync ist nicht konfiguriert — die App läuft rein lokal. Mehr
            unter <Link to="/auth">Konto</Link>.
          </p>
        ) : session ? (
          <>
            <p className="muted set-sub">
              Eingeloggt als <strong>{session.user.email}</strong>. Neue & geänderte
              Tasks werden automatisch in die Cloud gespiegelt.
            </p>
            <div className="set-actions">
              <button className="btn" onClick={doMigrateTasks} disabled={migrating}>
                {migrating ? "Übertrage…" : "Lokale Tasks in Cloud übertragen"}
              </button>
              <button className="chip" onClick={() => supabase?.auth.signOut()}>
                Logout
              </button>
            </div>
            {migrateMsg && <p className="set-msg pos">{migrateMsg}</p>}
          </>
        ) : (
          <p className="muted set-sub">
            Nicht eingeloggt — Daten bleiben lokal.{" "}
            <Link to="/auth">Einloggen →</Link>
          </p>
        )}
      </section>

      <section className="set-card">
        <div className="set-title">Darstellung</div>
        <p className="muted set-sub">Theme dieser App auf diesem Gerät.</p>
        <div className="theme-switch">
          <button
            className={`chip ${theme === "dark" ? "chip-active" : ""}`}
            onClick={() => setThemeMode("dark")}
          >
            🌙 Dark
          </button>
          <button
            className={`chip ${theme === "light" ? "chip-active" : ""}`}
            onClick={() => setThemeMode("light")}
          >
            ☀️ Light
          </button>
        </div>
      </section>

      <section className="set-card">
        <div className="set-title">Backup</div>
        <p className="muted set-sub">
          Aktuell: <strong>{count}</strong> Einträge auf diesem Gerät.
          <br />
          Letztes Backup:{" "}
          <strong>
            {backupAt
              ? `${new Date(backupAt).toLocaleDateString("de-DE")} (vor ${daysSinceBackup()} Tagen)`
              : "noch nie"}
          </strong>
        </p>
        <div className="set-actions">
          <button className="btn" onClick={doExport}>
            ⬇ Export JSON
          </button>
          <button className="chip" onClick={() => fileRef.current?.click()}>
            ⬆ Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onImportFile}
          />
        </div>
        {pending && (
          <div className="import-preview">
            <p className="import-preview-title">Backup-Inhalt ({pending.summary.total} Einträge):</p>
            <ul className="import-preview-list">
              {(
                [
                  ["task", "Tasks"],
                  ["note", "Notizen"],
                  ["trade", "Trades"],
                  ["goal", "Goals"],
                  ["project", "Projects"],
                  ["review", "Daily Reviews"],
                  ["weeklyreview", "Weekly Reviews"],
                  ["focus", "Focus Sessions"],
                ] as [string, string][]
              )
                .filter(([type]) => pending.summary.byType[type])
                .map(([type, label]) => (
                  <li key={type}>
                    <span>{label}</span>
                    <strong>{pending.summary.byType[type]}</strong>
                  </li>
                ))}
            </ul>
            <div className="rv-actions">
              <button className="btn" onClick={doImport}>
                Importieren ({pending.summary.total})
              </button>
              <button className="chip" onClick={() => setPending(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
        {msg && (
          <p className={`set-msg ${msg.tone === "ok" ? "pos" : "neg"}`}>
            {msg.text}
          </p>
        )}
        <p className="muted set-note">
          Import führt zusammen (gleiche ID wird überschrieben, Rest bleibt
          erhalten).
        </p>
      </section>

      <section className="set-card set-hint">
        <span className="set-hint-icon">💾</span>
        <p>
          Deine Daten werden aktuell <strong>nur lokal auf diesem Gerät</strong>{" "}
          gespeichert (IndexedDB). Kein Server, keine Cloud, kein Sync zwischen
          Geräten. Nutze Export/Import, um Daten zu sichern oder auf ein anderes
          Gerät zu übertragen.
        </p>
      </section>

      <section className="set-card">
        <div className="set-title">Demo-Daten</div>
        <p className="muted set-sub">
          Beispiel-Einträge für alle Module laden (Tasks, Habits, Goal, Project,
          Reviews, Trades, Focus-Sessions), um Daybase auszuprobieren.
        </p>
        {!demoPending ? (
          <div className="set-actions">
            <button className="chip" onClick={() => setDemoPending(true)}>
              Demo-Daten laden
            </button>
          </div>
        ) : (
          <div className="import-preview">
            <p className="import-preview-title">⚠️ Demo-Daten laden?</p>
            <p className="muted set-sub">
              Beispieldaten werden <strong>zu deinen vorhandenen Daten
              hinzugefügt</strong> (Merge). Bestehende Einträge bleiben erhalten
              und werden <strong>nicht überschrieben</strong>.
            </p>
            <div className="rv-actions">
              <button className="btn" onClick={doLoadDemo} disabled={demoLoading}>
                {demoLoading ? "Laden…" : "Hinzufügen"}
              </button>
              <button className="chip" onClick={() => setDemoPending(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
        {demoMsg && <p className="set-msg pos">{demoMsg}</p>}
      </section>

      <section className="set-card">
        <div className="set-title">Onboarding</div>
        <p className="muted set-sub">Willkommens-Bildschirm beim nächsten Reload erneut anzeigen.</p>
        <div className="set-actions">
          <button
            className="chip"
            onClick={() => {
              resetOnboarding();
              setDemoMsg(null);
              setMsg(null);
              setResetDone(true);
            }}
          >
            {resetDone ? "Zurückgesetzt ✓" : "Onboarding zurücksetzen"}
          </button>
        </div>
      </section>
    </div>
  );
}
