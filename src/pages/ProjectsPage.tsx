import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import ProgressBar from "../components/ProgressBar";
import PageHeader from "../components/PageHeader";
import type { Entry, ProjectMeta, ProjectStatus, TaskMeta } from "../types";
import { useI18n } from "../i18n";

const STATUSES: ProjectStatus[] = ["active", "waiting", "someday", "paused", "done"];
const EMPTY = {
  title: "",
  description: "",
  category: "",
  status: "active" as ProjectStatus,
  deadline: "",
  goalId: "",
  nextAction: "",
};

function pm(e: Entry): ProjectMeta {
  const m = e.meta as ProjectMeta;
  return { ...m, nextAction: m.nextAction ?? "" };
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

// Jüngste Aktivität (updatedAt) einer verknüpften Task, sonst null.
export function lastTaskActivityIso(projectId: string, tasks: Entry[]): string | null {
  const mine = tasks.filter((t) => (t.meta as TaskMeta).projectId === projectId);
  if (!mine.length) return null;
  return mine.reduce((max, t) => (t.updatedAt > max ? t.updatedAt : max), mine[0].updatedAt);
}

// Aktives/wartendes Project ohne nächste Aktion oder ohne Task-Aktivität
// in den letzten 14 Tagen — Kandidat für den Dashboard-Hinweis.
export function projectNeedsAttention(project: Entry, tasks: Entry[]): boolean {
  const m = pm(project);
  if (m.status !== "active" && m.status !== "waiting") return false;
  if (!m.nextAction?.trim()) return true;
  const last = lastTaskActivityIso(project.id, tasks);
  const staleSince = last ?? project.createdAt;
  const days = Math.floor((Date.now() - new Date(staleSince).getTime()) / 86_400_000);
  return days >= 14;
}

export default function ProjectsPage() {
  const { tr } = useI18n();
  const statusLabel = (s: ProjectStatus) => ({
    active: tr("Aktiv", "Active"),
    waiting: tr("Wartet", "Waiting"),
    someday: tr("Irgendwann", "Someday"),
    done: tr("Erledigt", "Done"),
    paused: tr("Pausiert", "Paused"),
  })[s];
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ProjectStatus>("active");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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
        nextAction: pm(p).nextAction ?? "",
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
      nextAction: form.nextAction.trim(),
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

  async function setStatus(id: string, status: ProjectStatus) {
    await entriesRepo.updateMeta(id, (_meta, current) => ({ ...pm(current), status }));
  }

  return (
    <div className="page goals-page">
      <PageHeader
        icon="📂"
        title="Projects"
        subtitle={tr(
          "Fortschritt kommt aus verknüpften Tasks. Jedes aktive Projekt braucht eine nächste Aktion.",
          "Progress is derived from linked tasks. Every active project needs a next action.",
        )}
      />

      <form className="entity-form" onSubmit={save}>
        <input
          className="task-input full"
          placeholder={tr("Projekt-Titel…", "Project title…")}
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
          <label className="ef-wide">
            {tr("Nächste Aktion", "Next action")}
            <input
              className="task-select"
              value={form.nextAction}
              onChange={(e) => set("nextAction", e.target.value)}
              placeholder={tr("Was ist der nächste konkrete Schritt?", "What's the next concrete step?")}
            />
          </label>
        </div>
        <div className="rv-actions">
          <button className="btn" type="submit">
            {editId ? tr("Aktualisieren", "Update") : tr("Projekt anlegen", "Create project")}
          </button>
          {editId && (
            <button className="chip" type="button" onClick={reset}>
              {tr("Abbrechen", "Cancel")}
            </button>
          )}
        </div>
      </form>

      <div className="filter-row wrap">
        <button
          className={`chip ${viewMode === "list" ? "chip-active" : ""}`}
          onClick={() => setViewMode("list")}
        >
          {tr("Liste", "List")}
        </button>
        <button
          className={`chip ${viewMode === "board" ? "chip-active" : ""}`}
          onClick={() => setViewMode("board")}
        >
          {tr("Board", "Board")}
        </button>
        {viewMode === "list" && (
          <>
            <span className="filter-sep" />
            {(["active", "all", "waiting", "someday", "done", "paused"] as const).map((f) => (
              <button
                key={f}
                className={`chip ${filter === f ? "chip-active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? tr("Alle", "All") : statusLabel(f)}
              </button>
            ))}
          </>
        )}
      </div>

      {viewMode === "list" ? (
        shown.length === 0 ? (
          <div className="empty" data-icon="📂">
            <strong>{tr("Keine Projekte in dieser Ansicht", "No projects in this view")}</strong>
            <span>{tr("Starte oben ein neues Projekt und verknüpfe Tasks & Notizen damit.", "Start a new project above and link tasks and notes to it.")}</span>
          </div>
        ) : (
          <ul className="entity-list">
            {shown.map((p) => {
              const m = pm(p);
              const prog = projectProgress(p.id, tasks);
              const linkedNotes = notes.filter(
                (n) => (n.meta as { projectId?: string }).projectId === p.id,
              );
              const openTasks = tasks.filter(
                (t) => (t.meta as TaskMeta).projectId === p.id && !(t.meta as TaskMeta).done,
              );
              const goal = m.goalId ? goals.find((g) => g.id === m.goalId) : undefined;
              const isExpanded = expanded.has(p.id);
              const attention = projectNeedsAttention(p, tasks);
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
                    {linkedNotes.length > 0 && (
                      <span className="entity-dl">🔗 {linkedNotes.length} {tr("Notizen", "notes")}</span>
                    )}
                  </div>
                  {/* Nur rendern, wenn es etwas zu zeigen gibt — eine leere
                      Meta-Zeile hinterließ sonst eine Lücke in der Karte. */}
                  {(m.nextAction || attention) && (
                    <div className="entity-meta">
                      {m.nextAction ? (
                        <span className="link-tag">→ {m.nextAction}</span>
                      ) : (
                        <span className="pill status-paused">
                          ⚠ {tr("Nächste Aktion fehlt", "Missing next action")}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="entity-prog">
                    <ProgressBar value={prog.pct} />
                    <span className="entity-prog-val">{Math.round(prog.pct)}%</span>
                  </div>
                  <div className="entity-actions">
                    <button className="chip sm" onClick={() => toggleExpand(p.id)}>
                      {isExpanded ? tr("Details ▲", "Details ▲") : tr("Details ▼", "Details ▼")}
                    </button>
                    <button className="chip sm" onClick={() => setEditId(p.id)}>
                      {tr("Bearbeiten", "Edit")}
                    </button>
                    <button className="task-del" onClick={() => remove(p.id)}>
                      ✕
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="project-detail">
                      <div className="pd-row">
                        <span className="dash-label">{tr("Goal", "Goal")}</span>
                        <span>{goal ? goal.title : tr("— keins —", "— none —")}</span>
                      </div>
                      <div className="pd-row">
                        <span className="dash-label">{tr("Offene Tasks", "Open tasks")}</span>
                        {openTasks.length === 0 ? (
                          <span className="muted">{tr("Keine offenen Tasks", "No open tasks")}</span>
                        ) : (
                          <ul className="pd-list">
                            {openTasks.map((t) => (
                              <li key={t.id}>{t.title}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="pd-row">
                        <span className="dash-label">{tr("Notizen", "Notes")}</span>
                        {linkedNotes.length === 0 ? (
                          <span className="muted">{tr("Keine Notizen", "No notes")}</span>
                        ) : (
                          <ul className="pd-list">
                            {linkedNotes.map((n) => (
                              <li key={n.id}>{n.title}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="board">
          {STATUSES.map((status) => {
            const col = projects.filter((p) => pm(p).status === status);
            return (
              <div key={status} className="board-col">
                <div className="board-col-head">
                  <span className={`pill status-${status}`}>{statusLabel(status)}</span>
                  <span className="board-col-count">{col.length}</span>
                </div>
                {col.length === 0 && (
                  <p className="board-col-empty">{tr("leer", "empty")}</p>
                )}
                {col.map((p) => {
                  const m = pm(p);
                  const prog = projectProgress(p.id, tasks);
                  const attention = projectNeedsAttention(p, tasks);
                  return (
                    <div key={p.id} className={`board-card ${attention ? "board-card-attention" : ""}`}>
                      <span className="board-card-title">{p.title}</span>
                      {m.nextAction ? (
                        <span className="board-next">
                          <span className="board-next-label">{tr("Nächste Aktion", "Next action")}</span>
                          {m.nextAction}
                        </span>
                      ) : (
                        attention && (
                          <span className="pill status-paused">
                            ⚠ {tr("Keine nächste Aktion", "No next action")}
                          </span>
                        )
                      )}
                      <div className="board-card-meta">
                        {m.deadline && <span className="entity-dl">⏱ {m.deadline}</span>}
                        <span className="entity-dl">
                          {prog.done}/{prog.total} Tasks
                        </span>
                      </div>
                      {prog.total > 0 && (
                        <div className="entity-prog">
                          <ProgressBar value={prog.pct} />
                          <span className="entity-prog-val">{Math.round(prog.pct)}%</span>
                        </div>
                      )}
                      <select
                        className="task-select sm"
                        value={status}
                        aria-label={tr(`Status von ${p.title}`, `Status of ${p.title}`)}
                        title={tr("Status ändern", "Change status")}
                        onChange={(e) => setStatus(p.id, e.target.value as ProjectStatus)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
