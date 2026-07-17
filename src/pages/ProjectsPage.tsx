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
import type { Entry, ProjectMeta, ProjectStatus, TaskMeta } from "../types";
import { useI18n } from "../i18n";

const STATUSES: ProjectStatus[] = ["active", "done", "paused"];
const EMPTY = {
  title: "",
  description: "",
  category: "",
  status: "active" as ProjectStatus,
  deadline: "",
  goalId: "",
};

function pm(e: Entry): ProjectMeta {
  return e.meta as ProjectMeta;
}

// Fortschritt aus zugeordneten Tasks: done / total.
export function projectProgress(
  projectId: string,
  tasks: Entry[],
): { done: number; total: number; pct: number } {
  const mine = tasks.filter((t) => (t.meta as TaskMeta).projectId === projectId);
  const done = mine.filter((t) => (t.meta as TaskMeta).done).length;
  const total = mine.length;
  return { done, total, pct: total ? (done / total) * 100 : 0 };
}

export default function ProjectsPage() {
  const { tr } = useI18n();
  const statusLabel = (s: ProjectStatus) => ({ active: tr("Aktiv", "Active"), done: tr("Erledigt", "Done"), paused: tr("Pausiert", "Paused") })[s];
  const [form, setForm] = useState({ ...EMPTY });
  const [searchParams, setSearchParams] = useSearchParams();
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | ProjectStatus>("active");

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

  const projects = useLiveQuery(
    () => db.entries.where("type").equals("project").toArray(),
    [],
    [] as Entry[],
  );
  const tasks = useLiveQuery(
    () => db.entries.where("type").equals("task").toArray(),
    [],
    [] as Entry[],
  );
  const notes = useLiveQuery(
    () => db.entries.where("type").equals("note").toArray(),
    [],
    [] as Entry[],
  );
  const goals = useLiveQuery(
    () => db.entries.where("type").equals("goal").toArray(),
    [],
    [] as Entry[],
  );

  const shown = useMemo(() => {
    const list =
      filter === "all" ? projects : projects.filter((p) => pm(p).status === filter);
    return [...list].sort(
      (a, b) => (pm(a).deadline || "9999").localeCompare(pm(b).deadline || "9999"),
    );
  }, [projects, filter]);

  useEffect(() => {
    if (!editId) return;
    const p = projects.find((x) => x.id === editId);
    if (p) {
      setForm({
        title: p.title,
        description: p.content,
        category: pm(p).category,
        status: pm(p).status,
        deadline: pm(p).deadline,
        goalId: pm(p).goalId ?? "",
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
    const meta: ProjectMeta = {
      category: form.category.trim(),
      status: form.status,
      deadline: form.deadline,
      ...(form.goalId ? { goalId: form.goalId } : {}),
    };
    if (editId) {
      await entriesRepo.update(editId, {
        title: form.title.trim(),
        content: form.description,
        meta,
      });
    } else {
      await entriesRepo.create({
        type: "project",
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
        icon="project"
        title="Projects"
        subtitle={tr("Arbeit bündeln, Tasks verbinden und Fortschritt sichtbar machen.", "Group work, connect tasks and make progress visible.")}
        actions={
          <button className="btn" type="button" onClick={openNew}>
            <Icon name="plus" size={17} /> {tr("Neues Projekt", "New project")}
          </button>
        }
      />

      {formOpen && (
      <section className="entity-editor" aria-label={editId ? tr("Projekt bearbeiten", "Edit project") : tr("Neues Projekt", "New project")}>
        <div className="entity-editor-head">
          <div>
            <span className="eyebrow">{editId ? tr("Bearbeiten", "Edit") : tr("Erstellen", "Create")}</span>
            <h2>{editId ? tr("Projekt aktualisieren", "Update project") : tr("Neues Projekt", "New project")}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={closeEditor} aria-label={tr("Formular schließen", "Close form")}>
            <Icon name="close" />
          </button>
        </div>
        <form className="entity-form" onSubmit={save}>
        <div className="entity-core-grid">
          <label className="ef-field">
            <span>{tr("Titel", "Title")}</span>
            <input className="task-input full" autoFocus placeholder={tr("Woran möchtest du arbeiten?", "What do you want to work on?")} value={form.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="ef-field">
            <span>{tr("Beschreibung", "Description")}</span>
            <textarea className="journal-textarea sm" placeholder={tr("Ziel und Umfang des Projekts", "Purpose and scope of the project")} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </label>
        </div>
        <div className="ef-grid">
          <label>
            {tr("Kategorie", "Category")}
            <input
              className="task-select"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="z.B. Content"
            />
          </label>
          <label>
            Status
            <select
              className="task-select"
              value={form.status}
              onChange={(e) => set("status", e.target.value as ProjectStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
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
            Goal (optional)
            <select
              className="task-select"
              value={form.goalId}
              onChange={(e) => set("goalId", e.target.value)}
            >
              <option value="">— {tr("kein Goal", "no goal")} —</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rv-actions">
          <button className="btn" type="submit">
            {editId ? tr("Aktualisieren", "Update") : tr("Projekt anlegen", "Create project")}
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
        {(["active", "all", "done", "paused"] as const).map((f) => (
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
          icon="project"
          title={tr("Keine Projekte in dieser Ansicht", "No projects in this view")}
          description={tr("Starte ein Projekt und verknüpfe Tasks, Notizen oder ein Goal.", "Start a project and connect tasks, notes or a goal.")}
          action={<button className="btn ghost" type="button" onClick={openNew}><Icon name="plus" size={16} /> {tr("Projekt anlegen", "Create project")}</button>}
        />
      ) : (
        <ul className="entity-list">
          {shown.map((p) => {
            const m = pm(p);
            const prog = projectProgress(p.id, tasks);
            const noteCount = notes.filter(
              (n) => (n.meta as { projectId?: string }).projectId === p.id,
            ).length;
            return (
              <li key={p.id} className="entity-card">
                <div className="entity-head">
                  <span className="entity-title">{p.title}</span>
                  <span className={`pill status-${m.status}`}>
                    {statusLabel(m.status)}
                  </span>
                </div>
                {p.content && <p className="entity-desc">{p.content}</p>}
                <div className="entity-meta">
                  {m.category && <span className="pill ghost">{m.category}</span>}
                  {m.deadline && <span className="entity-dl">⏱ {m.deadline}</span>}
                  <span className="entity-dl">
                    {prog.done}/{prog.total} Tasks
                  </span>
                  {noteCount > 0 && (
                    <span className="entity-dl">🔗 {noteCount} {tr("Notizen", "notes")}</span>
                  )}
                </div>
                <div className="entity-prog">
                  <ProgressBar value={prog.pct} label={`${p.title}: ${Math.round(prog.pct)}%`} />
                  <span className="entity-prog-val">{Math.round(prog.pct)}%</span>
                </div>
                <div className="entity-actions">
                  <button className="btn subtle sm" onClick={() => { setEditId(p.id); setFormOpen(true); }}>
                    <Icon name="edit" size={15} /> {tr("Bearbeiten", "Edit")}
                  </button>
                  <button className="icon-btn danger-ghost" onClick={() => remove(p.id)} aria-label={tr("Projekt löschen", "Delete project")}>
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
