import type { ReactNode } from "react";

interface PageHeaderProps {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optionale Action-Zeile (z.B. Wochenplan-Navigation) rechts neben dem Titel. */
  actions?: ReactNode;
}

// Einheitlicher Seiten-Header: Icon + Titel + optionaler Untertitel, mit
// gleichem Abstand/Größe auf jeder Seite. Einzige Stelle, die den
// Header-Markup definiert — Seiten liefern nur ihre Inhalte.
export default function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className={`page-head ${actions ? "page-head-actions" : ""}`.trim()}>
      <div className="page-head-title">
        <h1>
          <span className="page-icon">{icon}</span> {title}
        </h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
