// Letztes-Backup-Zeitpunkt in localStorage (kein Server, nur Erinnerung).
export const LAST_BACKUP_KEY = "daybase.lastBackup";

export function markBackup(): void {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

export function lastBackup(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

export function daysSinceBackup(): number | null {
  const v = lastBackup();
  if (!v) return null;
  return Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
}
