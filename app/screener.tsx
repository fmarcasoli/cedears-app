"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ScreenerRow } from "@/lib/data";
import { money, num, pct } from "@/lib/format";

type Basis = "ttm" | "annual";
type View = {
  row: ScreenerRow; period: string; fallback: boolean;
  revenue: number | null; growth: number | null; q_yoy: number | null; cagr3: number | null;
  gross_margin: number | null; op_margin: number | null; net_margin: number | null;
  fcf_margin: number | null; roe: number | null; debt_equity: number | null;
  current_ratio: number | null; alerts: number;
};
type VKey = Exclude<keyof View, "row" | "period" | "fallback">;
type Col = { key: VKey; label: string; fmt: (v: number | null) => string; shade?: "high" | "low"; title?: string };

const COLS: Col[] = [
  { key: "revenue", label: "Ingresos", fmt: money },
  { key: "growth", label: "Crec. 12m", fmt: pct, shade: "high", title: "TTM contra los 12 meses previos, o ejercicio contra ejercicio" },
  { key: "q_yoy", label: "Últ. trim. i.a.", fmt: pct, shade: "high", title: "Ingresos del último trimestre contra el mismo trimestre del año anterior" },
  { key: "cagr3", label: "CAGR 3a", fmt: pct, shade: "high", title: "Crecimiento anual compuesto de ingresos, 3 ejercicios" },
  { key: "gross_margin", label: "Mg. bruto", fmt: pct, shade: "high" },
  { key: "op_margin", label: "Mg. operativo", fmt: pct, shade: "high" },
  { key: "net_margin", label: "Mg. neto", fmt: pct, shade: "high" },
  { key: "fcf_margin", label: "Mg. FCF", fmt: pct, shade: "high" },
  { key: "roe", label: "ROE", fmt: pct, shade: "high" },
  { key: "debt_equity", label: "Deuda/PN", fmt: (v) => num(v), shade: "low" },
  { key: "current_ratio", label: "Liq. corriente", fmt: (v) => num(v), shade: "high" },
  { key: "alerts", label: "Alertas", fmt: (v) => (v ? String(v) : "–") },
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mmyy = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]}-${d.slice(2, 4)}`;

function toView(r: ScreenerRow, basis: Basis): View {
  const useTtm = basis === "ttm" && !!r.ttm_end;
  const base = {
    row: r, q_yoy: r.q_rev_yoy, cagr3: r.rev_cagr3, alerts: r.alerts,
    fallback: basis === "ttm" && !r.ttm_end,
  };
  if (useTtm) {
    return {
      ...base, period: `TTM ${mmyy(r.ttm_end!)}`,
      revenue: r.t_revenue, growth: r.t_rev_growth, gross_margin: r.t_gross_margin,
      op_margin: r.t_op_margin, net_margin: r.t_net_margin, fcf_margin: r.t_fcf_margin,
      roe: r.t_roe, debt_equity: r.t_debt_equity, current_ratio: r.t_current_ratio,
    };
  }
  return {
    ...base, period: r.fy ? `FY${r.fy}` : "–",
    revenue: r.revenue, growth: r.rev_growth, gross_margin: r.gross_margin, op_margin: r.op_margin,
    net_margin: r.net_margin, fcf_margin: r.fcf_margin, roe: r.roe, debt_equity: r.debt_equity,
    current_ratio: r.current_ratio,
  };
}

function percentiles(views: View[], key: VKey) {
  const vals = views.map((v) => v[key]).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  return (v: number | null) => {
    if (v == null || vals.length < 5) return null;
    let lo = 0, hi = vals.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < v) lo = m + 1; else hi = m; }
    return lo / (vals.length - 1);
  };
}

type SortKey = VKey | "byma" | "sector" | "period";

export default function Screener({ rows }: { rows: ScreenerRow[] }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [basis, setBasis] = useState<Basis>("ttm");
  const [usdOnly, setUsdOnly] = useState(false);
  const [ttmOnly, setTtmOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "revenue", dir: -1 });

  const sectors = useMemo(() => Array.from(new Set(rows.map((r) => r.sector).filter(Boolean))).sort(), [rows]);

  const views = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) =>
        (!s || r.byma.toLowerCase().includes(s) || r.ticker.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)) &&
        (!sector || r.sector === sector) &&
        (!usdOnly || r.reported_currency === "USD") &&
        (!ttmOnly || !!r.ttm_end))
      .map((r) => toView(r, basis));
  }, [rows, q, sector, usdOnly, ttmOnly, basis]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const get = (v: View) => (key === "byma" ? v.row.byma : key === "sector" ? v.row.sector : key === "period" ? v.period : v[key]);
    return [...views].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [views, sort]);

  const pctFns = useMemo(() => {
    const m: Partial<Record<VKey, (v: number | null) => number | null>> = {};
    COLS.forEach((c) => c.shade && (m[c.key] = percentiles(views, c.key)));
    return m;
  }, [views]);

  const shade = (c: Col, v: number | null) => {
    const f = pctFns[c.key];
    let p = f ? f(v) : null;
    if (p == null) return undefined;
    if (c.shade === "low") p = 1 - p;
    return { background: `rgb(var(--celeste-wash) / ${(p * 0.32).toFixed(3)})` };
  };

  const th = (key: SortKey, label: string, cls = "", title?: string) => (
    <th key={key} className={cls} title={title}
      aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))}>{label}</button>
    </th>
  );

  const fallbacks = views.filter((v) => v.fallback).length;

  return (
    <>
      <div className="bar">
        <div className="seg" role="radiogroup" aria-label="Base de cálculo">
          <button role="radio" aria-checked={basis === "ttm"} onClick={() => setBasis("ttm")}>Últimos 12 meses</button>
          <button role="radio" aria-checked={basis === "annual"} onClick={() => setBasis("annual")}>Último ejercicio</button>
        </div>
        <input type="search" placeholder="Buscar CEDEAR, ticker o empresa" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
          <option value="">Todos los sectores</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label>
          <input type="checkbox" checked={ttmOnly} onChange={(e) => setTtmOnly(e.target.checked)} />
          Solo con datos trimestrales
        </label>
        <label>
          <input type="checkbox" checked={usdOnly} onChange={(e) => setUsdOnly(e.target.checked)} />
          Solo las que reportan en USD de origen
        </label>
        <span className="count">{sorted.length} de {rows.length} empresas</span>
      </div>
      {basis === "ttm" && fallbacks > 0 && !ttmOnly && (
        <p className="hint">
          {fallbacks} empresas no presentan trimestres en XBRL (en general, extranjeras con 20-F): para
          ellas se muestra el último ejercicio anual, marcado en gris en la columna Período.
        </p>
      )}

      <div className="tablebox">
        <table>
          <thead>
            <tr>
              {th("byma", "CEDEAR", "l sticky")}
              {th("sector", "Sector", "l")}
              {th("period", "Período")}
              {COLS.map((c) => th(c.key, c.label, "", c.title))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => {
              const r = v.row;
              const warn = r.stale || r.api_lag;
              return (
                <tr key={r.byma}>
                  <td className="l sticky">
                    <Link className="tk" href={`/empresa/${encodeURIComponent(r.byma)}`}>{r.byma}</Link>
                    <span className="sub" title={r.name}>{r.ticker !== r.byma ? `${r.ticker}, ` : ""}{r.name}</span>
                    {r.converted && <span className="conv">convertido desde {r.reported_currency}</span>}
                  </td>
                  <td className="l"><span className="sub" title={r.sector}>{r.sector || "–"}</span></td>
                  <td className={v.fallback ? "fb" : warn ? "neg" : ""}
                    title={warn ? "Hay un balance más nuevo que la API de la SEC todavía no incorporó" : undefined}>
                    {v.period}{warn ? " *" : ""}
                  </td>
                  {COLS.map((c) => {
                    const val = v[c.key];
                    const neg = typeof val === "number" && val < 0 && c.key !== "alerts";
                    return (
                      <td key={c.key} style={shade(c, val)} className={c.key === "alerts" && val ? "flag" : neg ? "neg" : ""}>
                        {c.fmt(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">* Hay un 10-Q, 10-K o 20-F más nuevo que la API de la SEC todavía no expone en XBRL.</p>
    </>
  );
}
