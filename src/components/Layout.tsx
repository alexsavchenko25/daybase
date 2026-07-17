import { NavLink, Outlet } from "react-router-dom";
import { MODULES } from "../modules";
import { isSupabaseConfigured, useSession } from "../supabase";
import { useI18n } from "../i18n";

// Sidebar-Gruppen: reine Präsentations-Reihenfolge. Labels/Icons/Routen kommen
// weiter aus MODULES (Single Source of Truth), hier wird nur gruppiert.
const GROUPS: { label: string; labelEn: string; paths: string[] }[] = [
  { label: "Planung", labelEn: "Planning", paths: ["/tasks", "/weekplan", "/goals", "/projects"] },
  { label: "Tracking", labelEn: "Tracking", paths: ["/habits", "/focus", "/trades"] },
  { label: "Journal", labelEn: "Journal", paths: ["/journal", "/notes", "/review", "/weekly-review"] },
];

const byPath = new Map(MODULES.map((m) => [m.path, m]));

function ModuleLink({ path }: { path: string }) {
  const { tr } = useI18n();
  const m = byPath.get(path);
  if (!m) return null;
  const label = tr(m.label, m.labelEn);
  return (
    <NavLink to={m.path} className="nav-link" title={label}>
      <span className="nav-icon">{m.icon}</span> {label}
    </NavLink>
  );
}

// App-Shell mit Sidebar-Navigation. Die einzelnen Modul-Seiten werden über
// <Outlet /> in den Hauptbereich gerendert.
export default function Layout() {
  const { tr } = useI18n();
  const { session } = useSession();
  const syncOn = isSupabaseConfigured && !!session;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">▦</span> Daybase
        </div>
        <nav className="nav">
          <NavLink to="/" end className="nav-link" title="Dashboard">
            <span className="nav-icon">🏠</span> Dashboard
          </NavLink>
          {GROUPS.map((g) => (
            <div key={g.label} style={{ display: "contents" }}>
              <div className="nav-section">{tr(g.label, g.labelEn)}</div>
              {g.paths.map((p) => (
                <ModuleLink key={p} path={p} />
              ))}
            </div>
          ))}
          <div className="nav-spacer" />
          <NavLink to="/auth" className="nav-link" title={tr("Konto", "Account")}>
            <span className="nav-icon">🔐</span> {tr("Konto", "Account")}
          </NavLink>
          <NavLink to="/settings" className="nav-link" title={tr("Einstellungen", "Settings")}>
            <span className="nav-icon">⚙️</span> {tr("Einstellungen", "Settings")}
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <span className={`foot-dot ${syncOn ? "on" : ""}`} />
          {syncOn ? tr("Cloud Sync aktiv", "Cloud sync active") : tr("lokal · IndexedDB", "local · IndexedDB")}
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
