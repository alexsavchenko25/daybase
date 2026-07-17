// Wiederverwendbarer Fortschrittsbalken 0-100.
export default function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="pbar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
    >
      <div className="pbar-fill" style={{ width: `${v}%` }} />
    </div>
  );
}
