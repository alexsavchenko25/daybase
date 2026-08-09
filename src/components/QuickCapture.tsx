import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import { deriveTitle } from "../utils/inbox";
import { useI18n } from "../i18n";

// Globaler Open/Closed-Zustand nach demselben Muster wie i18n.ts
// (useSyncExternalStore statt Context) — so kann CommandPalette (oder
// jede andere Stelle) die Erfassung öffnen, ohne Props durchzureichen.
let isOpen = false;
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}
export function openQuickCapture(): void {
  isOpen = true;
  notify();
}
function closeQuickCapture(): void {
  isOpen = false;
  notify();
}
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
function useQuickCaptureOpen(): boolean {
  return useSyncExternalStore(subscribe, () => isOpen, () => false);
}

// Sichtbarer globaler Shortcut, unabhängig vom Command Palette-Weg.
// Plattform-abhängig beschriftet — ⌘-Glyphen auf Windows/Linux waren schlicht
// falsch (der Handler hört ohnehin auf metaKey ODER ctrlKey).
const IS_APPLE = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
export const MOD_KEY = IS_APPLE ? "⌘" : "Strg";
export const QUICK_CAPTURE_SHORTCUT = IS_APPLE ? "⌘⇧C" : "Strg+⇧+C";

export default function QuickCapture() {
  const { tr } = useI18n();
  const open = useQuickCaptureOpen();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        openQuickCapture();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 0);
    else setText("");
  }, [open]);

  async function save() {
    const t = text.trim();
    if (!t) {
      closeQuickCapture();
      return;
    }
    setSaving(true);
    await entriesRepo.create({
      type: "inbox",
      date: todayIso(),
      title: deriveTitle(t),
      content: t,
      tags: [],
      meta: {},
    });
    setSaving(false);
    closeQuickCapture();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeQuickCapture();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      save();
    }
  }

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onMouseDown={() => closeQuickCapture()}>
      <div className="cmdk-panel qc-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="qc-body">
          <span className="dash-label">📥 {tr("Quick Capture", "Quick capture")}</span>
          <textarea
            ref={ref}
            className="journal-textarea sm full qc-textarea"
            placeholder={tr(
              "Kurz notieren — sortieren kommt später…",
              "Jot it down — sort it out later…",
            )}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="rv-actions">
            <button className="btn sm" onClick={save} disabled={saving || !text.trim()}>
              {tr("Speichern", "Save")}
            </button>
            <button className="chip sm" onClick={() => closeQuickCapture()}>
              {tr("Abbrechen", "Cancel")}
            </button>
          </div>
        </div>
        <div className="cmdk-foot">
          <span><kbd>{MOD_KEY}</kbd>+<kbd>↵</kbd> {tr("speichern", "save")}</span>
          <span><kbd>esc</kbd> {tr("schließen", "close")}</span>
          <span className="qc-foot-hint">{tr("landet in der Inbox", "lands in your inbox")}</span>
        </div>
      </div>
    </div>
  );
}
