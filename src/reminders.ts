// Lokale Reminder-Notifications (Browser Notification API). Kein Server,
// kein Push — feuert nur, wenn die App gerade offen ist (Tab oder
// installierte PWA). Einmal pro Tag beim App-Start geprüft.
import { db } from "./db";
import { todayIso } from "./utils/date";
import { isDoneForPeriod } from "./utils/habit";
import type { HabitMeta, TaskMeta } from "./types";
import { getLanguage } from "./i18n";

const ENABLED_KEY = "daybase.reminders.enabled";
const LAST_SHOWN_KEY = "daybase.reminders.lastShown";

export function remindersEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === "1";
}

export function setRemindersEnabled(on: boolean): void {
  localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
}

export async function enableReminders(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  const perm = await Notification.requestPermission();
  setRemindersEnabled(perm === "granted");
  return perm;
}

// Einmal pro App-Start aufrufen. No-op falls deaktiviert, ohne Permission,
// oder heute schon geprüft.
export async function checkAndNotify(): Promise<void> {
  if (!remindersEnabled()) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const today = todayIso();
  if (localStorage.getItem(LAST_SHOWN_KEY) === today) return;
  localStorage.setItem(LAST_SHOWN_KEY, today);

  const tasks = await db.entries.where("type").equals("task").toArray();
  const overdue = tasks.filter((e) => {
    const m = e.meta as TaskMeta;
    return !m.done && e.date && e.date < today;
  }).length;

  const habits = await db.entries.where("type").equals("habit").toArray();
  const openHabits = habits.filter((e) => {
    const m = e.meta as HabitMeta;
    return !isDoneForPeriod(m.completedDates ?? [], m.frequency, today);
  }).length;

  if (overdue === 0 && openHabits === 0) return;

  const parts: string[] = [];
  const en = getLanguage() === "en";
  if (overdue > 0) parts.push(en ? `${overdue} overdue task${overdue > 1 ? "s" : ""}` : `${overdue} überfällige Task${overdue > 1 ? "s" : ""}`);
  if (openHabits > 0) parts.push(en ? `${openHabits} open habit${openHabits > 1 ? "s" : ""}` : `${openHabits} offene Habit${openHabits > 1 ? "s" : ""}`);

  const notif = new Notification("Daybase", { body: parts.join(" · "), tag: "daybase-reminder" });
  notif.onclick = () => {
    window.focus();
    notif.close();
  };
}
