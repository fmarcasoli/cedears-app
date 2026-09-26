"use client";

import { useEffect, useRef, useState } from "react";
import type { Company, Period, YearRow } from "@/lib/data";
import { money, num, pct } from "@/lib/format";
import { COL, mmyy, type Basis, type MKey, type View } from "@/lib/metrics";
import { Chart } from "./charts";
import { ProfileBig } from "./profile";

type Tab = "evol" | "roe" | "changed" | "alerts";
const TABS: { id: Tab; label: string }[] = [
  { id: "evol", label: "Evolución" },
  { id: "roe", label: "De dónde sale el ROE" },
  { id: "changed", label: "Qué cambió" },
  { id: "alerts", label: "Alertas" },
];

const val = (p: Period | null | undefined, k: string) => {
  const v = p?.[k];
  return typeof v === "number" ? v : null;
};
const div = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? a / b : null);
const pctAxis = (v: number) => `${Math.round(v * 100)}%`;
const moneyAxis = (v: number) => (v === 0 ? "0" : money(v));

/** Modal nativo: Esc cierra, el foco queda adentro, el fondo no se puede tocar. */
export function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const cancel = (e: Event) => { e.preventDefault(); close.current(); };
    const click = (e: MouseEvent) => { if (e.target === d) close.current(); };
    d.addEventListener("cancel", cancel);
    d.addEventListener("click", click);
    document.body.classList.add("locked");
    return () => {
      d.removeEventListener("cancel", cancel);
      d.removeEventListener("click", click);
      document.body.classList.remove("locked");
      if (d.open) d.close();
    };
  }, []);
  return ref;
}

export default function CompanySheet({ byma, view, basis, onClose }: {
  byma: string; view: View | null; basis: Basis; onClose: () => void;
}) {
  const ref = useModal(onClose);
  const [c, setC] = useState<Company | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<Tab>("evol");

  useEffect(() => {
    let alive = true;
    setC(null); setErr(false); setTab("evol");
    fetch(`/data/companies/${encodeURIComponent(byma)}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: Company) => alive && setC(j))
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [byma]);

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="sheet-title">
      <div className="sheet-in">
        <button type="button" className="close" onClick={onClose} aria-label="Cerrar ficha">×</button>
        {err ? (
          <p>No encontramos la ficha de {byma}.</p>
        ) : !c ? (
          <>
            <h2 id="sheet-title">{byma}</h2>
            <p className="hint">Cargando ficha…</p>
          </>
        ) : (
          <Body c={c} view={view} basis={basis} tab={tab} setTab={setTab} />
        )}
      </div>
    </dialog>
  );
}

function Body({ c, view, basis, tab, setTab }: {
  c: Company; view: View | null; basis: Basis; tab: Tab; setTab: (t: Tab) => void;
}) {
  const last = c.rows[c.rows.length - 1];
  const negEq = (view?.neg_equity) ?? ((val(c.ttm ?? last, "equity") ?? 1) <= 0);
  const edgar = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.cik}&type=&dateb=&owner=include&count=40`;
  const kpis: MKey[] = c.financial ? ["net_income", "roe", "mcap", "pe", "pb"] : ["revenue", "net_income", "fcf", "op_margin", "roe", "fcf_margin", "de", "nd_ebitda", "current_ratio", "mcap", "pe", "peg", "pb", "ps"];
  const usingTtm = basis === "ttm" && !!c.ttm;

  return (
    <>
      <header className="sheet-h">
        <h2 id="sheet-title">{c.byma} <span className="nm">{c.name}</span></h2>
        <p className="id">
          {c.ticker !== c.byma && <>Ticker en EE.UU.: {c.ticker}. </>}
          {c.sector && <>{c.sector}. </>}
          {c.ratio && <>Ratio CEDEAR {c.ratio}. </>}
          Último cierre {last?.fiscal_end ?? "–"}, presentado el {c.last_filed || "–"}.{" "}
          <a href={edgar} target="_blank" rel="noopener noreferrer">Ver en EDGAR</a>
        </p>
        <div className="badges">
          {c.converted && <span className="badge" title={`Montos pasados a USD desde ${c.reported_currency}; los ratios se calculan en ${c.reported_currency}`}>convertido desde {c.reported_currency}</span>}
          {c.financial && <span className="badge" title="SIC 6000-6499: márgenes, liquidez y deuda/PN no se calculan">financiera</span>}
          {negEq && !c.financial && <span className="badge warn" title="Típico de recompras acumuladas: ROE y deuda/PN no son representativos">PN negativo</span>}
          {c.stale && <span className="badge warn" title="El último ejercicio en la API tiene más de 15 meses">ejercicio viejo</span>}
          {c.api_lag && <span className="badge warn" title="Hay un 10-Q/10-K/20-F presentado que la API de la SEC todavía no incorporó">balance nuevo pendiente</span>}
        </div>
      </header>

      <ProfileBig profile={view?.profile ?? null} />

      <p className="basis">
        {usingTtm ? <>Últimos 12 meses al {c.ttm!.end} (suma de los 4 trimestres más recientes).</>
          : basis === "ttm" ? <>Ejercicio al {last?.fiscal_end ?? "–"}: la empresa no presenta trimestres en XBRL.</>
            : <>Ejercicio anual al {last?.fiscal_end ?? "–"}.</>}
      </p>
      {view && (
        <dl className="facts">
          {kpis.map((k) => (
            <div key={k} title={COL[k].tip}>
              <dt>{COL[k].label}</dt>
              <dd className={k === "de" && view.neg_equity ? "negeq" : undefined}>
                {COL[k].fmt(view[k])}{k === "de" && view.neg_equity && view[k] != null ? "*" : ""}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="lists small" role="tablist" aria-label="Secciones de la ficha">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}{t.id === "alerts" && c.alerts.length > 0 && <span className="n">{c.alerts.length}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "evol" && <Evolution c={c} />}
        {tab === "roe" && <DuPont c={c} />}
        {tab === "changed" && <Changed c={c} />}
        {tab === "alerts" && <Alerts c={c} />}
      </div>
    </>
  );
}

// ─────────────────────────── Evolución ───────────────────────────

type Def = [string] | [string, string, (v: number | null) => string];
const ANNUAL_ROWS: Def[] = [
  ["Resultados"],
  ["Ingresos", "revenue", money], ["Crecimiento en USD", "rev_growth", pct],
  ["Resultado bruto", "gross_profit", money], ["Resultado operativo", "operating_income", money],
  ["Depreciaciones y amortizaciones", "da_total", money], ["EBITDA", "ebitda", money],
  ["Resultado neto", "net_income", money], ["EPS diluido", "eps_diluted", (v) => num(v)],
  ["Flujo de fondos"],
  ["Flujo operativo", "ocf", money], ["CAPEX", "capex", money], ["Caja libre", "fcf", money],
  ["Caja libre / resultado neto", "fcf_conversion", (v) => num(v)],
  ["Dividendos pagados", "dividends", money], ["Recompras", "buybacks", money],
  ["Balance"],
  ["Activo", "assets", money], ["Patrimonio neto", "equity", money], ["Caja", "cash", money],
  ["Deuda financiera", "fin_debt", money], ["Arrendamientos", "leases", money],
  ["Deuda total (con arrendamientos)", "total_debt", money], ["Deuda neta", "net_debt", money],
  ["Ratios"],
  ["Margen bruto", "gross_margin", pct], ["Margen operativo", "op_margin", pct],
  ["Margen neto", "net_margin", pct], ["Margen caja libre", "fcf_margin", pct],
  ["ROE", "roe", pct], ["ROA", "roa", pct],
  ["Deuda / PN", "debt_equity", (v) => num(v)], ["Deuda neta / EBITDA", "nd_ebitda", (v) => num(v)],
  ["Liquidez corriente", "current_ratio", (v) => num(v)],
];
const QUARTER_ROWS: Def[] = [
  ["Resultados del trimestre"],
  ["Ingresos", "revenue", money], ["Interanual (USD)", "rev_yoy", pct],
  ["Resultado operativo", "operating_income", money], ["Margen operativo", "op_margin", pct],
  ["EBITDA", "ebitda", money],
  ["Resultado neto", "net_income", money], ["Margen neto", "net_margin", pct],
  ["EPS diluido", "eps_diluted", (v) => num(v)], ["EPS interanual", "eps_yoy", pct],
  ["Flujo de fondos del trimestre"],
  ["Flujo operativo", "ocf", money], ["CAPEX", "capex", money], ["Caja libre", "fcf", money],
  ["Balance al cierre"],
  ["Caja", "cash", money], ["Deuda financiera", "fin_debt", money], ["Arrendamientos", "leases", money],
  ["Deuda total (con arrendamientos)", "total_debt", money], ["Patrimonio neto", "equity", money],
];

function Evolution({ c }: { c: Company }) {
  const hasQ = (c.quarters?.length ?? 0) >= 4;
  const [freq, setFreq] = useState<"q" | "a">(hasQ ? "q" : "a");
  const P: Period[] = freq === "q" ? c.quarters.slice(-12) : c.rows;
  const labels = freq === "q" ? c.quarters.slice(-12).map((q) => mmyy(q.end)) : c.rows.map((r) => `FY${r.year}`);
  const s = (k: string) => P.map((p) => val(p, k));
  const defs = freq === "q" ? QUARTER_ROWS : ANNUAL_ROWS;
  const cur = c.converted ? ` (USD, convertido desde ${c.reported_currency})` : " (USD)";

  return (
    <section>
      <div className="bar">
        <div className="seg" role="radiogroup" aria-label="Frecuencia">
          <button type="button" role="radio" aria-checked={freq === "q"} disabled={!hasQ} onClick={() => setFreq("q")}
            title={hasQ ? undefined : "La empresa no presenta trimestres en XBRL"}>Trimestral</button>
          <button type="button" role="radio" aria-checked={freq === "a"} onClick={() => setFreq("a")}>Anual</button>
        </div>
      </div>
      {!c.financial && (
        <>
          <Chart title={`Ingresos${cur}`} labels={labels} kind="bar" fmt={money} axisFmt={moneyAxis}
            series={[{ name: "Ingresos", values: s("revenue"), tone: 1 }]} />
          <Chart title="Margen operativo" labels={labels} kind="line" fmt={pct} axisFmt={pctAxis} height={130}
            series={[{ name: "Margen operativo", values: s("op_margin"), tone: 1 }]} />
        </>
      )}
      <Chart title={c.financial ? "Resultado neto" : "Resultado neto contra caja libre"} labels={labels} kind="bar" fmt={money} axisFmt={moneyAxis}
        series={c.financial ? [{ name: "Resultado neto", values: s("net_income"), tone: 1 }]
          : [{ name: "Resultado neto", values: s("net_income"), tone: 1 }, { name: "Caja libre", values: s("fcf"), tone: 2 }]} />
      <p className="note">
        {freq === "q"
          ? "El cuarto trimestre se calcula como el anual menos los 9 meses acumulados, y el flujo de fondos restando acumulados."
          : "Ejercicios fiscales por año de cierre (ej. NVDA cierra en enero)."}{" "}
        Caja libre = flujo operativo menos CAPEX: si queda muy por debajo del resultado neto, parte de la ganancia no se está cobrando.
      </p>
      <details>
        <summary>Tabla completa</summary>
        <div className="tablebox">
          <table>
            <thead>
              <tr>
                <th className="l sticky">Concepto</th>
                {labels.map((l) => <th key={l}>{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => d.length === 1 ? (
                <tr key={d[0]} className="group"><td colSpan={labels.length + 1}>{d[0]}</td></tr>
              ) : (
                <tr key={d[1]}>
                  <td className="l sticky">{d[0]}</td>
                  {P.map((p, i) => {
                    const v = val(p, d[1]);
                    return <td key={i} className={v != null && v < 0 ? "neg" : ""}>{d[2](v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

// ─────────────────────────── DuPont ───────────────────────────

type DP = { year: number; margin: number | null; turn: number | null; lev: number | null; roa: number | null; roe: number | null };

function dupont(c: Company): DP[] {
  // En las convertidas, ingresos van al tipo promedio y el activo al de cierre: se vuelve a
  // moneda de origen para que la rotación no mezcle dos tipos de cambio.
  const local = (r: YearRow, k: string) => {
    const f = c.converted ? val(r, "fx_close") : 1;
    return f ? div(val(r, k), f) : null;
  };
  // Saldos promedio (cierre anterior y actual), como Investing: rotación 0,87 en AMZN.
  const avg = (i: number, k: string) => {
    const a = local(c.rows[i], k), b = i > 0 ? local(c.rows[i - 1], k) : null;
    return a != null && b != null ? (a + b) / 2 : a;
  };
  return c.rows.map((r: YearRow, i) => {
    const fa = c.converted ? val(r, "fx_avg") : 1;
    const rev = fa ? div(val(r, "revenue"), fa) : null;
    const ni = fa ? div(val(r, "net_income"), fa) : null;
    const assets = avg(i, "assets");
    const eq = avg(i, "equity");
    const posEq = eq != null && eq > 0 && (local(r, "equity") ?? 0) > 0;
    const margin = c.financial ? null : div(ni, rev);
    const turn = c.financial ? null : div(rev, assets);
    const lev = posEq ? div(assets, eq) : null;
    const roa = div(ni, assets);
    return { year: r.year, margin, turn, lev, roa, roe: posEq ? div(ni, eq) : null };
  });
}

function driver(a: DP, b: DP, financial: boolean) {
  const parts: [string, number | null, number | null][] = financial
    ? [["el ROA (rentabilidad del activo)", a.roa, b.roa], ["el apalancamiento", a.lev, b.lev]]
    : [["el margen neto", a.margin, b.margin], ["la rotación de activos", a.turn, b.turn], ["el apalancamiento", a.lev, b.lev]];
  if (a.roe == null || b.roe == null || parts.some(([, x, y]) => x == null || y == null || x <= 0 || y <= 0))
    return `No se puede descomponer el cambio de FY${a.year} a FY${b.year}: hay pérdida o patrimonio negativo en alguno de los dos años.`;
  // Descomposición logarítmica: ln(ROE1/ROE0) = suma de ln(factor1/factor0).
  const contrib = parts.map(([name, x, y]) => ({ name, x: x!, y: y!, d: Math.log(y! / x!) }));
  // La palanca que explica el cambio es la que se movió en el mismo sentido que el ROE
  // (si el ROE bajó y el margen subió, el margen no lo explica: lo compensó en parte).
  const total = contrib.reduce((t, p) => t + p.d, 0);
  const sameWay = contrib.filter((p) => Math.sign(p.d) === Math.sign(total) && p.d !== 0);
  const pool = sameWay.length ? sameWay : contrib;
  const top = pool.reduce((m, p) => (Math.abs(p.d) > Math.abs(m.d) ? p : m));
  const against = contrib.filter((p) => Math.sign(p.d) === -Math.sign(total) && Math.abs(p.d) > 0.02)
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
  const fmt = (name: string, v: number) => (name.includes("margen") || name.includes("ROA") ? pct(v) : `${num(v)}x`);
  const move = (p: typeof top) => `${p.name} (de ${fmt(p.name, p.x)} a ${fmt(p.name, p.y)})`;
  return `De FY${a.year} a FY${b.year} el ROE ${total >= 0 ? "subió" : "bajó"} de ${pct(a.roe)} a ${pct(b.roe)}. ` +
    `Lo explica sobre todo ${move(top)}` +
    (against ? `; en sentido contrario jugó ${move(against)}.` : ".");
}

function DuPont({ c }: { c: Company }) {
  const D = dupont(c);
  const n = D.length;
  const line = n >= 2 ? driver(D[n - 2], D[n - 1], c.financial) : "Hace falta más de un ejercicio para ver qué cambió.";
  const x = (v: number | null) => (v == null ? "–" : `${num(v)}x`);
  return (
    <section>
      <p className="lead">{line}</p>
      <div className="tablebox">
        <table>
          <thead>
            <tr>
              <th className="l sticky">Ejercicio</th>
              {c.financial ? <th title="Resultado neto / activo">ROA</th> : <>
                <th title="Resultado neto / ingresos">Margen neto</th>
                <th title="Ingresos / activo">Rotación</th>
              </>}
              <th title="Activo / patrimonio neto">Apalancamiento</th>
              <th title="Producto de los factores = resultado neto / patrimonio neto">ROE</th>
            </tr>
          </thead>
          <tbody>
            {[...D].reverse().map((d) => (
              <tr key={d.year}>
                <td className="l sticky">FY{d.year}</td>
                {c.financial ? <td>{pct(d.roa)}</td> : <><td className={(d.margin ?? 0) < 0 ? "neg" : ""}>{pct(d.margin)}</td><td>{x(d.turn)}</td></>}
                <td>{x(d.lev)}</td>
                <td className={(d.roe ?? 0) < 0 ? "neg" : ""}>{pct(d.roe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        ROE = margen neto × rotación de activos × apalancamiento{c.financial ? " (en financieras: ROA × apalancamiento, porque sus “ingresos” no son comparables)" : ""}.
        Activo y patrimonio son promedios del cierre anterior y el actual, igual que Investing. Con patrimonio neto negativo el
        apalancamiento y el ROE no tienen sentido y quedan vacíos.
        {c.converted && ` Calculado en ${c.reported_currency} para no mezclar el tipo de cambio promedio con el de cierre.`}
      </p>
    </section>
  );
}

// ─────────────────────────── Qué cambió ───────────────────────────

const CHANGE_ROWS: { label: string; key: string; kind: "amt" | "ratio" | "eps" }[] = [
  { label: "Ingresos", key: "revenue", kind: "amt" },
  { label: "Margen bruto", key: "gross_margin", kind: "ratio" },
  { label: "Resultado operativo", key: "operating_income", kind: "amt" },
  { label: "Margen operativo", key: "op_margin", kind: "ratio" },
  { label: "EBITDA", key: "ebitda", kind: "amt" },
  { label: "Resultado neto", key: "net_income", kind: "amt" },
  { label: "Margen neto", key: "net_margin", kind: "ratio" },
  { label: "EPS diluido", key: "eps_diluted", kind: "eps" },
  { label: "Flujo operativo", key: "ocf", kind: "amt" },
  { label: "CAPEX", key: "capex", kind: "amt" },
  { label: "Caja libre", key: "fcf", kind: "amt" },
  { label: "Caja", key: "cash", kind: "amt" },
  { label: "Deuda total", key: "total_debt", kind: "amt" },
  { label: "Patrimonio neto", key: "equity", kind: "amt" },
];

function Changed({ c }: { c: Company }) {
  const Q = c.quarters ?? [];
  const L = Q[Q.length - 1];
  const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 864e5;
  const P = L ? [...Q].reverse().find((q) => { const d = days(L.end, q.end); return d >= 350 && d <= 380; }) : undefined;
  const annual = !L || !P;
  const R = c.rows;
  const cur: Period | undefined = annual ? R[R.length - 1] : L;
  const prev: Period | undefined = annual ? R[R.length - 2] : P;
  if (!cur || !prev) return <p className="hint">No hay dos períodos comparables.</p>;
  const lab = (p: Period) => (annual ? `FY${p.year}` : mmyy(String(p.end)));

  return (
    <section>
      <p className="lead">
        {annual
          ? "La empresa no tiene el mismo trimestre del año anterior en XBRL: se comparan los dos últimos ejercicios."
          : `Trimestre cerrado en ${mmyy(L.end)} contra el mismo trimestre de un año antes. Interanual para evitar la estacionalidad.`}
      </p>
      <div className="tablebox">
        <table>
          <thead>
            <tr>
              <th className="l sticky">Concepto</th>
              <th>{lab(prev)}</th><th>{lab(cur)}</th><th title="Montos: variación %. Márgenes: diferencia en puntos porcentuales">Variación</th>
            </tr>
          </thead>
          <tbody>
            {CHANGE_ROWS.filter((r) => !(c.financial && r.kind === "ratio")).map((r) => {
              const a = val(prev, r.key), b = val(cur, r.key);
              let d = "–", cls = "";
              if (a != null && b != null) {
                if (r.kind === "ratio") { const x = (b - a) * 100; d = `${x >= 0 ? "+" : ""}${x.toFixed(1)} pp`; cls = x < 0 ? "neg" : ""; }
                else if (a > 0) { const x = b / a - 1; d = `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`; cls = x < 0 && r.key !== "capex" && r.key !== "total_debt" ? "neg" : ""; }
                else d = "n/c";
              }
              const f = r.kind === "ratio" ? pct : r.kind === "eps" ? (v: number | null) => num(v) : money;
              return (
                <tr key={r.key}>
                  <td className="l sticky">{r.label}</td>
                  <td>{f(a)}</td><td>{f(b)}</td><td className={cls}>{d}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        n/c: la variación porcentual no tiene sentido cuando el período anterior es cero o negativo.
        {c.converted && !annual && val(L, "rev_yoy_local") != null &&
          ` En ${c.reported_currency}, los ingresos variaron ${pct(val(L, "rev_yoy_local"))}; la diferencia con la variación en USD es efecto cambiario.`}
      </p>
    </section>
  );
}

// ─────────────────────────── Alertas ───────────────────────────

function Alerts({ c }: { c: Company }) {
  return (
    <section>
      {c.alerts.length === 0 && c.missing.length === 0 ? (
        <p className="hint">Sin alertas automáticas. Igual conviene leer el último filing.</p>
      ) : (
        <ul className="watch">
          {c.alerts.map((a) => <li key={a}>{a}</li>)}
          {c.missing.map((m) => <li key={m}>Sin dato mapeado para {m}: verificar en el filing.</li>)}
        </ul>
      )}
      {c.converted && (
        <p className="note">
          Presenta sus estados en {c.reported_currency}. Resultados, flujos y EPS pasan a USD al tipo de cambio
          promedio de cada período; activos, pasivos y patrimonio al de cierre ({c.fx_source}). Los ratios se
          calculan en {c.reported_currency}. El EPS es por acción ordinaria, no por ADR.
        </p>
      )}
      <details>
        <summary>Conceptos XBRL usados</summary>
        <ul>
          {Object.entries(c.concepts_used).map(([k, v]) => (
            <li key={k}><code>{k}</code>: {v.length ? v.join(", ") : "sin dato"}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
