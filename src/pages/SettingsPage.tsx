import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { exportBackup, importBackup, validateBackup } from "../repository";
import type { Backup, BackupSummary } from "../repository";
import { todayIso } from "../utils/date";
import { markBackup, lastBackup, daysSinceBackup } from "../utils/backup";
import { resetOnboarding } from "../components/Onboarding";
import { TOGGLEABLE_MODULES, useHiddenModules, setModuleHidden } from "../hiddenModules";
import { loadDemoData, applyYearlyWeekplanTemplate } from "../seed";
import {
  REMINDER_KINDS,
  isReminderEnabled,
  setReminderEnabled,
  getReminderTime,
  setReminderTime,
  notificationsSupported,
  notificationPermission,
  requestNotificationPermission,
  type ReminderKind,
} from "../reminders";
import PageHeader from "../components/PageHeader";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured, useSession } from "../supabase";
import { pushAllLocal } from "../sync";
import { useI18n } from "../i18n";

export default function SettingsPage() {
  const { language, locale, tr, setLanguage } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary } | null>(null);
  const [backupAt, setBackupAt] = useState(lastBackup());
  const [demoPending, setDemoPending] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);
  const [yearPending, setYearPending] = useState(false);
  const [yearLoading, setYearLoading] = useState(false);
  const [yearMsg, setYearMsg] = useState<string | null>(null);
  const hiddenModules = useHiddenModules();
  const [reminderState, setReminderState] = useState(() =>
    Object.fromEntries(
      REMINDER_KINDS.map((k) => [k, { enabled: isReminderEnabled(k), time: getReminderTime(k) }]),
    ) as Record<ReminderKind, { enabled: boolean; time: string }>,
  );
  const [permission, setPermission] = useState(notificationPermission);
  const [remindersMsg, setRemindersMsg] = useState<string | null>(null);

  async function toggleReminder(kind: ReminderKind) {
    setRemindersMsg(null);
    const current = reminderState[kind];
    if (current.enabled) {
      setReminderEnabled(kind, false);
      setReminderState((s) => ({ ...s, [kind]: { ...s[kind], enabled: false } }));
      return;
    }
    const perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm !== "granted") {
      setRemindersMsg(tr("Berechtigung verweigert — Reminder bleiben aus.", "Permission denied — reminders remain disabled."));
      return;
    }
    setReminderEnabled(kind, true);
    setReminderState((s) => ({ ...s, [kind]: { ...s[kind], enabled: true } }));
  }

  function changeReminderTime(kind: ReminderKind, time: string) {
    setReminderTime(kind, time);
    setReminderState((s) => ({ ...s, [kind]: { ...s[kind], time } }));
  }

  const reminderLabels: Record<ReminderKind, { title: string; desc: string }> = {
    dailyReview: {
      title: "Daily Review",
      desc: tr(
        "Erinnert, wenn bis zur gewählten Uhrzeit noch kein Daily Review für heute ausgefüllt ist.",
        "Reminds you if today's Daily Review hasn't been filled in by the chosen time.",
      ),
    },
    weeklyReview: {
      title: "Weekly Review",
      desc: tr(
        "Erinnert sonntags/montags, wenn bis zur gewählten Uhrzeit noch kein Weekly Review für die Woche ausgefüllt ist.",
        "Reminds you on Sunday/Monday if the Weekly Review for the week hasn't been filled in by the chosen time.",
      ),
    },
    overdueTasks: {
      title: tr("Überfällige Tasks", "Overdue tasks"),
      desc: tr(
        "Erinnert ab der gewählten Uhrzeit, wenn überfällige Tasks offen sind.",
        "Reminds you from the chosen time if overdue tasks are still open.",
      ),
    },
    habits: {
      title: tr("Offene Habits", "Unfinished habits"),
      desc: tr(
        "Erinnert ab der gewählten Uhrzeit, wenn noch offene Habits für heute da sind.",
        "Reminds you from the chosen time if habits are still open for today.",
      ),
    },
  };
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
      const n = await pushAllLocal();
      setMigrateMsg(
        n === 0 ? tr("Keine lokalen Daten vorhanden.", "No local data found.") : tr(`${n} Einträge in die Cloud übertragen.`, `${n} entries uploaded to the cloud.`),
      );
    } catch (err) {
      setMigrateMsg(`${tr("Fehler", "Error")}: ${(err as Error).message}`);
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
    setMsg({ tone: "ok", text: tr(`Exportiert: ${backup.entries.length} Einträge.`, `Exported: ${backup.entries.length} entries.`) });
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
      setMsg({ tone: "err", text: tr("Datei konnte nicht gelesen werden (kein gültiges JSON).", "The file could not be read (invalid JSON).") });
    }
  }

  async function doImport() {
    if (!pending) return;
    try {
      const n = await importBackup(pending.backup);
      setMsg({ tone: "ok", text: tr(`Importiert: ${n} Einträge (zusammengeführt).`, `Imported: ${n} entries (merged).`) });
    } catch (err) {
      setMsg({ tone: "err", text: `${tr("Import fehlgeschlagen", "Import failed")}: ${(err as Error).message}` });
    } finally {
      setPending(null);
    }
  }

  async function doLoadDemo() {
    setDemoLoading(true);
    setDemoMsg(null);
    try {
      const n = await loadDemoData();
      setDemoMsg(tr(`Demo-Daten geladen: ${n} Beispiel-Einträge hinzugefügt.`, `Demo data loaded: ${n} sample entries added.`));
    } catch (err) {
      setDemoMsg(`${tr("Fehler", "Error")}: ${(err as Error).message}`);
    } finally {
      setDemoLoading(false);
      setDemoPending(false);
    }
  }

  async function doApplyYearlyWeekplan() {
    setYearLoading(true);
    setYearMsg(null);
    try {
      const n = await applyYearlyWeekplanTemplate();
      setYearMsg(tr(`Wochenplan-Vorlage für ${n} Wochen (bis Jahresende) angelegt.`, `Weekly plan template created for ${n} weeks (through year end).`));
    } catch (err) {
      setYearMsg(`${tr("Fehler", "Error")}: ${(err as Error).message}`);
    } finally {
      setYearLoading(false);
      setYearPending(false);
    }
  }

  return (
    <div className="page settings-page">
      <PageHeader icon="⚙️" title={tr("Einstellungen", "Settings")} subtitle={tr("App, Cloud Sync und Daten verwalten.", "Manage the app, cloud sync and your data.")} />

      <p className="section-label">App</p>
      <section className="set-card">
        <div className="set-row">
          <div>
            <div className="set-title">{tr("App-Version", "App version")}</div>
            <div className="muted">Daybase</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="set-version">v{__APP_VERSION__}</span>
            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 2 }}>{__BUILD_DATE__}</div>
          </div>
        </div>
      </section>

      <section className="set-card">
        <div className="set-title">{tr("Sprache", "Language")}</div>
        <p className="muted set-sub">{tr("Sprache der gesamten Benutzeroberfläche.", "Language for the entire user interface.")}</p>
        <div className="theme-switch" role="group" aria-label={tr("Sprache auswählen", "Choose language")}>
          <button className={`chip ${language === "de" ? "chip-active" : ""}`} onClick={() => setLanguage("de")}>
            Deutsch
          </button>
          <button className={`chip ${language === "en" ? "chip-active" : ""}`} onClick={() => setLanguage("en")}>
            English
          </button>
        </div>
      </section>

      <section className="set-card">
        <div className="set-title">{tr("Darstellung", "Appearance")}</div>
        <p className="muted set-sub">{tr("Theme dieser App auf diesem Gerät.", "Theme for this app on this device.")}</p>
        <div className="theme-switch">
          <button
            className={`chip ${theme === "dark" ? "chip-active" : ""}`}
            onClick={() => setThemeMode("dark")}
          >
            🌙 {tr("Dunkel", "Dark")}
          </button>
          <button
            className={`chip ${theme === "light" ? "chip-active" : ""}`}
            onClick={() => setThemeMode("light")}
          >
            ☀️ {tr("Hell", "Light")}
          </button>
        </div>
      </section>

      <section className="set-card">
        <div className="set-title">{tr("Sidebar-Module", "Sidebar modules")}</div>
        <p className="muted set-sub">
          {tr(
            "Blende Module aus, die du nicht nutzt. Versteckte Module bleiben voll funktionsfähig — du erreichst sie weiterhin per Link, Command Palette oder direkter URL, nur die Sidebar zeigt sie nicht mehr.",
            "Hide modules you don't use. Hidden modules stay fully functional — you can still reach them via a link, the command palette, or a direct URL, they just no longer show in the sidebar.",
          )}
        </p>
        {TOGGLEABLE_MODULES.map((m) => {
          const isHidden = hiddenModules.has(m.path);
          const label = tr(m.label, m.labelEn);
          return (
            <div key={m.path} className="set-row reminder-row">
              <div className="set-title">
                <span className="set-row-icon" aria-hidden="true">{m.icon}</span> {label}
              </div>
              {/* Zustand am Chip (aktiv = sichtbar), Aktion im Text — vorher
                  trug ein Control beides und wechselte dabei die Breite. */}
              <button
                className={`chip ${isHidden ? "" : "chip-active"}`}
                aria-pressed={!isHidden}
                title={
                  isHidden
                    ? tr(`${label} in der Sidebar einblenden`, `Show ${label} in the sidebar`)
                    : tr(`${label} aus der Sidebar ausblenden`, `Hide ${label} from the sidebar`)
                }
                onClick={() => setModuleHidden(m.path, !isHidden)}
              >
                {isHidden ? tr("Ausgeblendet", "Hidden") : tr("✓ Sichtbar", "✓ Visible")}
              </button>
            </div>
          );
        })}
        <p className="muted set-note">
          {tr(
            "Dashboard, Heute, Inbox, Tasks, Wochenplan und Einstellungen sind Kernnavigation und lassen sich nicht ausblenden.",
            "Dashboard, Today, Inbox, Tasks, Weekly plan and Settings are core navigation and cannot be hidden.",
          )}
        </p>
      </section>

      <section className="set-card">
        <div className="set-title">{tr("Erinnerungen", "Reminders")}</div>
        <p className="muted set-sub">
          {tr(
            "Benachrichtigungen werden nur zugestellt, solange die App bzw. der Browser-Tab geöffnet ist — kein Server, kein Push bei geschlossener App. Echter Push-Support (auch bei geschlossener App) könnte später ergänzt werden.",
            "Notifications are only delivered while the app or browser tab is open — no server and no push while it's closed. True push support (even while closed) could be added later.",
          )}
        </p>
        {!notificationsSupported() ? (
          <p className="muted set-sub">{tr("Browser unterstützt keine Benachrichtigungen.", "This browser does not support notifications.")}</p>
        ) : permission === "denied" ? (
          <p className="muted set-sub">
            {tr(
              "Benachrichtigungen wurden im Browser blockiert. Erlaube sie in den Browser-Einstellungen für diese Seite, um Erinnerungen zu nutzen.",
              "Notifications are blocked in the browser. Allow them in the browser's site settings to use reminders.",
            )}
          </p>
        ) : (
          <>
            {REMINDER_KINDS.map((kind) => (
              <div key={kind} className="set-row reminder-row">
                <div>
                  <div className="set-title">{reminderLabels[kind].title}</div>
                  <p className="muted set-sub">{reminderLabels[kind].desc}</p>
                </div>
                <div className="set-actions">
                  <input
                    className="task-select"
                    type="time"
                    value={reminderState[kind].time}
                    disabled={!reminderState[kind].enabled}
                    aria-label={tr(`Uhrzeit für ${reminderLabels[kind].title}`, `Time for ${reminderLabels[kind].title}`)}
                    onChange={(e) => changeReminderTime(kind, e.target.value)}
                  />
                  <button
                    className={`chip ${reminderState[kind].enabled ? "chip-active" : ""}`}
                    aria-pressed={reminderState[kind].enabled}
                    title={
                      reminderState[kind].enabled
                        ? tr("Erinnerung ausschalten", "Turn reminder off")
                        : tr("Erinnerung einschalten", "Turn reminder on")
                    }
                    onClick={() => toggleReminder(kind)}
                  >
                    {reminderState[kind].enabled ? tr("✓ Aktiv", "✓ On") : tr("Aus", "Off")}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        {remindersMsg && <p className="set-msg neg">{remindersMsg}</p>}
      </section>

      <section className="set-card">
        <div className="set-title">Onboarding</div>
        <p className="muted set-sub">{tr("Willkommens-Bildschirm beim nächsten Reload erneut anzeigen.", "Show the welcome screen again on the next reload.")}</p>
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
            {resetDone ? tr("Zurückgesetzt ✓", "Reset ✓") : tr("Onboarding zurücksetzen", "Reset onboarding")}
          </button>
        </div>
      </section>

      <p className="section-label">Cloud Sync</p>
      <section className="set-card">
        <div className="set-title">{tr("Konto / Cloud Sync", "Account / Cloud sync")}</div>
        {!isSupabaseConfigured ? (
          <p className="muted set-sub">
            {tr("Cloud Sync ist nicht konfiguriert — die App läuft rein lokal. Mehr unter", "Cloud sync is not configured — the app runs locally. Learn more under")} <Link to="/auth">{tr("Konto", "Account")}</Link>.
          </p>
        ) : session ? (
          <>
            <p className="muted set-sub">
              {tr("Eingeloggt als", "Signed in as")} <strong>{session.user.email}</strong>. {tr("Neue & geänderte Daten werden automatisch in die Cloud gespiegelt.", "New and changed data is automatically mirrored to the cloud.")}
            </p>
            <div className="set-actions">
              <button className="btn" onClick={doMigrateTasks} disabled={migrating}>
                {migrating ? tr("Übertrage…", "Uploading…") : tr("Lokale Daten in Cloud übertragen", "Upload local data to cloud")}
              </button>
              <button className="chip" onClick={() => supabase?.auth.signOut()}>
                Logout
              </button>
            </div>
            {migrateMsg && <p className="set-msg pos">{migrateMsg}</p>}
          </>
        ) : (
          <p className="muted set-sub">
            {tr("Nicht eingeloggt — Daten bleiben lokal.", "Not signed in — data remains local.")} {" "}
            <Link to="/auth">{tr("Einloggen", "Sign in")} →</Link>
          </p>
        )}
      </section>

      <p className="section-label">{tr("Daten & Backup", "Data & backup")}</p>
      <section className="set-card">
        <div className="set-title">Backup</div>
        <p className="muted set-sub">
          {tr("Aktuell", "Current")}: <strong>{count}</strong> {tr("Einträge auf diesem Gerät", "entries on this device")}.
          <br />
          {tr("Letztes Backup", "Last backup")}:{" "}
          <strong>
            {backupAt
              ? tr(`${new Date(backupAt).toLocaleDateString(locale)} (vor ${daysSinceBackup()} Tagen)`, `${new Date(backupAt).toLocaleDateString(locale)} (${daysSinceBackup()} days ago)`)
              : tr("noch nie", "never")}
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
            <p className="import-preview-title">{tr("Backup-Inhalt", "Backup contents")} ({pending.summary.total} {tr("Einträge", "entries")}):</p>
            <ul className="import-preview-list">
              {(
                [
                  ["task", "Tasks"],
                  ["note", tr("Notizen", "Notes")],
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
                {tr("Importieren", "Import")} ({pending.summary.total})
              </button>
              <button className="chip" onClick={() => setPending(null)}>
                {tr("Abbrechen", "Cancel")}
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
          {tr("Import führt zusammen (gleiche ID wird überschrieben, Rest bleibt erhalten).", "Import merges data (matching IDs are overwritten, everything else is kept).")}
        </p>
      </section>

      {!session && (
        <section className="set-card set-hint">
          <span className="set-hint-icon">💾</span>
          <p>
            {tr("Deine Daten werden aktuell", "Your data is currently stored")} <strong>{tr("nur lokal auf diesem Gerät", "only locally on this device")}</strong>{" "}
            {tr("gespeichert (IndexedDB). Kein Server, keine Cloud, kein Sync zwischen Geräten. Nutze Export/Import, um Daten zu sichern oder auf ein anderes Gerät zu übertragen.", "(IndexedDB). No server, no cloud and no sync between devices. Use export/import to back up or transfer your data.")}
          </p>
        </section>
      )}

      <section className="set-card">
        <div className="set-title">{tr("Demo-Daten", "Demo data")}</div>
        <p className="muted set-sub">
          {tr("Beispiel-Einträge für alle Module laden, um Daybase auszuprobieren.", "Load sample entries for every module to try Daybase.")}
        </p>
        {!demoPending ? (
          <div className="set-actions">
            <button className="chip" onClick={() => setDemoPending(true)}>
              {tr("Demo-Daten laden", "Load demo data")}
            </button>
          </div>
        ) : (
          <div className="import-preview">
            <p className="import-preview-title">⚠️ {tr("Demo-Daten laden?", "Load demo data?")}</p>
            <p className="muted set-sub">
              {tr("Beispieldaten werden", "Sample data will be")} <strong>{tr("zu deinen vorhandenen Daten hinzugefügt", "added to your existing data")}</strong> ({tr("Zusammenführen", "merge")}). {tr("Bestehende Einträge bleiben erhalten und werden", "Existing entries are kept and will")} <strong>{tr("nicht überschrieben", "not be overwritten")}</strong>.
            </p>
            <div className="rv-actions">
              <button className="btn" onClick={doLoadDemo} disabled={demoLoading}>
                {demoLoading ? tr("Laden…", "Loading…") : tr("Hinzufügen", "Add")}
              </button>
              <button className="chip" onClick={() => setDemoPending(false)}>
                {tr("Abbrechen", "Cancel")}
              </button>
            </div>
          </div>
        )}
        {demoMsg && <p className="set-msg pos">{demoMsg}</p>}
      </section>

      <section className="set-card">
        <div className="set-title">{tr("Wochenplan-Vorlage", "Weekly plan template")}</div>
        <p className="muted set-sub">
          {tr("Deinen Standard-Wochenplan (Mo–So) für jede Woche ab jetzt bis Jahresende anlegen.", "Create your default weekly plan (Mon–Sun) for every week from now through year end.")}
        </p>
        {!yearPending ? (
          <div className="set-actions">
            <button className="chip" onClick={() => setYearPending(true)}>
              {tr("Für Rest des Jahres anlegen", "Create for rest of year")}
            </button>
          </div>
        ) : (
          <div className="import-preview">
            <p className="import-preview-title">⚠️ {tr("Wochenplan-Vorlage anlegen?", "Create weekly plan template?")}</p>
            <p className="muted set-sub">
              {tr("Bestehende Wochenplan-Einträge in jeder betroffenen Woche werden", "Existing weekly plan entries in every affected week will be")} <strong>{tr("komplett überschrieben", "fully overwritten")}</strong> ({tr("gelöscht + neu angelegt", "deleted + recreated")}). {tr("Andere Module sind nicht betroffen.", "Other modules are not affected.")}
            </p>
            <div className="rv-actions">
              <button className="btn" onClick={doApplyYearlyWeekplan} disabled={yearLoading}>
                {yearLoading ? tr("Lege an…", "Creating…") : tr("Überschreiben & anlegen", "Overwrite & create")}
              </button>
              <button className="chip" onClick={() => setYearPending(false)}>
                {tr("Abbrechen", "Cancel")}
              </button>
            </div>
          </div>
        )}
        {yearMsg && <p className="set-msg pos">{yearMsg}</p>}
      </section>
    </div>
  );
}
