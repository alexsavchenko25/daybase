import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../db";
import type { Entry } from "../types";
import { useI18n } from "../i18n";
import Icon, { type IconName } from "./Icon";

interface Item {
  key: string;
  icon: IconName;
  title: string;
  sub?: string;
  run: () => void;
}
interface Group {
  label: string;
  items: Item[];
}

// Statische Befehle (Seiten + Erstellen). keywords für Fuzzy-Match.
const PAGES: { icon: IconName; label: string; labelEn: string; path: string; kw: string }[] = [
  { icon: "dashboard", label: "Dashboard", labelEn: "Dashboard", path: "/", kw: "home start" },
  { icon: "tasks", label: "Tasks", labelEn: "Tasks", path: "/tasks", kw: "aufgaben" },
  { icon: "weekplan", label: "Wochenplan", labelEn: "Weekly Plan", path: "/weekplan", kw: "week plan" },
  { icon: "goal", label: "Goals", labelEn: "Goals", path: "/goals", kw: "ziele" },
  { icon: "project", label: "Projects", labelEn: "Projects", path: "/projects", kw: "projekte" },
  { icon: "habit", label: "Habit Tracker", labelEn: "Habit Tracker", path: "/habits", kw: "habits" },
  { icon: "focus", label: "Focus Mode", labelEn: "Focus Mode", path: "/focus", kw: "timer session" },
  { icon: "trades", label: "Trading Journal", labelEn: "Trading Journal", path: "/trades", kw: "trades" },
  { icon: "journal", label: "Tagebuch", labelEn: "Journal", path: "/journal", kw: "journal" },
  { icon: "notes", label: "Notizen", labelEn: "Notes", path: "/notes", kw: "notes" },
  { icon: "review", label: "Daily Review", labelEn: "Daily Review", path: "/review", kw: "review täglich" },
  { icon: "weekly-review", label: "Weekly Review", labelEn: "Weekly Review", path: "/weekly-review", kw: "review woche" },
  { icon: "account", label: "Konto", labelEn: "Account", path: "/auth", kw: "login cloud auth" },
  { icon: "settings", label: "Einstellungen", labelEn: "Settings", path: "/settings", kw: "settings backup" },
];
const CREATE: { icon: IconName; label: string; labelEn: string; path: string; kw: string }[] = [
  { icon: "tasks", label: "Neue Task", labelEn: "New task", path: "/tasks", kw: "task aufgabe neu add" },
  { icon: "goal", label: "Neues Goal", labelEn: "New goal", path: "/goals?new=1", kw: "ziel goal neu add" },
  { icon: "project", label: "Neues Project", labelEn: "New project", path: "/projects?new=1", kw: "projekt neu add" },
  { icon: "notes", label: "Neue Notiz", labelEn: "New note", path: "/notes", kw: "note notiz neu add" },
  { icon: "trades", label: "Neuer Trade", labelEn: "New trade", path: "/trades", kw: "trade neu add" },
];
// Such-Typen + Deep-Link zur passenden Seite/Auswahl.
const SEARCH_GROUPS: {
  type: Entry["type"];
  label: string;
  icon: IconName;
  to: (e: Entry) => string;
}[] = [
  { type: "task", label: "Tasks", icon: "tasks", to: (e) => `/tasks?date=${e.date}` },
  { type: "note", label: "Notizen", icon: "notes", to: (e) => `/notes?sel=${e.id}` },
  { type: "journal", label: "Tagebuch", icon: "journal", to: (e) => `/journal?sel=${e.id}` },
  { type: "review", label: "Daily Reviews", icon: "review", to: (e) => `/review?date=${e.date}` },
  {
    type: "weeklyreview",
    label: "Weekly Reviews",
    icon: "weekly-review",
    to: (e) => `/weekly-review?week=${e.date}`,
  },
  { type: "goal", label: "Goals", icon: "goal", to: () => "/goals" },
  { type: "project", label: "Projects", icon: "project", to: () => "/projects" },
  { type: "trade", label: "Trading Journal", icon: "trades", to: () => "/trades" },
];

// Durchsuchbarer Text je Entry: Titel, Beschreibung, Tags, Datum, Kategorie.
function haystack(e: Entry): string {
  const m = e.meta as { category?: string; setupTag?: string; symbol?: string };
  return [
    e.title,
    e.content,
    e.tags.join(" "),
    e.date,
    m.category ?? "",
    m.setupTag ?? "",
    m.symbol ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export default function CommandPalette() {
  const { language, tr } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [data, setData] = useState<Entry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Ctrl/Cmd+K toggelt, Esc schließt.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Beim Öffnen: Such-Daten laden + Reset.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    db.entries
      .where("type")
      .anyOf([
        "task",
        "note",
        "journal",
        "review",
        "weeklyreview",
        "goal",
        "project",
        "trade",
      ])
      .toArray()
      .then(setData);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => previousFocusRef.current?.focus();
  }, [open]);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  const groups: Group[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Group[] = [];

    const pages = PAGES.filter((p) => {
      const label = language === "en" && "labelEn" in p ? p.labelEn : p.label;
      return !q || label.toLowerCase().includes(q) || p.kw.includes(q);
    }).map((p) => ({ key: "p" + p.path, icon: p.icon, title: language === "en" && "labelEn" in p ? p.labelEn : p.label, run: () => go(p.path) }));
    if (pages.length) out.push({ label: tr("Seiten", "Pages"), items: pages });

    const create = CREATE.filter((c) => {
      const label = language === "en" ? c.labelEn : c.label;
      return !q || label.toLowerCase().includes(q) || c.kw.includes(q);
    }).map((c) => ({ key: "c" + c.label, icon: c.icon, title: language === "en" ? c.labelEn : c.label, run: () => go(c.path) }));
    if (create.length) out.push({ label: tr("Erstellen", "Create"), items: create });

    if (q) {
      for (const sg of SEARCH_GROUPS) {
        const hits = data
          .filter((e) => e.type === sg.type && haystack(e).includes(q))
          .slice(0, 6)
          .map((e) => ({
            key: e.id,
            icon: sg.icon,
            title: e.title || tr("(ohne Titel)", "(untitled)"),
            sub: (e.content || e.date).slice(0, 60) || undefined,
            run: () => go(sg.to(e)),
          }));
        if (hits.length) out.push({ label: sg.label, items: hits });
      }
    }
    return out;
  }, [query, data, language]); // eslint-disable-line react-hooks/exhaustive-deps

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    if (active >= flat.length) setActive(0);
  }, [flat.length, active]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[active]?.run();
    }
  }

  function trapFocus(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  let idx = -1;
  return (
    <div className="cmdk-overlay" onMouseDown={() => setOpen(false)}>
      <div
        ref={panelRef}
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Befehlspalette", "Command palette")}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder={tr("Suchen oder Befehl… (Tasks, Goals, Seiten)", "Search or enter a command… (Tasks, Goals, Pages)")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          aria-label={tr("Daybase durchsuchen", "Search Daybase")}
        />
        <div className="cmdk-list" role="listbox" aria-label={tr("Suchergebnisse", "Search results")}>
          {flat.length === 0 ? (
            <div className="cmdk-empty">{tr("Nichts gefunden.", "Nothing found.")}</div>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="cmdk-group">
                <div className="cmdk-group-label">{g.label}</div>
                {g.items.map((it) => {
                  idx++;
                  const myIdx = idx;
                  return (
                    <button
                      key={it.key}
                      className={`cmdk-item ${myIdx === active ? "active" : ""}`}
                      role="option"
                      aria-selected={myIdx === active}
                      onMouseEnter={() => setActive(myIdx)}
                      onClick={it.run}
                    >
                      <span className="cmdk-ico"><Icon name={it.icon} /></span>
                      <span className="cmdk-text">
                        <span className="cmdk-title">{it.title}</span>
                        {it.sub && <span className="cmdk-sub">{it.sub}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑↓</kbd> {tr("navigieren", "navigate")}</span>
          <span><kbd>↵</kbd> {tr("öffnen", "open")}</span>
          <span><kbd>esc</kbd> {tr("schließen", "close")}</span>
        </div>
      </div>
    </div>
  );
}
