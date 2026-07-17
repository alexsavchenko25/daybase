import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import { fmtClock, fmtDuration, focusMeta } from "../utils/focus";
import PageHeader from "../components/PageHeader";
import type { Entry, FocusMeta } from "../types";
import { useI18n } from "../i18n";

const PRESETS = [25, 50, 90];
type Phase = "setup" | "run" | "finish";

// Laufende Session in localStorage (überlebt Reload/Navigation). Anchor =
// Zeitstempel + Restzeit; echte verstrichene Zeit wird beim Laden neu berechnet.
const LS_KEY = "daybase.focus.active";
interface SavedFocus {
  title: string;
  planned: number;
  linkId: string;
  running: boolean;
  leftAtAnchor: number;
  actualAtAnchor: number;
  anchorMs: number;
}
function saveFocus(s: SavedFocus) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ponytail: Storage voll/blockiert → Persistenz best-effort */
  }
}
function clearFocus() {
  localStorage.removeItem(LS_KEY);
}
function loadFocus(): SavedFocus | null {
  try {
    const r = localStorage.getItem(LS_KEY);
    return r ? (JSON.parse(r) as SavedFocus) : null;
  } catch {
    return null;
  }
}

export default function FocusPage() {
  const { tr } = useI18n();
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

  // Laufende Session beim Mount wiederherstellen (verstrichene Zeit aus Anchor).
  useEffect(() => {
    const s = loadFocus();
    if (!s) return;
    const elapsed = s.running ? Math.floor((Date.now() - s.anchorMs) / 1000) : 0;
    const rem = s.leftAtAnchor - elapsed;
    startTitle.current = s.title;
    setPlanned(s.planned);
    setLinkId(s.linkId);
    if (rem <= 0) {
      setActualSec(s.actualAtAnchor + s.leftAtAnchor);
      setLeft(0);
      setRunning(false);
      setPhase("finish");
    } else {
      setLeft(rem);
      setActualSec(s.actualAtAnchor + elapsed);
      setRunning(s.running);
      setPhase("run");
    }
  }, []);

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
      clearFocus();
    }
  }, [left, phase, running]);

  function start() {
    const lbl = links.find((l) => l.id === linkId)?.label;
    startTitle.current = freeTitle.trim() || lbl?.replace(/^.{1,2}\s/, "") || "Fokus-Session";
    setLeft(planned * 60);
    setActualSec(0);
    setPhase("run");
    setRunning(true);
    saveFocus({
      title: startTitle.current,
      planned,
      linkId,
      running: true,
      leftAtAnchor: planned * 60,
      actualAtAnchor: 0,
      anchorMs: Date.now(),
    });
  }

  // Pause/Weiter: neuen Anchor schreiben, damit Drift korrekt bleibt.
  function togglePause() {
    const nr = !running;
    setRunning(nr);
    saveFocus({
      title: startTitle.current,
      planned,
      linkId,
      running: nr,
      leftAtAnchor: left,
      actualAtAnchor: actualSec,
      anchorMs: Date.now(),
    });
  }

  function stop() {
    setRunning(false);
    setPhase("finish");
    clearFocus();
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
    clearFocus();
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
      <PageHeader
        icon="⏱️"
        title="Focus Mode"
        subtitle={
          <>
            {tr("Heute fokussiert", "Focused today")}: <strong>{fmtDuration(todayTotal)}</strong> ·{" "}
            {todaySessions.length} {tr("Sessions", "sessions")}
          </>
        }
      />

      {phase === "setup" && (
        <div className="focus-card">
          <input
            className="task-input full"
            placeholder={tr("Freier Titel (optional)…", "Custom title (optional)…")}
            value={freeTitle}
            onChange={(e) => setFreeTitle(e.target.value)}
          />
          <select
            className="task-select full"
            value={linkId}
            onChange={(e) => setLinkId(e.target.value)}
          >
            <option value="">— {tr("Task / Project / Goal verknüpfen", "Link task / project / goal")} —</option>
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
            ▶ {tr("Session starten", "Start session")}
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
            {tr("geplant", "planned")} {planned} min · {tr("gearbeitet", "worked")} {fmtDuration(actualSec)}
          </div>
          <div className="focus-controls">
            <button className="btn" onClick={togglePause}>
              {running ? `⏸ ${tr("Pause", "Pause")}` : `▶ ${tr("Weiter", "Resume")}`}
            </button>
            <button className="chip" onClick={stop}>
              ⏹ {tr("Beenden", "Stop")}
            </button>
          </div>
        </div>
      )}

      {phase === "finish" && (
        <div className="focus-card">
          <div className="focus-done">
            ✓ {fmtDuration(actualSec)} {tr("fokussiert", "focused")}{" "}
            <span className="muted">({startTitle.current})</span>
          </div>
          <label className="rv-field">
            <span>📝 {tr("Ergebnis / Notiz", "Result / note")}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="rv-field">
            <span>🚧 {tr("Ablenkungen", "Distractions")}</span>
            <textarea
              value={distractions}
              onChange={(e) => setDistractions(e.target.value)}
            />
          </label>
          <div className="rv-sliders">
            <label className="rv-slider">
              <span>
                🎯 {tr("Fokus-Score", "Focus score")} <strong>{focusScore}</strong>/10
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
                ⚡ {tr("Energie danach", "Energy after")} <strong>{energyAfter}</strong>/10
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
              {tr("Session speichern", "Save session")}
            </button>
            <button className="chip" onClick={resetAll}>
              {tr("Verwerfen", "Discard")}
            </button>
          </div>
        </div>
      )}

      {todaySessions.length > 0 && (
        <>
          <p className="section-label">{tr("Heutige Sessions", "Today's sessions")}</p>
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
                    title={tr("Löschen", "Delete")}
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
