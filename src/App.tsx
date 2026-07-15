import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import Layout from "./components/Layout";
import CommandPalette from "./components/CommandPalette";
import Onboarding, { isOnboarded } from "./components/Onboarding";
import Dashboard from "./pages/Dashboard";
import ModulePlaceholder from "./pages/ModulePlaceholder";
import TasksPage from "./pages/TasksPage";
import HabitsPage from "./pages/HabitsPage";
import JournalPage from "./pages/JournalPage";
import NotesPage from "./pages/NotesPage";
import WeekPlanPage from "./pages/WeekPlanPage";
import TradesPage from "./pages/TradesPage";
import ReviewPage from "./pages/ReviewPage";
import WeeklyReviewPage from "./pages/WeeklyReviewPage";
import GoalsPage from "./pages/GoalsPage";
import ProjectsPage from "./pages/ProjectsPage";
import FocusPage from "./pages/FocusPage";
import SettingsPage from "./pages/SettingsPage";
import AuthPage from "./pages/AuthPage";
import { MODULES } from "./modules";
import { syncHabitStreaks } from "./repository";
import { seedIfFirstRun, cleanupDuplicateWeekplan } from "./seed";
import { initSync } from "./sync";
import { checkAndNotify } from "./reminders";

// Module mit echter UI. Rest fällt auf ModulePlaceholder zurück.
const PAGES: Record<string, React.ReactNode> = {
  "/tasks": <TasksPage />,
  "/habits": <HabitsPage />,
  "/journal": <JournalPage />,
  "/notes": <NotesPage />,
  "/weekplan": <WeekPlanPage />,
  "/trades": <TradesPage />,
  "/review": <ReviewPage />,
  "/weekly-review": <WeeklyReviewPage />,
  "/goals": <GoalsPage />,
  "/projects": <ProjectsPage />,
  "/focus": <FocusPage />,
};

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboarded());
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    (async () => {
      await seedIfFirstRun();
      await cleanupDuplicateWeekplan();
      await syncHabitStreaks();
      await checkAndNotify();
    })();
    initSync();
  }, []);

  return (
    <>
    {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} />}
    {needRefresh && (
      <div className="pwa-update-banner">
        <span>Neue Version verfügbar.</span>
        <button className="btn" onClick={() => updateServiceWorker(true)}>
          Update installieren
        </button>
      </div>
    )}
    <BrowserRouter
      basename={import.meta.env.BASE_URL.replace(/\/$/, "")}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <CommandPalette />
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
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="*"
            element={<div className="page">Seite nicht gefunden.</div>}
          />
        </Route>
      </Routes>
    </BrowserRouter>
    </>
  );
}
