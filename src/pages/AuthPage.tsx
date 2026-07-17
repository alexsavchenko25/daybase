import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured, useSession } from "../supabase";
import PageHeader from "../components/PageHeader";
import Icon from "../components/Icon";
import { useI18n } from "../i18n";

// Auth-Seite: Email/Passwort Login + Registrierung gegen Supabase.
// Optional — ohne Login bleibt die App voll lokal nutzbar (IndexedDB).
export default function AuthPage() {
  const { tr } = useI18n();
  const { session, loading } = useSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMsg({ tone: "ok", text: tr("Eingeloggt.", "Signed in.") });
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg({
          tone: "ok",
          text: tr("Registriert. Falls aktiviert, bestätige zuerst die E-Mail.", "Registered. If enabled, confirm your email first."),
        });
      }
      setPassword("");
    } catch (err) {
      setMsg({ tone: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase?.auth.signOut();
    setMsg(null);
  }

  return (
    <div className="page settings-page auth-page">
      <PageHeader
        icon="account"
        title={tr("Konto", "Account")}
        subtitle={tr("Cloud Sync ist optional — ohne Login läuft alles lokal weiter.", "Cloud sync is optional — everything continues to work locally without signing in.")}
      />

      <div className="auth-layout">
        <aside className="auth-local-note">
          <span className="auth-local-icon"><Icon name="database" /></span>
          <div>
            <span className="eyebrow">{tr("Lokaler Modus", "Local mode")}</span>
            <h2>{tr("Daybase funktioniert auch ohne Konto", "Daybase works without an account")}</h2>
            <p>{tr("Ohne Login bleiben alle Daten ausschließlich in IndexedDB auf diesem Gerät. Ein Konto aktiviert optional den Cloud Sync zu Supabase.", "Without signing in, all data stays in IndexedDB on this device. An account optionally enables cloud sync with Supabase.")}</p>
          </div>
        </aside>
        <div className="auth-main">
      {!isSupabaseConfigured ? (
        <section className="set-card set-hint auth-card">
          <span className="set-hint-icon"><Icon name="cloud" /></span>
          <p>
            {tr("Cloud Sync ist", "Cloud sync is")} <strong>{tr("nicht konfiguriert", "not configured")}</strong>. {tr("Lege eine", "Create a")}{" "}
            <code>.env</code> mit <code>VITE_SUPABASE_URL</code> und{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> an (siehe <code>.env.example</code>),
            {tr("dann ist hier Login möglich. Deine lokalen Daten bleiben unberührt.", "to enable sign-in here. Your local data remains untouched.")}
          </p>
        </section>
      ) : loading ? (
        <section className="set-card auth-card loading-state" aria-live="polite">
          <span className="loading-spinner" />
          <p className="muted">{tr("Login-Status wird geladen…", "Loading sign-in status…")}</p>
        </section>
      ) : session ? (
        <section className="set-card auth-card auth-signed-in">
          <span className="status-badge status-success"><Icon name="check" size={14} /> {tr("Synchronisiert", "Synced")}</span>
          <div className="set-title">{tr("Eingeloggt", "Signed in")}</div>
          <p className="muted set-sub">
            {tr("Angemeldet als", "Signed in as")} <strong>{session.user.email}</strong>.
          </p>
          <div className="set-actions">
            <button className="btn ghost" onClick={logout}>
              Logout
            </button>
            <Link to="/" className="btn">
              {tr("Zum Dashboard", "Go to Dashboard")} →
            </Link>
          </div>
        </section>
      ) : (
        <section className="set-card auth-card">
          <div className="theme-switch">
            <button
              className={`chip ${mode === "login" ? "chip-active" : ""}`}
              onClick={() => setMode("login")}
            >
              Login
            </button>
            <button
              className={`chip ${mode === "signup" ? "chip-active" : ""}`}
              onClick={() => setMode("signup")}
            >
              {tr("Registrieren", "Register")}
            </button>
          </div>
          <form onSubmit={submit} className="auth-form">
            <label className="auth-field">
              <span>E-Mail</span>
              <input className="task-input full" type="email" placeholder="name@example.com" value={email} autoComplete="email" required onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="auth-field">
              <span>{tr("Passwort", "Password")}</span>
              <input className="task-input full" type="password" placeholder={tr("Mindestens 6 Zeichen", "At least 6 characters")} value={password} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="btn full" type="submit" disabled={busy}>
              {busy ? "…" : mode === "login" ? tr("Einloggen", "Sign in") : tr("Konto erstellen", "Create account")}
            </button>
          </form>
        </section>
      )}

      {msg && (
        <p className={`set-msg ${msg.tone === "ok" ? "pos" : "neg"}`} role={msg.tone === "err" ? "alert" : "status"} aria-live="polite">{msg.text}</p>
      )}
        </div>
      </div>
    </div>
  );
}
