import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import ModulePlaceholder from "./pages/ModulePlaceholder";
import TasksPage from "./pages/TasksPage";
import HabitsPage from "./pages/HabitsPage";
import JournalPage from "./pages/JournalPage";
import NotesPage from "./pages/NotesPage";
import WeekPlanPage from "./pages/WeekPlanPage";
import TradesPage from "./pages/TradesPage";
import SettingsPage from "./pages/SettingsPage";
import { MODULES } from "./modules";
import { syncHabitStreaks } from "./repository";
import { seedIfFirstRun, cleanupDuplicateWeekplan } from "./seed";

// Module mit echter UI. Rest fällt auf ModulePlaceholder zurück.
const PAGES: Record<string, React.ReactNode> = {
  "/tasks": <TasksPage />,
  "/habits": <HabitsPage />,
  "/journal": <JournalPage />,
  "/notes": <NotesPage />,
  "/weekplan": <WeekPlanPage />,
  "/trades": <TradesPage />,
};

export default function App() {
  // Beim App-Load: einmalig Default-Woche seeden, dann Streaks neu rechnen.
  useEffect(() => {
    (async () => {
      await seedIfFirstRun();
      await cleanupDuplicateWeekplan();
      await syncHabitStreaks();
    })();
  }, []);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          {MODULES.map((m) => (
            <Route
              key={m.path}
              path={m.path}
              element={PAGES[m.path] ?? <ModulePlaceholder module={m} />}
            />
          ))}
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="*"
            element={<div className="page">Seite nicht gefunden.</div>}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
