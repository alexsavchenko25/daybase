import type { ModuleDef } from "../modules";
import { useI18n } from "../i18n";
import PageHeader from "../components/PageHeader";

// Generische Platzhalter-Seite für alle 6 Module. Die echte modul-spezifische
// UI/Logik kommt in späteren Schritten – hier nur "Modul X – kommt noch".
export default function ModulePlaceholder({ module }: { module: ModuleDef }) {
  const { tr } = useI18n();
  const label = tr(module.label, module.labelEn);
  return (
    <div className="page">
      <PageHeader icon={module.icon} title={label} />
      <div className="placeholder-card">
        <p>
          {tr("Modul", "Module")} <strong>{label}</strong> – {tr("kommt noch.", "coming soon.")}
        </p>
        <p className="muted">
          {tr("Eintragstyp", "Entry type")}: <code>{module.type}</code>
        </p>
      </div>
    </div>
  );
}
