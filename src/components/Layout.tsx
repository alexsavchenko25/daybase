import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { MODULES } from "../modules";

// App-Shell mit Sidebar-Navigation. Die einzelnen Modul-Seiten werden über
// <Outlet /> in den Hauptbereich gerendert.
export default function Layout() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || "dark",
  );
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("daybase.theme", next);
    setTheme(next);
  }

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
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>
        <div className="sidebar-foot">lokal · IndexedDB</div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
