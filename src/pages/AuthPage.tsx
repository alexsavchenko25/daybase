import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured, useSession } from "../supabase";
import PageHeader from "../components/PageHeader";
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
    <div className="page settings-page">
      <PageHeader
        icon="🔐"
        title={tr("Konto", "Account")}
        subtitle={tr("Cloud Sync ist optional — ohne Login läuft alles lokal weiter.", "Cloud sync is optional — everything continues to work locally without signing in.")}
      />

      {!isSupabaseConfigured ? (
        <section className="set-card set-hint">
          <span className="set-hint-icon">☁️</span>
          <p>
            {tr("Cloud Sync ist", "Cloud sync is")} <strong>{tr("nicht konfiguriert", "not configured")}</strong>. {tr("Lege eine", "Create a")}{" "}
            <code>.env</code> mit <code>VITE_SUPABASE_URL</code> und{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> an (siehe <code>.env.example</code>),
            {tr("dann ist hier Login möglich. Deine lokalen Daten bleiben unberührt.", "to enable sign-in here. Your local data remains untouched.")}
          </p>
        </section>
      ) : loading ? (
        <section className="set-card">
          <p className="muted">{tr("Lade Login-Status…", "Loading sign-in status…")}</p>
        </section>
      ) : session ? (
        <section className="set-card">
          <div className="set-title">{tr("Eingeloggt", "Signed in")}</div>
          <p className="muted set-sub">
            {tr("Angemeldet als", "Signed in as")} <strong>{session.user.email}</strong>.
          </p>
          <div className="set-actions">
            <button className="chip" onClick={logout}>
              Logout
            </button>
            <Link to="/" className="chip">
              {tr("Zum Dashboard", "Go to Dashboard")} →
            </Link>
          </div>
        </section>
      ) : (
        <section className="set-card">
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
            <input
              className="task-input full"
              type="email"
              placeholder="E-Mail"
              value={email}
              autoComplete="email"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="task-input full"
              type="password"
              placeholder={tr("Passwort", "Password")}
              value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn full" type="submit" disabled={busy}>
              {busy ? "…" : mode === "login" ? tr("Einloggen", "Sign in") : tr("Konto erstellen", "Create account")}
            </button>
          </form>
        </section>
      )}

      {msg && (
        <p className={`set-msg ${msg.tone === "ok" ? "pos" : "neg"}`}>{msg.text}</p>
      )}
    </div>
  );
}
