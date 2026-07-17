import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import ProgressBar from "../components/ProgressBar";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | GoalStatus>("active");

  useEffect(() => {
    if (searchParams.get("new") === "1") setFormOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!formOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEditor();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [formOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
  function openNew() {
    reset();
    setFormOpen(true);
  }
  function closeEditor() {
    reset();
    setFormOpen(false);
    if (searchParams.has("new")) setSearchParams({}, { replace: true });
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
    setFormOpen(false);
    if (searchParams.has("new")) setSearchParams({}, { replace: true });
  }

  async function remove(id: string) {
    if (editId === id) closeEditor();
    await entriesRepo.remove(id);
  }

  return (
    <div className="page goals-page">
      <PageHeader
        icon="goal"
        title="Goals"
        subtitle={tr("Ziele definieren, verknüpfen und messbar voranbringen.", "Define, connect and move goals forward measurably.")}
        actions={
          <button className="btn" type="button" onClick={openNew}>
            <Icon name="plus" size={17} /> {tr("Neues Ziel", "New goal")}
          </button>
        }
      />

      {formOpen && (
      <section className="entity-editor" aria-label={editId ? tr("Ziel bearbeiten", "Edit goal") : tr("Neues Ziel", "New goal")}>
        <div className="entity-editor-head">
          <div>
            <span className="eyebrow">{editId ? tr("Bearbeiten", "Edit") : tr("Erstellen", "Create")}</span>
            <h2>{editId ? tr("Ziel aktualisieren", "Update goal") : tr("Neues Ziel", "New goal")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={closeEditor} aria-label={tr("Formular schließen", "Close form")}>
            <Icon name="close" />
          </button>
        </div>
        <form className="entity-form" onSubmit={save}>
        <div className="entity-core-grid">
          <label className="ef-field">
            <span>{tr("Titel", "Title")}</span>
            <input className="task-input full" autoFocus placeholder={tr("Was möchtest du erreichen?", "What do you want to achieve?")} value={form.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="ef-field">
            <span>{tr("Beschreibung", "Description")}</span>
            <textarea className="journal-textarea sm" placeholder={tr("Warum ist dieses Ziel wichtig?", "Why does this goal matter?")} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </label>
        </div>
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
              <button className="btn ghost" type="button" onClick={closeEditor}>
                {tr("Abbrechen", "Cancel")}
              </button>
          )}
        </div>
        </form>
      </section>
      )}

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
        <EmptyState
          icon="goal"
          title={tr("Keine Ziele in dieser Ansicht", "No goals in this view")}
          description={tr("Lege ein Ziel mit Zeitraum, Deadline und Fortschritt an.", "Create a goal with a period, deadline and progress.")}
          action={<button className="btn ghost" type="button" onClick={openNew}><Icon name="plus" size={16} /> {tr("Ziel anlegen", "Create goal")}</button>}
        />
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
                  <ProgressBar value={prog.pct} label={`${g.title}: ${Math.round(prog.pct)}%`} />
                  <span className="entity-prog-val">{Math.round(prog.pct)}%</span>
                </div>
                {prog.auto && (
                  <span className="entity-dl auto-prog">
                    ⚡ {tr("Auto aus Tasks/Projects", "Auto from tasks/projects")}
                  </span>
                )}
                <div className="entity-actions">
                  <button className="btn subtle sm" onClick={() => { setEditId(g.id); setFormOpen(true); }}>
                    <Icon name="edit" size={15} /> {tr("Bearbeiten", "Edit")}
                  </button>
                  <button className="icon-btn danger-ghost" onClick={() => remove(g.id)} aria-label={tr("Ziel löschen", "Delete goal")}>
                    <Icon name="trash" size={16} />
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
