import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import ProgressBar from "../components/ProgressBar";
import PageHeader from "../components/PageHeader";
import type { Entry, ProjectMeta, ProjectStatus, TaskMeta } from "../types";

const STATUSES: ProjectStatus[] = ["active", "done", "paused"];
const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Aktiv",
  done: "Erledigt",
  paused: "Pausiert",
};

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
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ProjectStatus>("active");

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
  }

  async function remove(id: string) {
    if (editId === id) reset();
    await entriesRepo.remove(id);
  }

  return (
    <div className="page goals-page">
      <PageHeader icon="📂" title="Projects" />

      <form className="entity-form" onSubmit={save}>
        <input
          className="task-input full"
          placeholder="Projekt-Titel…"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
        <textarea
          className="journal-textarea sm"
          placeholder="Beschreibung…"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <div className="ef-grid">
          <label>
            Kategorie
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
                  {STATUS_LABEL[s]}
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
              <option value="">— kein Goal —</option>
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
            {editId ? "Aktualisieren" : "Projekt anlegen"}
          </button>
          {editId && (
            <button className="chip" type="button" onClick={reset}>
              Abbrechen
            </button>
          )}
        </div>
      </form>

      <div className="filter-row wrap">
        {(["active", "all", "done", "paused"] as const).map((f) => (
          <button
            key={f}
            className={`chip ${filter === f ? "chip-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Alle" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty" data-icon="📂">
          <strong>Keine Projekte in dieser Ansicht</strong>
          <span>Starte oben ein neues Projekt und verknüpfe Tasks & Notizen damit.</span>
        </div>
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
                    {STATUS_LABEL[m.status]}
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
                    <span className="entity-dl">🔗 {noteCount} Notizen</span>
                  )}
                </div>
                <div className="entity-prog">
                  <ProgressBar value={prog.pct} />
                  <span className="entity-prog-val">{Math.round(prog.pct)}%</span>
                </div>
                <div className="entity-actions">
                  <button className="chip sm" onClick={() => setEditId(p.id)}>
                    Bearbeiten
                  </button>
                  <button className="task-del" onClick={() => remove(p.id)}>
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
