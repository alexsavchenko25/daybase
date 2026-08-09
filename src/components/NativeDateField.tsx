import { useI18n } from "../i18n";

interface NativeDateFieldProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  title?: string;
  placeholder?: string;
}

// iOS Safari renders type=date values through internal shadow parts that
// ignore font-size — no CSS combination reliably matches it to sibling
// controls (see the ::-webkit-datetime-edit-* rules in index.css, which
// still weren't enough). This hides the native text via color:transparent
// (which iOS DOES respect) and renders our own text on top; the native
// input stays fully functional underneath — tapping anywhere still opens
// the OS date picker.
export default function NativeDateField({ value, onChange, className, title, placeholder }: NativeDateFieldProps) {
  const { locale } = useI18n();
  const display = value
    ? new Date(value + "T00:00:00").toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
    : (placeholder ?? "");

  return (
    <span className="native-date-field">
      <input
        type="date"
        className={`${className ?? ""} native-date-input`.trim()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={title}
      />
      <span className={`native-date-display ${!value ? "muted" : ""}`} aria-hidden="true">
        {display}
      </span>
    </span>
  );
}
