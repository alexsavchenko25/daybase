import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { MODULES } from "../modules";
import { isSupabaseConfigured, useSession } from "../supabase";
import { useI18n } from "../i18n";
import Icon from "./Icon";

// Sidebar-Gruppen: reine Präsentations-Reihenfolge. Labels/Icons/Routen kommen
// weiter aus MODULES (Single Source of Truth), hier wird nur gruppiert.
const GROUPS: { label: string; labelEn: string; paths: string[] }[] = [
  { label: "Planung", labelEn: "Planning", paths: ["/tasks", "/weekplan", "/goals", "/projects"] },
  { label: "Tracking", labelEn: "Tracking", paths: ["/habits", "/focus", "/trades"] },
  { label: "Journal", labelEn: "Journal", paths: ["/journal", "/notes", "/review", "/weekly-review"] },
];

const byPath = new Map(MODULES.map((m) => [m.path, m]));

function ModuleLink({ path, onNavigate }: { path: string; onNavigate: () => void }) {
  const { tr } = useI18n();
  const m = byPath.get(path);
  if (!m) return null;
  const label = tr(m.label, m.labelEn);
  return (
    <NavLink to={m.path} className="nav-link" title={label} onClick={onNavigate}>
      <span className="nav-icon"><Icon name={m.icon} /></span>
      <span className="nav-label">{label}</span>
    </NavLink>
  );
}

// App-Shell mit Sidebar-Navigation. Die einzelnen Modul-Seiten werden über
// <Outlet /> in den Hauptbereich gerendert.
export default function Layout() {
  const { tr } = useI18n();
  const { session } = useSession();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const syncOn = isSupabaseConfigured && !!session;

  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [navOpen]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{tr("Zum Inhalt springen", "Skip to content")}</a>
      <header className="mobile-bar">
        <span className="mobile-brand"><span className="brand-mark"><Icon name="dashboard" size={16} /></span> Daybase</span>
        <button
          className="icon-btn"
          type="button"
          aria-label={tr("Navigation öffnen", "Open navigation")}
          aria-controls="app-sidebar"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <Icon name="menu" />
        </button>
      </header>
      {navOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label={tr("Navigation schließen", "Close navigation")}
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside id="app-sidebar" className={`sidebar ${navOpen ? "is-open" : ""}`} aria-label={tr("Seitennavigation", "Site navigation")}>
        <div className="brand">
          <span className="brand-mark"><Icon name="dashboard" size={16} /></span>
          <span className="brand-label">Daybase</span>
          <button
            className="icon-btn sidebar-close"
            type="button"
            aria-label={tr("Navigation schließen", "Close navigation")}
            onClick={() => setNavOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav className="nav" aria-label={tr("Hauptnavigation", "Main navigation")}>
          <NavLink to="/" end className="nav-link" title="Dashboard" onClick={() => setNavOpen(false)}>
            <span className="nav-icon"><Icon name="dashboard" /></span>
            <span className="nav-label">Dashboard</span>
          </NavLink>
          {GROUPS.map((g) => (
            <div key={g.label} className="nav-group">
              <div className="nav-section">{tr(g.label, g.labelEn)}</div>
              {g.paths.map((p) => (
                <ModuleLink key={p} path={p} onNavigate={() => setNavOpen(false)} />
              ))}
            </div>
          ))}
          <div className="nav-spacer" />
          <div className="nav-section nav-system-label">{tr("System", "System")}</div>
          <NavLink to="/auth" className="nav-link" title={tr("Konto", "Account")} onClick={() => setNavOpen(false)}>
            <span className="nav-icon"><Icon name="account" /></span>
            <span className="nav-label">{tr("Konto", "Account")}</span>
          </NavLink>
          <NavLink to="/settings" className="nav-link" title={tr("Einstellungen", "Settings")} onClick={() => setNavOpen(false)}>
            <span className="nav-icon"><Icon name="settings" /></span>
            <span className="nav-label">{tr("Einstellungen", "Settings")}</span>
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <span className={`sync-icon ${syncOn ? "on" : ""}`}><Icon name={syncOn ? "cloud" : "database"} size={15} /></span>
          <span className="sync-copy">
            <strong>{syncOn ? tr("Cloud Sync", "Cloud sync") : tr("Lokaler Modus", "Local mode")}</strong>
            <small>{syncOn ? tr("Aktiv", "Active") : "IndexedDB"}</small>
          </span>
        </div>
      </aside>
      <main className="content" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
