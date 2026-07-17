import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import PageHeader from "../components/PageHeader";
import type { Entry, NoteMeta } from "../types";
import { useI18n } from "../i18n";

type Sort = "date" | "title";

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))];
}

export default function NotesPage() {
  const { tr } = useI18n();
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => params.get("sel"),
  );
  // Auswahl auch bei erneuter Navigation (gleiche Seite) übernehmen.
  useEffect(() => {
    const s = params.get("sel");
    if (s) setSelectedId(s);
  }, [params]);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("date");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [dirty, setDirty] = useState(false);

  const notes = useLiveQuery(
    () => db.entries.where("type").equals("note").toArray(),
    [],
    [] as Entry[],
  );
  const projects = useLiveQuery(
    () => db.entries.where("type").equals("project").toArray(),
    [],
    [] as Entry[],
  );
  const goals = useLiveQuery(
    () => db.entries.where("type").equals("goal").toArray(),
    [],
    [] as Entry[],
  );

  const selected = useMemo(
    () => notes.find((e) => e.id === selectedId) ?? null,
    [notes, selectedId],
  );

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setContent(selected.content);
      setTagsRaw(selected.tags.join(", "));
      const m = selected.meta as NoteMeta;
      setProjectId(m.projectId ?? "");
      setGoalId(m.goalId ?? "");
      setDirty(false);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((e) => e.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = notes.filter((e) => {
      if (tagFilter && !e.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) =>
      sort === "title"
        ? (a.title || "￿").localeCompare(b.title || "￿")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [notes, search, tagFilter, sort]);

  async function newNote() {
    const created = await entriesRepo.create({
      type: "note",
      date: todayIso(),
      title: "",
      content: "",
      tags: [],
      meta: {},
    });
    setSelectedId(created.id);
  }

  async function save() {
    if (!selected) return;
    const meta: NoteMeta = {
      ...(projectId ? { projectId } : {}),
      ...(goalId ? { goalId } : {}),
    };
    await entriesRepo.update(selected.id, {
      title: title.trim(),
      content,
      tags: parseTags(tagsRaw),
      meta,
    });
    setDirty(false);
  }

  async function remove() {
    if (!selected) return;
    await entriesRepo.remove(selected.id);
    setSelectedId(null);
  }

  return (
    <div className="page journal-page">
      <PageHeader icon="🗒️" title={tr("Notizen", "Notes")} />

      <div className="journal-grid">
        <aside className="journal-list">
          <button className="btn full" onClick={newNote}>
            + {tr("Neue Notiz", "New note")}
          </button>

          <input
            className="task-input full"
            placeholder={tr("Volltextsuche…", "Full-text search…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="filter-row">
            <button
              className={`chip ${sort === "date" ? "chip-active" : ""}`}
              onClick={() => setSort("date")}
            >
              {tr("nach Datum", "by date")}
            </button>
            <button
              className={`chip ${sort === "title" ? "chip-active" : ""}`}
              onClick={() => setSort("title")}
            >
              {tr("nach Titel", "by title")}
            </button>
          </div>

          {allTags.length > 0 && (
            <div className="filter-row wrap">
              <button
                className={`chip ${tagFilter === null ? "chip-active" : ""}`}
                onClick={() => setTagFilter(null)}
              >
                {tr("alle", "all")}
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  className={`chip ${tagFilter === t ? "chip-active" : ""}`}
                  onClick={() => setTagFilter(t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="empty" data-icon="🗒️">
              <strong>{tr("Keine Notizen", "No notes")}</strong>
              <span>{tr("Lege rechts deine erste Notiz an — mit Tags und Verknüpfungen.", "Create your first note on the right — with tags and links.")}</span>
            </div>
          ) : (
            <ul className="entry-list">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className={`entry-row ${e.id === selectedId ? "entry-active" : ""}`}
                  onClick={() => setSelectedId(e.id)}
                >
                  <div className="entry-title">
                    {e.title || <span className="muted">{tr("(ohne Titel)", "(untitled)")}</span>}
                  </div>
                  <div className="entry-date">{e.updatedAt.slice(0, 10)}</div>
                  {e.tags.length > 0 && (
                    <div className="entry-tags">
                      {e.tags.map((t) => (
                        <span key={t} className="tag-mini">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="journal-editor">
          {!selected ? (
            <p className="muted empty">{tr("Notiz wählen oder neue anlegen.", "Select a note or create a new one.")}</p>
          ) : (
            <>
              <div className="editor-meta">
                <span className="editor-date">
                  {tr("zuletzt", "last edited")}: {selected.updatedAt.slice(0, 10)}
                </span>
                <button className="task-del" onClick={remove} title={tr("Löschen", "Delete")}>
                  ✕ {tr("löschen", "delete")}
                </button>
              </div>
              <input
                className="task-input full"
                placeholder={tr("Titel…", "Title…")}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
              />
              <textarea
                className="journal-textarea"
                placeholder={tr("Inhalt…", "Content…")}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
              />
              <input
                className="task-input full"
                placeholder={tr("Tags, kommagetrennt", "Tags, comma-separated")}
                value={tagsRaw}
                onChange={(e) => {
                  setTagsRaw(e.target.value);
                  setDirty(true);
                }}
              />
              <div className="note-links">
                <select
                  className="task-select"
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setDirty(true);
                  }}
                >
                  <option value="">— {tr("Projekt", "Project")} —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <select
                  className="task-select"
                  value={goalId}
                  onChange={(e) => {
                    setGoalId(e.target.value);
                    setDirty(true);
                  }}
                >
                  <option value="">— Goal —</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn" onClick={save} disabled={!dirty}>
                {dirty ? tr("Speichern", "Save") : tr("Gespeichert", "Saved")}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
