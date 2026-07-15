import { NavLink, Outlet } from "react-router-dom";
import { MODULES } from "../modules";
import { isSupabaseConfigured, useSession } from "../supabase";

// Sidebar-Gruppen: reine Präsentations-Reihenfolge. Labels/Icons/Routen kommen
// weiter aus MODULES (Single Source of Truth), hier wird nur gruppiert.
const GROUPS: { label: string; paths: string[] }[] = [
  { label: "Planung", paths: ["/tasks", "/weekplan", "/goals", "/projects"] },
  { label: "Tracking", paths: ["/habits", "/focus", "/trades"] },
  { label: "Journal", paths: ["/journal", "/notes", "/review", "/weekly-review"] },
];

const byPath = new Map(MODULES.map((m) => [m.path, m]));

function ModuleLink({ path }: { path: string }) {
  const m = byPath.get(path);
  if (!m) return null;
  return (
    <NavLink to={m.path} className="nav-link" title={m.label}>
      <span className="nav-icon">{m.icon}</span> {m.label}
    </NavLink>
  );
}

// App-Shell mit Sidebar-Navigation. Die einzelnen Modul-Seiten werden über
// <Outlet /> in den Hauptbereich gerendert.
export default function Layout() {
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
              <div className="nav-section">{g.label}</div>
              {g.paths.map((p) => (
                <ModuleLink key={p} path={p} />
              ))}
            </div>
          ))}
          <div className="nav-spacer" />
          <NavLink to="/auth" className="nav-link" title="Konto">
            <span className="nav-icon">🔐</span> Konto
          </NavLink>
          <NavLink to="/settings" className="nav-link" title="Einstellungen">
            <span className="nav-icon">⚙️</span> Einstellungen
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <span className={`foot-dot ${syncOn ? "on" : ""}`} />
          {syncOn ? "Cloud Sync aktiv" : "lokal · IndexedDB"}
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
