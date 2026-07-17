import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import ProgressBar from "../components/ProgressBar";
import PageHeader from "../components/PageHeader";
import { projectProgress } from "./ProjectsPage";
import type { Entry, GoalMeta, GoalPeriod, GoalStatus } from "../types";
import { useI18n } from "../i18n";

// Auto-Progress: Mittel aus verknüpften Tasks (done = 100) + Projekt-Fortschritt.
// Ohne Verknüpfungen → manueller Wert (Fallback).
export function goalProgress(
  goalId: string,
  manual: number,
  tasks: Entry[],
  projects: Entry[],
): { pct: number; auto: boolean } {
  const lt = tasks.filter((t) => (t.meta as { goalId?: string }).goalId === goalId);
  const lp = projects.filter((p) => (p.meta as { goalId?: string }).goalId === goalId);
  if (lt.length + lp.length === 0) return { pct: manual, auto: false };
  const scores = [
    ...lt.map((t) => ((t.meta as { done?: boolean }).done ? 100 : 0)),
    ...lp.map((p) => projectProgress(p.id, tasks).pct),
  ];
  return { pct: scores.reduce((a, b) => a + b, 0) / scores.length, auto: true };
}

const PERIODS: GoalPeriod[] = ["weekly", "monthly", "yearly"];
const STATUSES: GoalStatus[] = ["active", "done", "paused", "dropped"];
const EMPTY = {
  title: "",
  description: "",
  category: "",
  period: "monthly" as GoalPeriod,
  deadline: "",
  status: "active" as GoalStatus,
  progress: 0,
};

function gm(e: Entry): GoalMeta {
  return e.meta as GoalMeta;
}

export default function GoalsPage() {
  const { tr } = useI18n();
  const statusLabel = (s: GoalStatus) => ({ active: tr("Aktiv", "Active"), done: tr("Erledigt", "Done"), paused: tr("Pausiert", "Paused"), dropped: tr("Abgebrochen", "Dropped") })[s];
  const periodLabel = (p: GoalPeriod) => ({ weekly: tr("Wöchentlich", "Weekly"), monthly: tr("Monatlich", "Monthly"), yearly: tr("Jährlich", "Yearly") })[p];
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | GoalStatus>("active");

  const goals = useLiveQuery(
    () => db.entries.where("type").equals("goal").toArray(),
    [],
    [] as Entry[],
  );
  const tasks = useLiveQuery(
    () => db.entries.where("type").equals("task").toArray(),
    [],
    [] as Entry[],
  );
  const projects = useLiveQuery(
    () => db.entries.where("type").equals("project").toArray(),
    [],
    [] as Entry[],
  );
  // Verknüpfte Tasks + Notes je Goal zählen.
  const links = useLiveQuery(
    async () => {
      const t = await db.entries.where("type").equals("task").toArray();
      const n = await db.entries.where("type").equals("note").toArray();
      const map = new Map<string, number>();
      [...t, ...n].forEach((e) => {
        const gid = (e.meta as { goalId?: string }).goalId;
        if (gid) map.set(gid, (map.get(gid) ?? 0) + 1);
      });
      return map;
    },
    [],
    new Map<string, number>(),
  );

  const shown = useMemo(() => {
    const list = filter === "all" ? goals : goals.filter((g) => gm(g).status === filter);
    return [...list].sort(
      (a, b) =>
        (gm(a).deadline || "9999").localeCompare(gm(b).deadline || "9999") ||
        gm(b).progress - gm(a).progress,
    );
  }, [goals, filter]);

  useEffect(() => {
    if (!editId) return;
    const g = goals.find((x) => x.id === editId);
    if (g) {
      setForm({
        title: g.title,
        description: g.content,
        category: gm(g).category,
        period: gm(g).period,
        deadline: gm(g).deadline,
        status: gm(g).status,
        progress: gm(g).progress,
      });
    }
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function reset() {
    setForm({ ...EMPTY });
    setEditId(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const meta: GoalMeta = {
      category: form.category.trim(),
      period: form.period,
      deadline: form.deadline,
      status: form.status,
      progress: Number(form.progress),
    };
    if (editId) {
      await entriesRepo.update(editId, {
        title: form.title.trim(),
        content: form.description,
        meta,
      });
    } else {
      await entriesRepo.create({
        type: "goal",
        date: todayIso(),
        title: form.title.trim(),
        content: form.description,
        tags: [],
        meta,
      });
    }
    reset();
  }

  async function remove(id: string) {
    if (editId === id) reset();
    await entriesRepo.remove(id);
  }

  return (
    <div className="page goals-page">
      <PageHeader icon="🎯" title="Goals" />

      <form className="entity-form" onSubmit={save}>
        <input
          className="task-input full"
          placeholder={tr("Ziel-Titel…", "Goal title…")}
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
        <textarea
          className="journal-textarea sm"
          placeholder={tr("Beschreibung…", "Description…")}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <div className="ef-grid">
          <label>
            {tr("Kategorie", "Category")}
            <input
              className="task-select"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder={tr("z.B. Fitness", "e.g. Fitness")}
            />
          </label>
          <label>
            {tr("Zeitraum", "Period")}
            <select
              className="task-select"
              value={form.period}
              onChange={(e) => set("period", e.target.value as GoalPeriod)}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deadline
            <input
              className="task-select"
              type="date"
              value={form.deadline}
              onChange={(e) => set("deadline", e.target.value)}
            />
          </label>
          <label>
            Status
            <select
              className="task-select"
              value={form.status}
              onChange={(e) => set("status", e.target.value as GoalStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="ef-wide">
            {tr("Fortschritt", "Progress")} <strong>{form.progress}%</strong>
            <input
              type="range"
              min={0}
              max={100}
              value={form.progress}
              onChange={(e) => set("progress", Number(e.target.value))}
            />
          </label>
        </div>
        <div className="rv-actions">
          <button className="btn" type="submit">
            {editId ? tr("Aktualisieren", "Update") : tr("Ziel anlegen", "Create goal")}
          </button>
          {editId && (
            <button className="chip" type="button" onClick={reset}>
              {tr("Abbrechen", "Cancel")}
            </button>
          )}
        </div>
      </form>

      <div className="filter-row wrap">
        {(["active", "all", "done", "paused", "dropped"] as const).map((f) => (
          <button
            key={f}
            className={`chip ${filter === f ? "chip-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? tr("Alle", "All") : statusLabel(f)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty" data-icon="🎯">
          <strong>{tr("Keine Ziele in dieser Ansicht", "No goals in this view")}</strong>
          <span>{tr("Definiere oben ein neues Ziel — mit Zeitraum, Deadline und Fortschritt.", "Define a new goal above — with a period, deadline and progress.")}</span>
        </div>
      ) : (
        <ul className="entity-list">
          {shown.map((g) => {
            const m = gm(g);
            const prog = goalProgress(g.id, m.progress, tasks, projects);
            return (
              <li key={g.id} className="entity-card">
                <div className="entity-head">
                  <span className="entity-title">{g.title}</span>
                  <span className={`pill status-${m.status}`}>
                    {statusLabel(m.status)}
                  </span>
                </div>
                {g.content && <p className="entity-desc">{g.content}</p>}
                <div className="entity-meta">
                  <span className="pill ghost">{periodLabel(m.period)}</span>
                  {m.category && <span className="pill ghost">{m.category}</span>}
                  {m.deadline && <span className="entity-dl">⏱ {m.deadline}</span>}
                  {(links.get(g.id) ?? 0) > 0 && (
                    <span className="entity-dl">🔗 {links.get(g.id)} {tr("verknüpft", "linked")}</span>
                  )}
                </div>
                <div className="entity-prog">
                  <ProgressBar value={prog.pct} />
                  <span className="entity-prog-val">{Math.round(prog.pct)}%</span>
                </div>
                {prog.auto && (
                  <span className="entity-dl auto-prog">
                    ⚡ {tr("Auto aus Tasks/Projects", "Auto from tasks/projects")}
                  </span>
                )}
                <div className="entity-actions">
                  <button className="chip sm" onClick={() => setEditId(g.id)}>
                    {tr("Bearbeiten", "Edit")}
                  </button>
                  <button className="task-del" onClick={() => remove(g.id)}>
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
