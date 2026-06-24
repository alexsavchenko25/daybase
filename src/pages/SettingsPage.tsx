import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { exportBackup, importBackup } from "../repository";
import { todayIso } from "../utils/date";

export default function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );

  const count = useLiveQuery(() => db.entries.count(), [], 0);

  async function doExport() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daybase-backup-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg({ tone: "ok", text: `Exportiert: ${backup.entries.length} Einträge.` });
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const n = await importBackup(data);
      setMsg({ tone: "ok", text: `Importiert: ${n} Einträge (zusammengeführt).` });
    } catch (err) {
      setMsg({
        tone: "err",
        text: `Import fehlgeschlagen: ${(err as Error).message}`,
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
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
          <span className="set-version">v{__APP_VERSION__}</span>
        </div>
      </section>

      <section className="set-card">
        <div className="set-title">Backup</div>
        <p className="muted set-sub">
          Aktuell: <strong>{count}</strong> Einträge auf diesem Gerät.
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
    </div>
  );
}
