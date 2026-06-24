import { NavLink, Outlet } from "react-router-dom";
import { MODULES } from "../modules";

// App-Shell mit Sidebar-Navigation. Die einzelnen Modul-Seiten werden über
// <Outlet /> in den Hauptbereich gerendert.
export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">▦</span> Daybase
        </div>
        <nav className="nav">
          <NavLink to="/" end className="nav-link">
            <span className="nav-icon">🏠</span> Dashboard
          </NavLink>
          {MODULES.map((m) => (
            <NavLink key={m.path} to={m.path} className="nav-link">
              <span className="nav-icon">{m.icon}</span> {m.label}
            </NavLink>
          ))}
          <NavLink to="/settings" className="nav-link">
            <span className="nav-icon">⚙️</span> Einstellungen
          </NavLink>
        </nav>
        <div className="sidebar-foot">lokal · IndexedDB</div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
