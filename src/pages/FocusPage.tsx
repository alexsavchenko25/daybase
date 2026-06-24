import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import { fmtClock, fmtDuration, focusMeta } from "../utils/focus";
import type { Entry, FocusMeta } from "../types";

const PRESETS = [25, 50, 90];
type Phase = "setup" | "run" | "finish";

export default function FocusPage() {
  const today = todayIso();

  // Setup
  const [linkId, setLinkId] = useState("");
  const [freeTitle, setFreeTitle] = useState("");
  const [planned, setPlanned] = useState(25);

  // Timer
  const [phase, setPhase] = useState<Phase>("setup");
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [actualSec, setActualSec] = useState(0);
  const startTitle = useRef("");

  // Ergebnis
  const [focusScore, setFocusScore] = useState(7);
  const [energyAfter, setEnergyAfter] = useState(6);
  const [distractions, setDistractions] = useState("");
  const [note, setNote] = useState("");

  // Verknüpfbare Einträge: offene Tasks heute, aktive Projects/Goals.
  const links = useLiveQuery(
    async () => {
      const tasks = await db.entries.where("[type+date]").equals(["task", today]).toArray();
      const projects = await db.entries.where("type").equals("project").toArray();
      const goals = await db.entries.where("type").equals("goal").toArray();
      return [
        ...tasks
          .filter((t: Entry) => !(t.meta as { done?: boolean }).done)
          .map((t: Entry) => ({ id: t.id, label: `✅ ${t.title}` })),
        ...projects
          .filter((p: Entry) => (p.meta as { status?: string }).status === "active")
          .map((p: Entry) => ({ id: p.id, label: `📂 ${p.title}` })),
        ...goals
          .filter((g: Entry) => (g.meta as { status?: string }).status === "active")
          .map((g: Entry) => ({ id: g.id, label: `🎯 ${g.title}` })),
      ];
    },
    [today],
    [] as { id: string; label: string }[],
  );

  const todaySessions = useLiveQuery(
    () => db.entries.where("[type+date]").equals(["focus", today]).toArray(),
    [today],
    [] as Entry[],
  );
  const todayTotal = useMemo(
    () => todaySessions.reduce((s, e) => s + focusMeta(e).actualSec, 0),
    [todaySessions],
  );

  // ponytail: Timer lebt nur in dieser Seite (kein Persist über Reload/Navigation).
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((l) => l - 1);
      setActualSec((a) => a + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (phase === "run" && left <= 0 && running) {
      setRunning(false);
      setPhase("finish");
    }
  }, [left, phase, running]);

  function start() {
    const lbl = links.find((l) => l.id === linkId)?.label;
    startTitle.current = freeTitle.trim() || lbl?.replace(/^.{1,2}\s/, "") || "Fokus-Session";
    setLeft(planned * 60);
    setActualSec(0);
    setPhase("run");
    setRunning(true);
  }

  function stop() {
    setRunning(false);
    setPhase("finish");
  }

  async function saveSession() {
    const lbl = links.find((l) => l.id === linkId)?.label;
    const meta: FocusMeta = {
      plannedMin: planned,
      actualSec,
      linkId: linkId || undefined,
      linkLabel: lbl,
      focusScore,
      energyAfter,
      distractions: distractions.trim(),
      note: note.trim(),
    };
    await entriesRepo.create({
      type: "focus",
      date: today,
      title: startTitle.current,
      content: note.trim(),
      tags: [],
      meta,
    });
    resetAll();
  }

  function resetAll() {
    setPhase("setup");
    setRunning(false);
    setLeft(0);
    setActualSec(0);
    setFreeTitle("");
    setLinkId("");
    setFocusScore(7);
    setEnergyAfter(6);
    setDistractions("");
    setNote("");
  }

  return (
    <div className="page focus-page">
      <header className="page-head">
        <h1>
          <span className="page-icon">⏱️</span> Focus Mode
        </h1>
        <p className="muted">
          Heute fokussiert: <strong>{fmtDuration(todayTotal)}</strong> ·{" "}
          {todaySessions.length} Sessions
        </p>
      </header>

      {phase === "setup" && (
        <div className="focus-card">
          <input
            className="task-input full"
            placeholder="Freier Titel (optional)…"
            value={freeTitle}
            onChange={(e) => setFreeTitle(e.target.value)}
          />
          <select
            className="task-select full"
            value={linkId}
            onChange={(e) => setLinkId(e.target.value)}
          >
            <option value="">— Task / Project / Goal verknüpfen —</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <div className="focus-presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={`chip ${planned === p ? "chip-active" : ""}`}
                onClick={() => setPlanned(p)}
              >
                {p} min
              </button>
            ))}
          </div>
          <button className="btn full" onClick={start}>
            ▶ Session starten
          </button>
        </div>
      )}

      {phase === "run" && (
        <div className="focus-card focus-run">
          <div className="focus-sessiontitle">{startTitle.current}</div>
          <div className={`focus-clock ${running ? "" : "paused"}`}>
            {fmtClock(left)}
          </div>
          <div className="focus-sub muted">
            geplant {planned} min · gearbeitet {fmtDuration(actualSec)}
          </div>
          <div className="focus-controls">
            <button className="btn" onClick={() => setRunning((r) => !r)}>
              {running ? "⏸ Pause" : "▶ Weiter"}
            </button>
            <button className="chip" onClick={stop}>
              ⏹ Beenden
            </button>
          </div>
        </div>
      )}

      {phase === "finish" && (
        <div className="focus-card">
          <div className="focus-done">
            ✓ {fmtDuration(actualSec)} fokussiert{" "}
            <span className="muted">({startTitle.current})</span>
          </div>
          <label className="rv-field">
            <span>📝 Ergebnis / Notiz</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="rv-field">
            <span>🚧 Ablenkungen</span>
            <textarea
              value={distractions}
              onChange={(e) => setDistractions(e.target.value)}
            />
          </label>
          <div className="rv-sliders">
            <label className="rv-slider">
              <span>
                🎯 Fokus-Score <strong>{focusScore}</strong>/10
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={focusScore}
                onChange={(e) => setFocusScore(Number(e.target.value))}
              />
            </label>
            <label className="rv-slider">
              <span>
                ⚡ Energie danach <strong>{energyAfter}</strong>/10
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={energyAfter}
                onChange={(e) => setEnergyAfter(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="rv-actions">
            <button className="btn" onClick={saveSession}>
              Session speichern
            </button>
            <button className="chip" onClick={resetAll}>
              Verwerfen
            </button>
          </div>
        </div>
      )}

      {todaySessions.length > 0 && (
        <>
          <p className="section-label">Heutige Sessions</p>
          <ul className="task-list">
            {todaySessions.map((e) => {
              const m = focusMeta(e);
              return (
                <li key={e.id} className="task-item">
                  <span className="task-title">{e.title}</span>
                  {m.linkLabel && <span className="link-tag">{m.linkLabel}</span>}
                  <span className="focus-dur">{fmtDuration(m.actualSec)}</span>
                  <span className="prio prio-medium">🎯 {m.focusScore}</span>
                  <button
                    className="task-del"
                    title="Löschen"
                    onClick={() => entriesRepo.remove(e.id)}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
