import { useMemo, useState } from "react";
import { todayIso } from "../utils/date";
import type { Entry, TradeMeta } from "../types";

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// kompaktes $-Format ohne Cents, mit Vorzeichen.
const USD0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
function fmt(n: number): string {
  return (n > 0 ? "+" : "") + USD0.format(n);
}

interface DayAgg {
  pnl: number;
  count: number;
}

export default function TradeCalendar({ trades }: { trades: Entry[] }) {
  const today = todayIso();
  const [ref, setRef] = useState(() => {
    const d = new Date(today + "T00:00:00");
    return { y: d.getFullYear(), m: d.getMonth() }; // m: 0-11
  });

  // PnL pro Tag aus allen Trades.
  const byDate = useMemo(() => {
    const map = new Map<string, DayAgg>();
    for (const t of trades) {
      const m = t.meta as TradeMeta;
      const cur = map.get(t.date) ?? { pnl: 0, count: 0 };
      cur.pnl += m.pnl ?? 0;
      cur.count += 1;
      map.set(t.date, cur);
    }
    return map;
  }, [trades]);

  // 6×7 Gitter, Woche startet Sonntag (wie Vorlage).
  const cells = useMemo(() => {
    const first = new Date(ref.y, ref.m, 1);
    const startWd = first.getDay(); // 0 = So
    const days = new Date(ref.y, ref.m + 1, 0).getDate();
    const out: { day: number | null; iso: string | null }[] = [];
    for (let i = 0; i < startWd; i++) out.push({ day: null, iso: null });
    for (let d = 1; d <= days; d++) {
      out.push({ day: d, iso: `${ref.y}-${pad(ref.m + 1)}-${pad(d)}` });
    }
    while (out.length % 7 !== 0) out.push({ day: null, iso: null });
    return out;
  }, [ref]);

  const monthNet = useMemo(() => {
    let sum = 0;
    byDate.forEach((v, iso) => {
      if (iso.startsWith(`${ref.y}-${pad(ref.m + 1)}`)) sum += v.pnl;
    });
    return sum;
  }, [byDate, ref]);

  const label = new Date(ref.y, ref.m, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  function shift(delta: number) {
    setRef((r) => {
      const d = new Date(r.y, r.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function goToday() {
    const d = new Date(today + "T00:00:00");
    setRef({ y: d.getFullYear(), m: d.getMonth() });
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <div className="cal-nav">
          <button className="chip" onClick={() => shift(-1)}>
            ←
          </button>
          <span className="cal-month">{label}</span>
          <button className="chip" onClick={() => shift(1)}>
            →
          </button>
          <button className="chip" onClick={goToday}>
            heute
          </button>
        </div>
        <div className="cal-net">
          Net P&amp;L{" "}
          <strong className={monthNet >= 0 ? "pos" : "neg"}>
            {fmt(monthNet)}
          </strong>
        </div>
      </div>

      <div className="cal-grid cal-weekdays">
        {WD.map((d) => (
          <div key={d} className="cal-wd">
            {d}
          </div>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((c, i) => {
          if (c.day === null) return <div key={i} className="cal-cell empty-cell" />;
          const agg = byDate.get(c.iso!);
          const isToday = c.iso === today;
          const tone = agg ? (agg.pnl >= 0 ? "profit" : "loss") : "";
          return (
            <div
              key={i}
              className={`cal-cell ${tone} ${isToday ? "is-today" : ""}`}
            >
              <span className="cal-daynum">{c.day}</span>
              {agg && (
                <span className="cal-pnl">
                  {fmt(agg.pnl)}
                  <span className="cal-count">
                    {agg.count} {agg.count === 1 ? "Trade" : "Trades"}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="cal-leg">
          <span className="leg-box profit" /> Profit
        </span>
        <span className="cal-leg">
          <span className="leg-box loss" /> Loss
        </span>
        <span className="cal-leg">
          <span className="leg-dot-today" /> Heute
        </span>
      </div>
    </div>
  );
}
