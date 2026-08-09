// Lokale Reminder-Notifications (Browser Notification API). Kein Server,
// kein Push — feuert nur, während die App gerade offen ist (Tab oder
// installierte PWA), über einen Intervall-Check gegen die gewählte Uhrzeit.
import { db } from "./db";
import { mondayOfIso, nowHm, todayIso } from "./utils/date";
import { isDoneForPeriod, habitMeta } from "./utils/habit";
import type { TaskMeta } from "./types";
import { getLanguage } from "./i18n";

export type ReminderKind = "dailyReview" | "weeklyReview" | "overdueTasks" | "habits";

export const REMINDER_KINDS: ReminderKind[] = [
  "dailyReview",
  "weeklyReview",
  "overdueTasks",
  "habits",
];

const DEFAULT_TIME: Record<ReminderKind, string> = {
  dailyReview: "20:00",
  weeklyReview: "18:00",
  overdueTasks: "09:00",
  habits: "21:00",
};

function keyOf(kind: ReminderKind, field: "enabled" | "time" | "lastShown"): string {
  return `daybase.reminders.${kind}.${field}`;
}

export function isReminderEnabled(kind: ReminderKind): boolean {
  return localStorage.getItem(keyOf(kind, "enabled")) === "1";
}

export function setReminderEnabled(kind: ReminderKind, on: boolean): void {
  localStorage.setItem(keyOf(kind, "enabled"), on ? "1" : "0");
}

export function getReminderTime(kind: ReminderKind): string {
  return localStorage.getItem(keyOf(kind, "time")) || DEFAULT_TIME[kind];
}

export function setReminderTime(kind: ReminderKind, time: string): void {
  localStorage.setItem(keyOf(kind, "time"), time);
}

function getLastShown(kind: ReminderKind): string | null {
  return localStorage.getItem(keyOf(kind, "lastShown"));
}

function setLastShown(kind: ReminderKind, marker: string): void {
  localStorage.setItem(keyOf(kind, "lastShown"), marker);
}

export function notificationsSupported(): boolean {
  return typeof Notification !== "undefined";
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

// Berechtigung anfordern (Browser fragt nur einmal — danach "granted" oder
// dauerhaft "denied", bis der Nutzer es in den Browser-Einstellungen ändert).
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

function notify(body: string): void {
  const notif = new Notification("Daybase", { body, tag: "daybase-reminder" });
  notif.onclick = () => {
    window.focus();
    notif.close();
  };
}

// Prüft alle aktivierten Reminder gegen die aktuelle Uhrzeit. Günstig: die
// Zeit-/"schon heute gezeigt"-Prüfung läuft rein in localStorage, die
// IndexedDB wird erst angefragt, wenn ein Reminder wirklich fällig ist.
export async function checkReminders(): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const today = todayIso();
  const now = nowHm();

  if (
    isReminderEnabled("dailyReview") &&
    getLastShown("dailyReview") !== today &&
    now >= getReminderTime("dailyReview")
  ) {
    const existing = await db.entries.where("[type+date]").equals(["review", today]).first();
    setLastShown("dailyReview", today);
    if (!existing) {
      notify(
        getLanguage() === "en"
          ? "Daily Review still open — take a moment to review your day."
          : "Daily Review noch offen — Tag kurz auswerten.",
      );
    }
  }

  const monday = mondayOfIso(today);
  const weekday = new Date(today + "T00:00:00").getDay(); // 0=So, 1=Mo
  if (
    isReminderEnabled("weeklyReview") &&
    (weekday === 0 || weekday === 1) &&
    getLastShown("weeklyReview") !== monday &&
    now >= getReminderTime("weeklyReview")
  ) {
    const existing = await db.entries
      .where("[type+date]")
      .equals(["weeklyreview", monday])
      .first();
    setLastShown("weeklyReview", monday);
    if (!existing) {
      notify(
        getLanguage() === "en"
          ? "Weekly Review is due — review this week and plan the next."
          : "Weekly Review steht an — Woche auswerten & nächste planen.",
      );
    }
  }

  if (
    isReminderEnabled("overdueTasks") &&
    getLastShown("overdueTasks") !== today &&
    now >= getReminderTime("overdueTasks")
  ) {
    const tasks = await db.entries.where("type").equals("task").toArray();
    const overdue = tasks.filter((e) => {
      const m = e.meta as TaskMeta;
      return !m.done && e.date && e.date < today;
    }).length;
    setLastShown("overdueTasks", today);
    if (overdue > 0) {
      const en = getLanguage() === "en";
      notify(
        en
          ? `${overdue} overdue task${overdue > 1 ? "s" : ""} — complete or reschedule.`
          : `${overdue} überfällige Task${overdue > 1 ? "s" : ""} — erledigen oder neu terminieren.`,
      );
    }
  }

  if (
    isReminderEnabled("habits") &&
    getLastShown("habits") !== today &&
    now >= getReminderTime("habits")
  ) {
    const habits = await db.entries.where("type").equals("habit").toArray();
    const open = habits.filter((e) => {
      const m = habitMeta(e);
      return !isDoneForPeriod(m.completedDates, m.frequency, today);
    }).length;
    setLastShown("habits", today);
    if (open > 0) {
      const en = getLanguage() === "en";
      notify(
        en
          ? `${open} habit${open > 1 ? "s" : ""} still open today.`
          : `${open} offene Habit${open > 1 ? "s" : ""} heute.`,
      );
    }
  }
}

// Migration vom alten, einzelnen "Erinnerungen an/aus"-Schalter (vor den
// pro-Typ-Remindern) auf die vier neuen Keys — bestehende Nutzer, die den
// alten Schalter aktiviert hatten, sollen nicht kommentarlos alle Reminder
// verlieren. Läuft einmal beim Modul-Laden, danach sind die alten Keys weg.
function migrateLegacyReminderSetting(): void {
  const LEGACY_ENABLED_KEY = "daybase.reminders.enabled";
  const LEGACY_LAST_SHOWN_KEY = "daybase.reminders.lastShown";
  if (localStorage.getItem(LEGACY_ENABLED_KEY) === "1") {
    const alreadyConfigured = REMINDER_KINDS.some(
      (k) => localStorage.getItem(keyOf(k, "enabled")) !== null,
    );
    if (!alreadyConfigured) {
      for (const k of REMINDER_KINDS) setReminderEnabled(k, true);
    }
  }
  localStorage.removeItem(LEGACY_ENABLED_KEY);
  localStorage.removeItem(LEGACY_LAST_SHOWN_KEY);
}
migrateLegacyReminderSetting();

// Einmal beim App-Start aufrufen. Prüft sofort (deckt "App nach der
// eingestellten Zeit geöffnet" ab) und danach im Minutentakt, solange die
// App offen ist — ohne Intervall würde eine erst nach der Zielzeit
// geöffnete App den Reminder für den Tag verpassen.
export function startReminderScheduler(): () => void {
  void checkReminders();
  const id = window.setInterval(() => void checkReminders(), 60_000);
  return () => window.clearInterval(id);
}
