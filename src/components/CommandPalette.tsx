import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../db";
import type { Entry } from "../types";

interface Item {
  key: string;
  icon: string;
  title: string;
  sub?: string;
  run: () => void;
}
interface Group {
  label: string;
  items: Item[];
}

// Statische Befehle (Seiten + Erstellen). keywords für Fuzzy-Match.
const PAGES = [
  { icon: "🏠", label: "Dashboard", path: "/", kw: "home start" },
  { icon: "✅", label: "Tasks", path: "/tasks", kw: "aufgaben" },
  { icon: "🗓️", label: "Wochenplan", path: "/weekplan", kw: "week plan" },
  { icon: "📈", label: "Trading Journal", path: "/trades", kw: "trades" },
  { icon: "🔁", label: "Habit Tracker", path: "/habits", kw: "habits" },
  { icon: "📓", label: "Tagebuch", path: "/journal", kw: "journal" },
  { icon: "🗒️", label: "Notizen", path: "/notes", kw: "notes" },
  { icon: "📝", label: "Daily Review", path: "/review", kw: "review täglich" },
  { icon: "📅", label: "Weekly Review", path: "/weekly-review", kw: "review woche" },
  { icon: "🎯", label: "Goals", path: "/goals", kw: "ziele" },
  { icon: "📂", label: "Projects", path: "/projects", kw: "projekte" },
  { icon: "⚙️", label: "Einstellungen", path: "/settings", kw: "settings backup" },
];
const CREATE = [
  { icon: "✅", label: "Neue Task", path: "/tasks", kw: "task aufgabe neu add" },
  { icon: "🎯", label: "Neues Goal", path: "/goals", kw: "ziel goal neu add" },
  { icon: "📂", label: "Neues Project", path: "/projects", kw: "projekt neu add" },
  { icon: "🗒️", label: "Neue Notiz", path: "/notes", kw: "note notiz neu add" },
  { icon: "📈", label: "Neuer Trade", path: "/trades", kw: "trade neu add" },
];
const SEARCH_GROUPS: { type: Entry["type"]; label: string; icon: string; path: string }[] =
  [
    { type: "task", label: "Tasks", icon: "✅", path: "/tasks" },
    { type: "note", label: "Notizen", icon: "🗒️", path: "/notes" },
    { type: "goal", label: "Goals", icon: "🎯", path: "/goals" },
    { type: "project", label: "Projects", icon: "📂", path: "/projects" },
  ];

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [data, setData] = useState<Entry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setQuery("");
    setActive(0);
    db.entries
      .where("type")
      .anyOf(["task", "note", "goal", "project"])
      .toArray()
      .then(setData);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  const groups: Group[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Group[] = [];

    const pages = PAGES.filter(
      (p) => !q || p.label.toLowerCase().includes(q) || p.kw.includes(q),
    ).map((p) => ({ key: "p" + p.path, icon: p.icon, title: p.label, run: () => go(p.path) }));
    if (pages.length) out.push({ label: "Seiten", items: pages });

    const create = CREATE.filter(
      (c) => !q || c.label.toLowerCase().includes(q) || c.kw.includes(q),
    ).map((c) => ({ key: "c" + c.label, icon: c.icon, title: c.label, run: () => go(c.path) }));
    if (create.length) out.push({ label: "Erstellen", items: create });

    if (q) {
      for (const sg of SEARCH_GROUPS) {
        const hits = data
          .filter(
            (e) =>
              e.type === sg.type &&
              (e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q)),
          )
          .slice(0, 5)
          .map((e) => ({
            key: e.id,
            icon: sg.icon,
            title: e.title || "(ohne Titel)",
            sub: e.content.slice(0, 60) || undefined,
            run: () => go(sg.path),
          }));
        if (hits.length) out.push({ label: sg.label, items: hits });
      }
    }
    return out;
  }, [query, data]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!open) return null;

  let idx = -1;
  return (
    <div className="cmdk-overlay" onMouseDown={() => setOpen(false)}>
      <div className="cmdk-panel" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Suchen oder Befehl… (Tasks, Goals, Seiten)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
        />
        <div className="cmdk-list">
          {flat.length === 0 ? (
            <div className="cmdk-empty">Nichts gefunden.</div>
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
                      onMouseEnter={() => setActive(myIdx)}
                      onClick={it.run}
                    >
                      <span className="cmdk-ico">{it.icon}</span>
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
          <span>↑↓ navigieren</span>
          <span>↵ öffnen</span>
          <span>esc schließen</span>
        </div>
      </div>
    </div>
  );
}
