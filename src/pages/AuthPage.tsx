import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured, useSession } from "../supabase";

// Auth-Seite: Email/Passwort Login + Registrierung gegen Supabase.
// Optional — ohne Login bleibt die App voll lokal nutzbar (IndexedDB).
export default function AuthPage() {
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
        setMsg({ tone: "ok", text: "Eingeloggt." });
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg({
          tone: "ok",
          text: "Registriert. Falls aktiviert, bestätige zuerst die E-Mail.",
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
      <header className="page-head">
        <h1>
          <span className="page-icon">🔐</span> Konto
        </h1>
        <p className="muted">Cloud Sync ist optional — ohne Login läuft alles lokal weiter.</p>
      </header>

      {!isSupabaseConfigured ? (
        <section className="set-card set-hint">
          <span className="set-hint-icon">☁️</span>
          <p>
            Cloud Sync ist <strong>nicht konfiguriert</strong>. Lege eine{" "}
            <code>.env</code> mit <code>VITE_SUPABASE_URL</code> und{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> an (siehe <code>.env.example</code>),
            dann ist hier Login möglich. Deine lokalen Daten bleiben unberührt.
          </p>
        </section>
      ) : loading ? (
        <section className="set-card">
          <p className="muted">Lade Login-Status…</p>
        </section>
      ) : session ? (
        <section className="set-card">
          <div className="set-title">Eingeloggt</div>
          <p className="muted set-sub">
            Angemeldet als <strong>{session.user.email}</strong>.
          </p>
          <div className="set-actions">
            <button className="chip" onClick={logout}>
              Logout
            </button>
            <Link to="/" className="chip">
              Zum Dashboard →
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
              Registrieren
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
              placeholder="Passwort"
              value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn full" type="submit" disabled={busy}>
              {busy ? "…" : mode === "login" ? "Einloggen" : "Konto erstellen"}
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
