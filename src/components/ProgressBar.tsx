// Wiederverwendbarer Fortschrittsbalken 0-100.
export default function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="pbar" role="progressbar" aria-valuenow={v}>
      <div className="pbar-fill" style={{ width: `${v}%` }} />
    </div>
  );
}
