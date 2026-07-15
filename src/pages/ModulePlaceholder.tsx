import type { ModuleDef } from "../modules";
import PageHeader from "../components/PageHeader";

// Generische Platzhalter-Seite für alle 6 Module. Die echte modul-spezifische
// UI/Logik kommt in späteren Schritten – hier nur "Modul X – kommt noch".
export default function ModulePlaceholder({ module }: { module: ModuleDef }) {
  return (
    <div className="page">
      <PageHeader icon={module.icon} title={module.label} />
      <div className="placeholder-card">
        <p>
          Modul <strong>{module.label}</strong> – kommt noch.
        </p>
        <p className="muted">
          Entry-Typ: <code>{module.type}</code>
        </p>
      </div>
    </div>
  );
}
