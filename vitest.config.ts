import { defineConfig } from "vitest/config";

// Eigene Config statt vite.config.ts: die Tests brauchen weder den PWA-Plugin
// noch den React-Plugin (reine Logik-Tests, keine Komponenten).
//
// TZ ist fixiert, weil Tasks/Habits datumsabhängig sind — Streaks, ISO-Wochen
// und Recurrence müssen in einer Zeitzone mit Sommerzeit reproduzierbar sein.
process.env.TZ = "Europe/Berlin";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
