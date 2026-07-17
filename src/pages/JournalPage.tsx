import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import type { Entry } from "../types";
import { useI18n } from "../i18n";

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))];
}

export default function JournalPage() {
  const { tr } = useI18n();
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => params.get("sel"),
  );
  useEffect(() => {
    const s = params.get("sel");
    if (s) setSelectedId(s);
  }, [params]);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Editor-Draft (lokal, bis "Speichern").
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [dirty, setDirty] = useState(false);

  const entries = useLiveQuery(
    async () => {
      const list = await db.entries.where("type").equals("journal").toArray();
      return list.sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      );
    },
    [],
    [] as Entry[],
  );

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  // Draft laden, wenn Auswahl wechselt.
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
    entries.forEach((e) => e.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (tagFilter && !e.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        e.date.includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q)
      );
    });
  }, [entries, search, tagFilter]);

  async function newEntry() {
    const today = todayIso();
    const created = await entriesRepo.create({
      type: "journal",
      date: today,
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
      <PageHeader
        icon="journal"
        title={tr("Tagebuch", "Journal")}
        subtitle={tr("Gedanken festhalten, Muster erkennen und Tage bewusst abschließen.", "Capture thoughts, notice patterns and close days intentionally.")}
      />

      <div className={`journal-grid ${selected ? "journal-has-selection" : ""}`}>
        {/* Liste / Navigation */}
        <aside className="journal-list">
          <button className="btn full" onClick={newEntry}>
            <Icon name="plus" size={16} /> {tr("Neuer Eintrag", "New entry")}
          </button>

          <input
            className="task-input full"
            placeholder={tr("Suche (Datum/Text)…", "Search (date/text)…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

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
            <EmptyState
              icon="journal"
              title={tr("Keine Einträge", "No entries")}
              description={tr("Beginne mit einem Gedanken oder einem kurzen Rückblick.", "Start with a thought or a short reflection.")}
              compact
            />
          ) : (
            <ul className="entry-list">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className={`entry-row ${e.id === selectedId ? "entry-active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(e.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(e.id);
                    }
                  }}
                >
                  <div className="entry-date">{e.date}</div>
                  <div className="entry-title">
                    {e.title || <span className="muted">{tr("(ohne Titel)", "(untitled)")}</span>}
                  </div>
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

        {/* Editor */}
        <section className="journal-editor">
          {selected && (
            <button className="btn subtle mobile-editor-back" type="button" onClick={() => setSelectedId(null)}>
              ← {tr("Alle Einträge", "All entries")}
            </button>
          )}
          {!selected ? (
            <EmptyState icon="journal" title={tr("Eintrag auswählen", "Select an entry")} description={tr("Wähle links einen Eintrag oder lege einen neuen an.", "Choose an entry on the left or create a new one.")} compact />
          ) : (
            <>
              <div className="editor-meta">
                <span className="editor-date">{selected.date}</span>
                <button className="btn danger sm" onClick={remove} title={tr("Löschen", "Delete")}>
                  <Icon name="trash" size={15} /> {tr("Löschen", "Delete")}
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
                placeholder={tr("Was war heute…", "What happened today…")}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
                }}
              />
              <input
                className="task-input full"
                placeholder={tr("Tags, kommagetrennt (z.B. arbeit, sport)", "Tags, comma-separated (e.g. work, sport)")}
                value={tagsRaw}
                onChange={(e) => {
                  setTagsRaw(e.target.value);
                  setDirty(true);
                }}
              />
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
