import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

interface PageHeaderProps {
  icon: IconName;
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
          <span className="page-icon"><Icon name={icon} size={20} /></span>
          <span>{title}</span>
        </h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-head-controls">{actions}</div>}
    </header>
  );
}
