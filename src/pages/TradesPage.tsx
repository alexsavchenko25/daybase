import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { entriesRepo } from "../repository";
import { mondayOfIso, addDaysIso, todayIso } from "../utils/date";
import {
  computeTradePnl,
  fmtUsd,
  SETUP_PRESETS,
  SYMBOL_PRESETS,
} from "../utils/trade";
import TradeCalendar from "./TradeCalendar";
import PageHeader from "../components/PageHeader";
import type { Entry, TradeMeta } from "../types";

type SortKey = "date" | "pnl" | "symbol";
type Period = "today" | "week" | "month" | "all";
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
  const today = todayIso();
  const [form, setForm] = useState({ ...EMPTY, date: today });
  const [editId, setEditId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Filter
  const [period, setPeriod] = useState<Period>("all");
  const [fSymbol, setFSymbol] = useState("");
  const [fSetup, setFSetup] = useState("");
  const [fDir, setFDir] = useState<"all" | "long" | "short">("all");
  const [fResult, setFResult] = useState<"all" | "profit" | "loss">("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const trades = useLiveQuery(
    () => db.entries.where("type").equals("trade").toArray(),
    [],
    [] as Entry[],
  );

  const allSymbols = useMemo(
    () => [...new Set(trades.map((t) => tradeMeta(t).symbol).filter(Boolean))].sort(),
    [trades],
  );
  const allSetups = useMemo(
    () => [...new Set(trades.map((t) => tradeMeta(t).setupTag).filter(Boolean))].sort(),
    [trades],
  );

  function inTime(date: string): boolean {
    if (selectedDay) return date === selectedDay;
    if (period === "all") return true;
    if (period === "today") return date === today;
    if (period === "month") return date.slice(0, 7) === today.slice(0, 7);
    const mon = mondayOfIso(today);
    return date >= mon && date <= addDaysIso(mon, 6); // week
  }

  const filtered = useMemo(() => {
    const list = trades.filter((t) => {
      const m = tradeMeta(t);
      if (!inTime(t.date)) return false;
      if (fSymbol && m.symbol !== fSymbol) return false;
      if (fSetup && m.setupTag !== fSetup) return false;
      if (fDir !== "all" && m.direction !== fDir) return false;
      if (fResult === "profit" && m.pnl <= 0) return false;
      if (fResult === "loss" && m.pnl >= 0) return false;
      return true;
    });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, period, fSymbol, fSetup, fDir, fResult, selectedDay, sortKey, sortDir]);

  // KPIs — immer definiert, 0-Werte wenn leer.
  const kpi = useMemo(() => {
    const pnls = filtered.map((t) => tradeMeta(t).pnl);
    const n = pnls.length;
    const net = pnls.reduce((s, p) => s + p, 0);
    const wins = pnls.filter((p) => p > 0).length;
    const byDay = new Map<string, number>();
    filtered.forEach((t) => byDay.set(t.date, (byDay.get(t.date) ?? 0) + tradeMeta(t).pnl));
    const dayVals = [...byDay.values()];
    return {
      n,
      net,
      winRate: n ? (wins / n) * 100 : 0,
      avg: n ? net / n : 0,
      best: n ? Math.max(...pnls) : 0,
      worst: n ? Math.min(...pnls) : 0,
      profitDays: dayVals.filter((v) => v > 0).length,
      lossDays: dayVals.filter((v) => v < 0).length,
    };
  }, [filtered]);

  // Analytics
  const analytics = useMemo(() => {
    const bySetup = new Map<string, { pnl: number; n: number }>();
    const bySymbol = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const dirStat = {
      long: { n: 0, wins: 0 },
      short: { n: 0, wins: 0 },
    };
    let winSum = 0;
    let winN = 0;
    let lossSum = 0;
    let lossN = 0;
    [...filtered]
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
      .forEach((t) => {
        const m = tradeMeta(t);
        const sk = m.setupTag || "—";
        const cur = bySetup.get(sk) ?? { pnl: 0, n: 0 };
        cur.pnl += m.pnl;
        cur.n += 1;
        bySetup.set(sk, cur);
        bySymbol.set(m.symbol, (bySymbol.get(m.symbol) ?? 0) + 1);
        byMonth.set(t.date.slice(0, 7), (byMonth.get(t.date.slice(0, 7)) ?? 0) + m.pnl);
        dirStat[m.direction].n += 1;
        if (m.pnl > 0) dirStat[m.direction].wins += 1;
        if (m.pnl > 0) {
          winSum += m.pnl;
          winN += 1;
        } else if (m.pnl < 0) {
          lossSum += m.pnl;
          lossN += 1;
        }
      });
    // Equity curve (kumulativ, chronologisch)
    let cum = 0;
    const equity = [...filtered]
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
      .map((t) => (cum += tradeMeta(t).pnl));
    return {
      bySetup: [...bySetup.entries()].sort((a, b) => b[1].pnl - a[1].pnl),
      bySymbol: [...bySymbol.entries()].sort((a, b) => b[1] - a[1]),
      byMonth: [...byMonth.entries()].sort(),
      dirStat,
      avgWin: winN ? winSum / winN : 0,
      avgLoss: lossN ? lossSum / lossN : 0,
      equity,
    };
  }, [filtered]);

  const previewPnl = useMemo(() => {
    const en = parseFloat(form.entryPrice);
    const ex = parseFloat(form.exitPrice);
    const sz = parseFloat(form.size);
    const pv = parseFloat(form.pointValue);
    if ([en, ex, sz, pv].some((n) => Number.isNaN(n))) return null;
    return computeTradePnl(en, ex, sz, pv, form.direction);
  }, [form]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function resetForm() {
    setForm({ ...EMPTY, date: today });
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    const payload = {
      date: form.date,
      title: `${meta.symbol} ${meta.direction}`,
      content: "",
      tags: meta.setupTag ? [meta.setupTag] : [],
      meta,
    };
    if (editId) await entriesRepo.update(editId, payload);
    else await entriesRepo.create({ type: "trade", ...payload });
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

  const maxSetup = Math.max(1, ...analytics.bySetup.map(([, v]) => Math.abs(v.pnl)));
  const maxSym = Math.max(1, ...analytics.bySymbol.map(([, n]) => n));
  const maxMonth = Math.max(1, ...analytics.byMonth.map(([, v]) => Math.abs(v)));

  return (
    <div className="page trades-page">
      <PageHeader icon="📈" title="Trading Journal" />

      {/* KPI */}
      <div className="kpi-row">
        <Kpi label="Net PnL" value={fmtUsd(kpi.net)} tone={kpi.net >= 0 ? "pos" : "neg"} big />
        <Kpi label="Trades" value={String(kpi.n)} />
        <Kpi label="Winrate" value={`${kpi.winRate.toFixed(1)}%`} />
        <Kpi label="Ø PnL" value={fmtUsd(kpi.avg)} tone={kpi.avg >= 0 ? "pos" : "neg"} />
        <Kpi label="Best" value={fmtUsd(kpi.best)} tone="pos" />
        <Kpi label="Worst" value={fmtUsd(kpi.worst)} tone="neg" />
        <Kpi label="Profit / Loss Days" value={`${kpi.profitDays} / ${kpi.lossDays}`} />
      </div>

      {/* Filter */}
      <div className="trade-filters">
        <div className="filter-row">
          {(
            [
              ["today", "Heute"],
              ["week", "Woche"],
              ["month", "Monat"],
              ["all", "Alle"],
            ] as [Period, string][]
          ).map(([p, l]) => (
            <button
              key={p}
              className={`chip ${!selectedDay && period === p ? "chip-active" : ""}`}
              onClick={() => {
                setSelectedDay(null);
                setPeriod(p);
              }}
            >
              {l}
            </button>
          ))}
          {selectedDay && (
            <button className="chip chip-active" onClick={() => setSelectedDay(null)}>
              {selectedDay} ✕
            </button>
          )}
        </div>
        <div className="filter-row">
          <select className="task-select" value={fSymbol} onChange={(e) => setFSymbol(e.target.value)}>
            <option value="">Alle Symbole</option>
            {allSymbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="task-select" value={fSetup} onChange={(e) => setFSetup(e.target.value)}>
            <option value="">Alle Setups</option>
            {allSetups.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="task-select"
            value={fDir}
            onChange={(e) => setFDir(e.target.value as typeof fDir)}
          >
            <option value="all">Long & Short</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
          {(
            [
              ["all", "Alle"],
              ["profit", "Nur Profit"],
              ["loss", "Nur Loss"],
            ] as [typeof fResult, string][]
          ).map(([r, l]) => (
            <button
              key={r}
              className={`chip ${fResult === r ? "chip-active" : ""}`}
              onClick={() => setFResult(r)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Kalender */}
      <TradeCalendar
        trades={trades}
        selected={selectedDay}
        onPick={(iso) => setSelectedDay((d) => (d === iso ? null : iso))}
      />

      {/* Trade-Formular (gruppiert) */}
      <form className="trade-form" onSubmit={submit}>
        <div className="tf-group">
          <div className="tf-group-label">Trade Basics</div>
          <div className="tf-grid">
            <label>
              Datum
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
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
                onChange={(e) => set("direction", e.target.value as TradeMeta["direction"])}
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
          </div>
        </div>

        <div className="tf-group">
          <div className="tf-group-label">Execution</div>
          <div className="tf-grid">
            <label>
              Entry
              <input type="number" step="any" value={form.entryPrice} onChange={(e) => set("entryPrice", e.target.value)} />
            </label>
            <label>
              Exit
              <input type="number" step="any" value={form.exitPrice} onChange={(e) => set("exitPrice", e.target.value)} />
            </label>
            <label>
              Size
              <input type="number" step="any" value={form.size} onChange={(e) => set("size", e.target.value)} />
            </label>
            <label>
              $/Punkt
              <input type="number" step="any" placeholder="20" value={form.pointValue} onChange={(e) => set("pointValue", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="tf-group">
          <div className="tf-group-label">Setup & Screenshot</div>
          <div className="tf-grid">
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
            <div className="tf-upload">
              <span className="tf-up-label">Screenshot</span>
              <label className="tf-up-btn">
                {form.screenshot ? "Bild ändern" : "📎 Bild wählen"}
                <input type="file" accept="image/*" onChange={onFile} hidden />
              </label>
              {form.screenshot && (
                <img className="tf-thumb" src={form.screenshot} alt="screenshot" />
              )}
            </div>
          </div>
        </div>

        <div className="tf-foot">
          <div className={`tf-pnl-card ${previewPnl === null ? "" : previewPnl >= 0 ? "pos" : "neg"}`}>
            <span className="tf-pnl-label">PnL Vorschau</span>
            <span className="tf-pnl-val">
              {previewPnl === null ? "—" : fmtUsd(previewPnl)}
            </span>
          </div>
          <div className="tf-actions">
            {editId && (
              <button className="chip" type="button" onClick={resetForm}>
                Abbrechen
              </button>
            )}
            <button className="btn" type="submit">
              {editId ? "Speichern" : "Trade anlegen"}
            </button>
          </div>
        </div>
      </form>

      {/* Analytics */}
      {filtered.length > 0 && (
        <>
          <p className="section-label">Analyse</p>
          <div className="analytics-grid">
            <div className="an-card">
              <div className="an-title">PnL nach Setup</div>
              {analytics.bySetup.map(([k, v]) => (
                <div key={k} className="an-row">
                  <span className="an-key">{k}</span>
                  <div className="an-bar-wrap">
                    <div
                      className={`an-bar ${v.pnl >= 0 ? "pos-bg" : "neg-bg"}`}
                      style={{ width: `${(Math.abs(v.pnl) / maxSetup) * 100}%` }}
                    />
                  </div>
                  <span className={`an-val ${v.pnl >= 0 ? "pos" : "neg"}`}>{fmtUsd(v.pnl)}</span>
                </div>
              ))}
            </div>

            <div className="an-card">
              <div className="an-title">Trades nach Symbol</div>
              {analytics.bySymbol.map(([k, n]) => (
                <div key={k} className="an-row">
                  <span className="an-key">{k}</span>
                  <div className="an-bar-wrap">
                    <div className="an-bar accent-bg" style={{ width: `${(n / maxSym) * 100}%` }} />
                  </div>
                  <span className="an-val">{n}</span>
                </div>
              ))}
            </div>

            <div className="an-card">
              <div className="an-title">Winrate Richtung</div>
              {(["long", "short"] as const).map((d) => {
                const s = analytics.dirStat[d];
                const wr = s.n ? (s.wins / s.n) * 100 : 0;
                return (
                  <div key={d} className="an-row">
                    <span className="an-key">{d === "long" ? "Long" : "Short"}</span>
                    <div className="an-bar-wrap">
                      <div className="an-bar accent-bg" style={{ width: `${wr}%` }} />
                    </div>
                    <span className="an-val">{wr.toFixed(0)}% ({s.n})</span>
                  </div>
                );
              })}
              <div className="an-foot">
                Ø Gewinn <span className="pos">{fmtUsd(analytics.avgWin)}</span> · Ø Verlust{" "}
                <span className="neg">{fmtUsd(analytics.avgLoss)}</span>
              </div>
            </div>

            <div className="an-card">
              <div className="an-title">Monats-PnL</div>
              {analytics.byMonth.map(([k, v]) => (
                <div key={k} className="an-row">
                  <span className="an-key">{k}</span>
                  <div className="an-bar-wrap">
                    <div
                      className={`an-bar ${v >= 0 ? "pos-bg" : "neg-bg"}`}
                      style={{ width: `${(Math.abs(v) / maxMonth) * 100}%` }}
                    />
                  </div>
                  <span className={`an-val ${v >= 0 ? "pos" : "neg"}`}>{fmtUsd(v)}</span>
                </div>
              ))}
            </div>

            <div className="an-card an-equity">
              <div className="an-title">Equity Curve</div>
              <EquityCurve points={analytics.equity} />
            </div>
          </div>
        </>
      )}

      {/* Trade-Liste */}
      <p className="section-label">Trades</p>
      {filtered.length === 0 ? (
        <div className="empty trade-empty" data-icon="📈">
          <strong>Noch keine Trades für diesen Zeitraum</strong>
          <span className="muted">
            Lege deinen ersten Trade an, um Statistiken zu sehen.
          </span>
        </div>
      ) : (
        <div className="trade-table-wrap">
          <table className="trade-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => headerSort("date")}>Datum{arrow("date")}</th>
                <th className="sortable" onClick={() => headerSort("symbol")}>Symbol{arrow("symbol")}</th>
                <th>Dir</th>
                <th className="num">Entry</th>
                <th className="num">Exit</th>
                <th className="num">Size</th>
                <th>Setup</th>
                <th className="sortable num" onClick={() => headerSort("pnl")}>PnL{arrow("pnl")}</th>
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
                    <td>{m.setupTag || "—"}</td>
                    <td className={`num ${m.pnl >= 0 ? "pos" : "neg"}`}>{fmtUsd(m.pnl)}</td>
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

function Kpi({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  big?: boolean;
}) {
  return (
    <div className={`kpi-card ${big ? "kpi-big" : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

// Equity Curve als inline-SVG (kein Chart-Dependency).
function EquityCurve({ points }: { points: number[] }) {
  if (points.length < 2)
    return <div className="muted an-foot">Zu wenig Daten für eine Kurve.</div>;
  const w = 100;
  const h = 40;
  const min = Math.min(0, ...points);
  const max = Math.max(0, ...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - ((p - min) / span) * h] as const);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const zeroY = h - ((0 - min) / span) * h;
  const last = points[points.length - 1];
  return (
    <svg className="equity-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1="0" y1={zeroY} x2={w} y2={zeroY} className="equity-zero" />
      <polyline
        points={line}
        className={last >= 0 ? "equity-line pos-stroke" : "equity-line neg-stroke"}
      />
    </svg>
  );
}
