import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { todayIso } from "../utils/date";
import {
  computeTradePnl,
  fmtUsd,
  SETUP_PRESETS,
  SYMBOL_PRESETS,
} from "../utils/trade";
import TradeCalendar from "./TradeCalendar";
import type { Entry, TradeMeta } from "../types";

type SortKey = "date" | "pnl" | "symbol";
const MAX_IMG = 2 * 1024 * 1024; // 2 MB

function tradeMeta(e: Entry): TradeMeta {
  return e.meta as TradeMeta;
}

const EMPTY = {
  date: "",
  symbol: "",
  direction: "long" as TradeMeta["direction"],
  entryPrice: "",
  exitPrice: "",
  size: "",
  pointValue: "",
  setupTag: "",
  screenshot: undefined as string | undefined,
};

export default function TradesPage() {
  const [form, setForm] = useState({ ...EMPTY, date: todayIso() });
  const [editId, setEditId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const trades = useLiveQuery(
    () => db.entries.where("type").equals("trade").toArray(),
    [],
    [] as Entry[],
  );

  // Live-PnL-Vorschau aus aktuellem Formular.
  const previewPnl = useMemo(() => {
    const en = parseFloat(form.entryPrice);
    const ex = parseFloat(form.exitPrice);
    const sz = parseFloat(form.size);
    const pv = parseFloat(form.pointValue);
    if ([en, ex, sz, pv].some((n) => Number.isNaN(n))) return null;
    return computeTradePnl(en, ex, sz, pv, form.direction);
  }, [form]);

  const allSetups = useMemo(() => {
    const s = new Set<string>();
    trades.forEach((t) => {
      const tag = tradeMeta(t).setupTag;
      if (tag) s.add(tag);
    });
    return [...s].sort();
  }, [trades]);

  const filtered = useMemo(() => {
    const list = tagFilter
      ? trades.filter((t) => tradeMeta(t).setupTag === tagFilter)
      : trades;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const ma = tradeMeta(a);
      const mb = tradeMeta(b);
      let cmp = 0;
      if (sortKey === "pnl") cmp = ma.pnl - mb.pnl;
      else if (sortKey === "symbol") cmp = ma.symbol.localeCompare(mb.symbol);
      else cmp = a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
      return cmp * dir;
    });
  }, [trades, tagFilter, sortKey, sortDir]);

  // Statistik über die GEFILTERTE Menge (so sieht man Setup-Profitabilität).
  const stats = useMemo(() => {
    const n = filtered.length;
    if (n === 0) return null;
    const pnls = filtered.map((t) => tradeMeta(t).pnl);
    const total = pnls.reduce((s, p) => s + p, 0);
    const wins = pnls.filter((p) => p > 0).length;
    let bestT = filtered[0];
    let worstT = filtered[0];
    filtered.forEach((t) => {
      if (tradeMeta(t).pnl > tradeMeta(bestT).pnl) bestT = t;
      if (tradeMeta(t).pnl < tradeMeta(worstT).pnl) worstT = t;
    });
    return {
      n,
      total,
      avg: total / n,
      winRate: (wins / n) * 100,
      best: tradeMeta(bestT),
      worst: tradeMeta(worstT),
    };
  }, [filtered]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function resetForm() {
    setForm({ ...EMPTY, date: todayIso() });
    setEditId(null);
  }

  function loadTrade(e: Entry) {
    const m = tradeMeta(e);
    setForm({
      date: e.date,
      symbol: m.symbol,
      direction: m.direction,
      entryPrice: String(m.entryPrice),
      exitPrice: String(m.exitPrice),
      size: String(m.size),
      pointValue: String(m.pointValue),
      setupTag: m.setupTag,
      screenshot: m.screenshot,
    });
    setEditId(e.id);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMG) {
      alert("Bild zu groß (max. 2 MB).");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("screenshot", reader.result as string);
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const en = parseFloat(form.entryPrice);
    const ex = parseFloat(form.exitPrice);
    const sz = parseFloat(form.size);
    const pv = parseFloat(form.pointValue);
    if (!form.symbol.trim() || [en, ex, sz, pv].some((n) => Number.isNaN(n))) {
      alert("Symbol, Entry, Exit, Size, $/Punkt sind Pflicht (Zahlen).");
      return;
    }
    const pnl = computeTradePnl(en, ex, sz, pv, form.direction);
    const meta: TradeMeta = {
      symbol: form.symbol.trim().toUpperCase(),
      direction: form.direction,
      entryPrice: en,
      exitPrice: ex,
      size: sz,
      pointValue: pv,
      pnl,
      setupTag: form.setupTag.trim(),
      screenshot: form.screenshot,
    };
    if (editId) {
      await entriesRepo.update(editId, {
        date: form.date,
        title: `${meta.symbol} ${meta.direction}`,
        content: "",
        tags: meta.setupTag ? [meta.setupTag] : [],
        meta,
      });
    } else {
      await entriesRepo.create({
        type: "trade",
        date: form.date,
        title: `${meta.symbol} ${meta.direction}`,
        content: "",
        tags: meta.setupTag ? [meta.setupTag] : [],
        meta,
      });
    }
    resetForm();
  }

  async function remove(id: string) {
    if (editId === id) resetForm();
    await entriesRepo.remove(id);
  }

  function headerSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="page trades-page">
      <header className="page-head">
        <h1>
          <span className="page-icon">📈</span> Trading Journal
        </h1>
      </header>

      {/* Statistik */}
      {stats && (
        <div className="stat-row">
          <StatCard label="Trades" value={String(stats.n)} />
          <StatCard
            label="Win-Rate"
            value={`${stats.winRate.toFixed(1)}%`}
          />
          <StatCard
            label="Total PnL"
            value={fmtUsd(stats.total)}
            tone={stats.total >= 0 ? "pos" : "neg"}
          />
          <StatCard
            label="Ø PnL"
            value={fmtUsd(stats.avg)}
            tone={stats.avg >= 0 ? "pos" : "neg"}
          />
          <StatCard
            label="Bester"
            value={fmtUsd(stats.best.pnl)}
            tone="pos"
          />
          <StatCard
            label="Schlechtester"
            value={fmtUsd(stats.worst.pnl)}
            tone="neg"
          />
        </div>
      )}

      {/* P&L-Kalender */}
      <TradeCalendar trades={trades} />

      {/* Trade-Form */}
      <form className="trade-form" onSubmit={submit}>
        <div className="tf-grid">
          <label>
            Datum
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </label>
          <label>
            Symbol
            <input
              list="symbol-presets"
              placeholder="NQ"
              value={form.symbol}
              onChange={(e) => set("symbol", e.target.value)}
            />
            <datalist id="symbol-presets">
              {SYMBOL_PRESETS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label>
            Richtung
            <select
              value={form.direction}
              onChange={(e) =>
                set("direction", e.target.value as TradeMeta["direction"])
              }
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label>
            Entry
            <input
              type="number"
              step="any"
              value={form.entryPrice}
              onChange={(e) => set("entryPrice", e.target.value)}
            />
          </label>
          <label>
            Exit
            <input
              type="number"
              step="any"
              value={form.exitPrice}
              onChange={(e) => set("exitPrice", e.target.value)}
            />
          </label>
          <label>
            Size
            <input
              type="number"
              step="any"
              value={form.size}
              onChange={(e) => set("size", e.target.value)}
            />
          </label>
          <label>
            $/Punkt
            <input
              type="number"
              step="any"
              placeholder="20"
              value={form.pointValue}
              onChange={(e) => set("pointValue", e.target.value)}
            />
          </label>
          <label>
            Setup
            <input
              list="setup-presets"
              placeholder="Breakout"
              value={form.setupTag}
              onChange={(e) => set("setupTag", e.target.value)}
            />
            <datalist id="setup-presets">
              {SETUP_PRESETS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="tf-file">
            Screenshot
            <input type="file" accept="image/*" onChange={onFile} />
          </label>
        </div>

        <div className="tf-foot">
          <span className="tf-pnl">
            PnL:{" "}
            {previewPnl === null ? (
              <span className="muted">—</span>
            ) : (
              <strong className={previewPnl >= 0 ? "pos" : "neg"}>
                {fmtUsd(previewPnl)}
              </strong>
            )}
          </span>
          {form.screenshot && (
            <img className="tf-thumb" src={form.screenshot} alt="screenshot" />
          )}
          <div className="tf-actions">
            <button className="btn" type="submit">
              {editId ? "Speichern" : "Trade anlegen"}
            </button>
            {editId && (
              <button className="chip" type="button" onClick={resetForm}>
                Abbrechen
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Setup-Filter */}
      {allSetups.length > 0 && (
        <div className="filter-row wrap">
          <button
            className={`chip ${tagFilter === null ? "chip-active" : ""}`}
            onClick={() => setTagFilter(null)}
          >
            alle Setups
          </button>
          {allSetups.map((s) => (
            <button
              key={s}
              className={`chip ${tagFilter === s ? "chip-active" : ""}`}
              onClick={() => setTagFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Trade-Liste */}
      {filtered.length === 0 ? (
        <p className="muted empty">Keine Trades.</p>
      ) : (
        <div className="trade-table-wrap">
          <table className="trade-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => headerSort("date")}>
                  Datum{arrow("date")}
                </th>
                <th className="sortable" onClick={() => headerSort("symbol")}>
                  Symbol{arrow("symbol")}
                </th>
                <th>Dir</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Size</th>
                <th>$/Pkt</th>
                <th>Setup</th>
                <th className="sortable num" onClick={() => headerSort("pnl")}>
                  PnL{arrow("pnl")}
                </th>
                <th>📷</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const m = tradeMeta(t);
                return (
                  <tr key={t.id} onClick={() => loadTrade(t)}>
                    <td>{t.date}</td>
                    <td>{m.symbol}</td>
                    <td>
                      <span className={`dir dir-${m.direction}`}>
                        {m.direction === "long" ? "L" : "S"}
                      </span>
                    </td>
                    <td className="num">{m.entryPrice}</td>
                    <td className="num">{m.exitPrice}</td>
                    <td className="num">{m.size}</td>
                    <td className="num">{m.pointValue}</td>
                    <td>{m.setupTag || "—"}</td>
                    <td className={`num ${m.pnl >= 0 ? "pos" : "neg"}`}>
                      {fmtUsd(m.pnl)}
                    </td>
                    <td>
                      {m.screenshot ? (
                        <img
                          className="row-thumb"
                          src={m.screenshot}
                          alt="ss"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            const w = window.open();
                            if (w) w.document.write(`<img src="${m.screenshot}">`);
                          }}
                        />
                      ) : (
                        ""
                      )}
                    </td>
                    <td>
                      <button
                        className="task-del"
                        title="Löschen"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          remove(t.id);
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
