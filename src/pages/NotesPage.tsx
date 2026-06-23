import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import type { Entry } from "../types";

type Sort = "date" | "title";

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))];
}

export default function NotesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("date");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [dirty, setDirty] = useState(false);

  const notes = useLiveQuery(
    () => db.entries.where("type").equals("note").toArray(),
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
    await entriesRepo.update(selected.id, {
      title: title.trim(),
      content,
      tags: parseTags(tagsRaw),
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
      <header className="page-head">
        <h1>
          <span className="page-icon">🗒️</span> Notizen
        </h1>
      </header>

      <div className="journal-grid">
        <aside className="journal-list">
          <button className="btn full" onClick={newNote}>
            + Neue Notiz
          </button>

          <input
            className="task-input full"
            placeholder="Volltextsuche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="filter-row">
            <button
              className={`chip ${sort === "date" ? "chip-active" : ""}`}
              onClick={() => setSort("date")}
            >
              nach Datum
            </button>
            <button
              className={`chip ${sort === "title" ? "chip-active" : ""}`}
              onClick={() => setSort("title")}
            >
              nach Titel
            </button>
          </div>

          {allTags.length > 0 && (
            <div className="filter-row wrap">
              <button
                className={`chip ${tagFilter === null ? "chip-active" : ""}`}
                onClick={() => setTagFilter(null)}
              >
                alle
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
            <p className="muted empty">Keine Notizen.</p>
          ) : (
            <ul className="entry-list">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className={`entry-row ${e.id === selectedId ? "entry-active" : ""}`}
                  onClick={() => setSelectedId(e.id)}
                >
                  <div className="entry-title">
                    {e.title || <span className="muted">(ohne Titel)</span>}
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
            <p className="muted empty">Notiz wählen oder neue anlegen.</p>
          ) : (
            <>
              <div className="editor-meta">
                <span className="editor-date">
                  zuletzt: {selected.updatedAt.slice(0, 10)}
                </span>
                <button className="task-del" onClick={remove} title="Löschen">
                  ✕ löschen
                </button>
              </div>
              <input
                className="task-input full"
                placeholder="Titel…"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
              />
              <textarea
                className="journal-textarea"
                placeholder="Inhalt…"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
              />
              <input
                className="task-input full"
                placeholder="Tags, kommagetrennt"
                value={tagsRaw}
                onChange={(e) => {
                  setTagsRaw(e.target.value);
                  setDirty(true);
                }}
              />
              <button className="btn" onClick={save} disabled={!dirty}>
                {dirty ? "Speichern" : "Gespeichert"}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
