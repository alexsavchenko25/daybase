import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import { deriveTitle } from "../utils/inbox";
import { openQuickCapture, QUICK_CAPTURE_SHORTCUT } from "../components/QuickCapture";
import PageHeader from "../components/PageHeader";
import { useI18n } from "../i18n";
import type { Entry } from "../types";

type ConvertTo = "task" | "note" | "journal";

// Legt den konvertierten Eintrag an und entfernt das Inbox-Item ERST bei
// Erfolg — schlägt create() fehl, bleibt das Capture unangetastet erhalten.
async function convert(entry: Entry, to: ConvertTo): Promise<void> {
  const title = entry.title || deriveTitle(entry.content);
  const base = { date: todayIso(), title, content: entry.content, tags: entry.tags };
  if (to === "task") {
    await entriesRepo.create({ ...base, type: "task", content: "", meta: { done: false, priority: "medium" } });
  } else if (to === "note") {
    await entriesRepo.create({ ...base, type: "note", meta: {} });
  } else {
    await entriesRepo.create({ ...base, type: "journal", meta: {} });
  }
  await entriesRepo.remove(entry.id);
}

export default function InboxPage() {
  const { tr } = useI18n();
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("sel"));
  useEffect(() => {
    const s = params.get("sel");
    if (s) setSelectedId(s);
  }, [params]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const items = useLiveQuery(
    () => db.entries.where("type").equals("inbox").reverse().sortBy("createdAt"),
    [],
    [] as Entry[],
  );

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setDraft(entry.content);
  }

  async function saveEdit(entry: Entry) {
    const t = draft.trim();
    if (!t) {
      setEditingId(null);
      return;
    }
    await entriesRepo.update(entry.id, { title: deriveTitle(t), content: t });
    setEditingId(null);
  }

  async function doConvert(entry: Entry, to: ConvertTo) {
    setError(null);
    try {
      await convert(entry, to);
    } catch (err) {
      setError(`${tr("Konvertierung fehlgeschlagen", "Conversion failed")}: ${(err as Error).message}`);
    }
  }

  async function remove(id: string) {
    if (editingId === id) setEditingId(null);
    await entriesRepo.remove(id);
  }

  return (
    <div className="page">
      <PageHeader
        icon="📥"
        title="Inbox"
        subtitle={
          items.length === 0
            ? tr("Nichts zu triagen.", "Nothing to triage.")
            : tr(
                `${items.length} ${items.length === 1 ? "Eintrag" : "Einträge"} unsortiert — in Task, Notiz oder Tagebuch umwandeln.`,
                `${items.length} ${items.length === 1 ? "item" : "items"} unsorted — convert each into a task, note or journal entry.`,
              )
        }
        actions={
          <button className="btn sm" onClick={openQuickCapture}>
            + {tr("Erfassen", "Capture")} <kbd>{QUICK_CAPTURE_SHORTCUT}</kbd>
          </button>
        }
      />

      {error && <p className="set-msg neg">{error}</p>}

      {items.length === 0 ? (
        <div className="empty" data-icon="📥">
          <strong>{tr("Inbox leer", "Inbox is empty")}</strong>
          <span>
            {tr(
              `Alles getriaged. Neues festhalten mit ${QUICK_CAPTURE_SHORTCUT} — sortieren kannst du später.`,
              `All triaged. Capture something new with ${QUICK_CAPTURE_SHORTCUT} — sort it out later.`,
            )}
          </span>
          <button className="btn sm" onClick={openQuickCapture}>
            + {tr("Erfassen", "Capture")}
          </button>
        </div>
      ) : (
        <ul className="task-list">
          {items.map((entry) => {
            const editing = editingId === entry.id;
            return (
              <li
                key={entry.id}
                className={`task-item ${entry.id === selectedId ? "entry-active" : ""}`}
              >
                {editing ? (
                  <div className="qc-body">
                    <textarea
                      className="journal-textarea sm full"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="rv-actions">
                      <button className="btn sm" onClick={() => saveEdit(entry)}>
                        {tr("Speichern", "Save")}
                      </button>
                      <button className="chip sm" onClick={() => setEditingId(null)}>
                        {tr("Abbrechen", "Cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Text zuerst, Triage-Aktionen darunter: 5 gleichrangige
                        Controls neben dem Text waren auf schmalen Screens
                        unlesbar gequetscht. */}
                    <div className="task-item-row inbox-text-row">
                      <span className="inbox-text">{entry.content}</span>
                      <span className="task-date">{entry.createdAt.slice(0, 10)}</span>
                    </div>
                    <div className="inbox-actions">
                      <span className="inbox-actions-label">{tr("Umwandeln in", "Convert to")}</span>
                      <button className="chip sm" onClick={() => doConvert(entry, "task")}>
                        ✅ {tr("Task", "Task")}
                      </button>
                      <button className="chip sm" onClick={() => doConvert(entry, "note")}>
                        🗒️ {tr("Notiz", "Note")}
                      </button>
                      <button className="chip sm" onClick={() => doConvert(entry, "journal")}>
                        📓 {tr("Tagebuch", "Journal")}
                      </button>
                      <button
                        className="chip sm inbox-secondary"
                        title={tr("Bearbeiten", "Edit")}
                        onClick={() => startEdit(entry)}
                      >
                        ✎ <span className="inbox-btn-text">{tr("Bearbeiten", "Edit")}</span>
                      </button>
                      <button
                        className="task-del inbox-del"
                        title={tr("Löschen", "Delete")}
                        aria-label={tr("Löschen", "Delete")}
                        onClick={() => remove(entry.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
