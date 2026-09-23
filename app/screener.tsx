"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Row } from "@/lib/data";
import {
  COL, LISTS, PILLARS, PROFILE_NOTE, VIEWS, buildViews, rankable,
  type Basis, type ListId, type MKey, type PKey, type View, type ViewId,
} from "@/lib/metrics";
import CompanySheet from "./sheet";
import Compare from "./compare";
import { PillarBar } from "./profile";

type SortKey = MKey | "byma" | "sector" | "period" | `p_${PKey}`;
const MAX_COMPARE = 4;
const STORE_KEY = "cedears:mi-lista";

function loadMine(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function saveMine(s: Set<string>) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify([...s]));
  } catch {
    /* navegador sin almacenamiento: la lista vive solo en esta pestaña */
  }
}

function percentileFn(views: View[], key: MKey) {
  const vals = views.map((v) => rankable(v, key)).filter((v): v is number => v != null).sort((a, b) => a - b);
  return (v: number | null) => {
    if (v == null || vals.length < 5) return null;
    let lo = 0, hi = vals.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < v) lo = m + 1; else hi = m; }
    return lo / (vals.length - 1);
  };
}

export default function Screener({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [basis, setBasis] = useState<Basis>("ttm");
  const [list, setList] = useState<ListId>("all");
  const [view, setView] = useState<ViewId>("summary");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "revenue", dir: -1 });
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => setMine(loadMine()), []);

  // Ficha abierta en la URL (?e=AAPL) para poder compartirla o volver con el navegador.
  useEffect(() => {
    const read = () => setOpen(new URLSearchParams(window.location.search).get("e"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const openSheet = useCallback((byma: string | null) => {
    setOpen(byma);
    const url = new URL(window.location.href);
    if (byma) url.searchParams.set("e", byma);
    else url.searchParams.delete("e");
    window.history.replaceState(null, "", url);
  }, []);

  // Atajo "/" para el buscador.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleMine = (byma: string) =>
    setMine((prev) => {
      const s = new Set(prev);
      if (s.has(byma)) s.delete(byma);
      else s.add(byma);
      saveMine(s);
      return s;
    });
  const togglePick = (byma: string) =>
    setPicked((p) => (p.includes(byma) ? p.filter((x) => x !== byma) : p.length >= MAX_COMPARE ? p : [...p, byma]));

  const sectors = useMemo(() => Array.from(new Set(rows.map((r) => r.sector).filter(Boolean))).sort(), [rows]);
  const all = useMemo(() => buildViews(rows, basis), [rows, basis]);
  const byId = useMemo(() => new Map(all.map((v) => [v.row.byma, v])), [all]);

  // Búsqueda y sector se aplican antes de las pestañas, así cada pestaña cuenta sobre lo buscado.
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((v) => {
      const r = v.row;
      return (!s || r.byma.toLowerCase().includes(s) || r.ticker.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)) &&
        (!sector || r.sector === sector);
    });
  }, [all, q, sector]);

  const counts = useMemo(() => {
    const m = {} as Record<ListId, number>;
    for (const l of LISTS) m[l.id] = searched.filter((v) => l.test(v, mine)).length;
    return m;
  }, [searched, mine]);

  const current = LISTS.find((l) => l.id === list)!;
  const shown = useMemo(() => searched.filter((v) => current.test(v, mine)), [searched, current, mine]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const get = (v: View): number | string | null =>
      key === "byma" ? v.row.byma : key === "sector" ? v.row.sector : key === "period" ? v.period
        : key.startsWith("p_") ? v.profile?.[key.slice(2) as PKey] ?? null : rankable(v, key as MKey);
    return [...shown].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null && y == null) return 0;
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [shown, sort]);

  const cols = VIEWS.find((v) => v.id === view)!.cols
    .map((k) => COL[k])
    .filter((c) => c.key !== "nd_ebitda" || all.some((v) => v.nd_ebitda != null));

  const pctFns = useMemo(() => {
    const m: Partial<Record<MKey, (v: number | null) => number | null>> = {};
    for (const c of Object.values(COL)) if (c.shade) m[c.key] = percentileFn(shown, c.key);
    return m;
  }, [shown]);

  const shade = (key: MKey, v: View) => {
    const c = COL[key];
    const f = pctFns[key];
    let p = f ? f(rankable(v, key)) : null;
    if (p == null) return undefined;
    if (c.shade === "low") p = 1 - p;
    return { background: `rgb(var(--celeste-wash) / ${(p * 0.32).toFixed(3)})` };
  };

  const th = (key: SortKey, label: React.ReactNode, cls = "", title?: string) => (
    <th key={key} className={cls} title={title} scope="col"
      aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))}>{label}</button>
    </th>
  );

  const fallbacks = shown.filter((v) => v.fallback).length;
  const hiddenNd = !cols.some((c) => c.key === "nd_ebitda") && VIEWS.find((v) => v.id === view)!.cols.includes("nd_ebitda");

  return (
    <>
      <div className="bar">
        <div className="seg" role="radiogroup" aria-label="Base de cálculo">
          <button type="button" role="radio" aria-checked={basis === "ttm"} onClick={() => setBasis("ttm")}
            title="Suma de los 4 trimestres más recientes; si no hay, se usa el último ejercicio">TTM</button>
          <button type="button" role="radio" aria-checked={basis === "annual"} onClick={() => setBasis("annual")}>Último ejercicio</button>
        </div>
        <span className="searchbox">
          <input ref={search} type="search" placeholder="Buscar CEDEAR, ticker o empresa" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Buscar" aria-keyshortcuts="/" />
          <kbd aria-hidden="true">/</kbd>
        </span>
        <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
          <option value="">Todos los sectores</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="lists" role="tablist" aria-label="Listas armadas">
        {LISTS.map((l) => (
          <button key={l.id} type="button" role="tab" aria-selected={list === l.id} onClick={() => setList(l.id)}>
            {l.label} <span className="n">{counts[l.id]}</span>
          </button>
        ))}
      </div>
      <p className="crit">{current.crit}</p>

      <div className="bar">
        <div className="seg" role="radiogroup" aria-label="Columnas">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
          ))}
        </div>
        <span className="count">{sorted.length} de {rows.length} empresas</span>
      </div>
      {basis === "ttm" && fallbacks > 0 && (
        <p className="hint">
          {fallbacks} empresas no presentan trimestres en XBRL (en general, extranjeras con 20-F): para
          ellas se muestra el último ejercicio anual, en cursiva en la columna Período.
        </p>
      )}

      <div className="tablebox">
        <table className="grid">
          <thead>
            <tr>
              {th("byma", "CEDEAR", "l sticky")}
              {PILLARS.map((p) => th(`p_${p.key}`, p.short, "pil", `${p.label}: ${p.tip} Percentil 0-100.`))}
              {th("period", "Período")}
              {cols.map((c) => th(c.key, c.label, "", c.tip))}
              {th("sector", "Sector", "l")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => {
              const r = v.row;
              const warn = r.stale || r.api_lag;
              const star = mine.has(r.byma);
              const pick = picked.includes(r.byma);
              return (
                <tr key={r.byma} className={open === r.byma ? "sel" : undefined}>
                  <td className="l sticky">
                    <div className="first">
                      <span className="ctl">
                        <button type="button" className={`star${star ? " on" : ""}`} aria-pressed={star}
                          aria-label={star ? `Sacar ${r.byma} de mi lista` : `Agregar ${r.byma} a mi lista`}
                          onClick={() => toggleMine(r.byma)}>{star ? "★" : "☆"}</button>
                        <input type="checkbox" checked={pick} aria-label={`Comparar ${r.byma}`}
                          disabled={!pick && picked.length >= MAX_COMPARE}
                          title={!pick && picked.length >= MAX_COMPARE ? "Hasta 4 empresas" : "Comparar"}
                          onChange={() => togglePick(r.byma)} />
                      </span>
                      <span className="who">
                        <button type="button" className="tk" onClick={() => openSheet(r.byma)}>{r.byma}</button>
                        <span className="sub" title={r.name}>{r.ticker !== r.byma ? `${r.ticker}, ` : ""}{r.name}</span>
                      </span>
                    </div>
                  </td>
                  {v.profile ? (
                    PILLARS.map((p) => (
                      <td key={p.key} className="pil"><PillarBar value={v.profile![p.key]} label={p.label} /></td>
                    ))
                  ) : (
                    <td colSpan={PILLARS.length} className="fin" title="Bancos, aseguradoras y brokers: los pilares no son comparables con el resto">Financiera</td>
                  )}
                  <td className={v.fallback ? "fb" : warn ? "neg" : ""}
                    title={r.api_lag ? "Hay un balance más nuevo que la API de la SEC todavía no incorporó"
                      : r.stale ? "El último ejercicio tiene más de 15 meses" : undefined}>
                    {v.period}{warn ? " *" : ""}
                  </td>
                  {cols.map((c) => {
                    const val = v[c.key];
                    if (c.key === "de" && v.neg_equity && val != null)
                      return <td key={c.key} className="negeq" title="Patrimonio neto negativo: fuera del sombreado y del orden">{c.fmt(val)}*</td>;
                    const neg = typeof val === "number" && val < 0 && c.key !== "alerts";
                    return (
                      <td key={c.key} style={shade(c.key, v)} className={c.key === "alerts" && val ? "flag" : neg ? "neg" : ""}>
                        {c.fmt(val)}
                      </td>
                    );
                  })}
                  <td className="l"><span className="sub" title={r.sector}>{r.sector || "–"}</span></td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td className="l empty" colSpan={cols.length + PILLARS.length + 3}>
                {list === "mine" && mine.size === 0 ? "Todavía no marcaste ninguna empresa con la estrella." : "No hay empresas con estos filtros."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="how">
        <summary>Cómo leer la tabla</summary>
        <p><strong>Perfil.</strong> {PROFILE_NOTE}</p>
        <ul>
          {PILLARS.map((p) => <li key={p.key}><strong>{p.label}:</strong> {p.tip}</li>)}
        </ul>
        <p>
          <strong>Sombreado.</strong> Celeste más intenso = mejor percentil dentro de la lista que estás viendo
          (no del universo). En deuda/PN y deuda neta/EBITDA, menos es mejor.
        </p>
        <ul>
          {Object.values(COL).map((c) => <li key={c.key}><strong>{c.label}:</strong> {c.tip}</li>)}
        </ul>
        {hiddenNd && (
          <p>Deuda neta/EBITDA no se muestra porque esta corrida del ETL no trae depreciaciones y amortizaciones;
            mientras tanto, Solidez se calcula con deuda/PN y liquidez corriente.</p>
        )}
        <p>* en Período: hay un 10-Q, 10-K o 20-F más nuevo que la API de la SEC todavía no expone en XBRL, o el
          último ejercicio tiene más de 15 meses. * en Deuda/PN: patrimonio neto negativo (recompras acumuladas).</p>
      </details>

      {picked.length > 0 && (
        <div className="tray" role="region" aria-label="Comparador">
          <span className="tray-l">Comparar ({picked.length}/{MAX_COMPARE}):</span>
          {picked.map((b) => (
            <span key={b} className="chip">
              {b}
              <button type="button" aria-label={`Quitar ${b}`} onClick={() => togglePick(b)}>×</button>
            </span>
          ))}
          <span className="tray-r">
            <button type="button" className="ghost" onClick={() => setPicked([])}>Limpiar</button>
            <button type="button" className="primary" disabled={picked.length < 2} onClick={() => setComparing(true)}
              title={picked.length < 2 ? "Elegí al menos 2" : undefined}>Comparar</button>
          </span>
        </div>
      )}

      {comparing && (
        <Compare views={picked.map((b) => byId.get(b)!).filter(Boolean)} basis={basis}
          onClose={() => setComparing(false)} onOpen={(b) => { setComparing(false); openSheet(b); }} />
      )}
      {open && (
        <CompanySheet byma={open} view={byId.get(open) ?? null} basis={basis} onClose={() => openSheet(null)} />
      )}
    </>
  );
}
