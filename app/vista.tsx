"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { Company, Period } from "@/lib/data";
import { money, num, pct } from "@/lib/format";
import { Chart, type Series } from "./charts";

/**
 * Vista: tablero de una empresa al estilo de un reporte de crédito. Últimos 6 trimestres con
 * variación trimestral e interanual, renglones que se abren con su gráfico de detalle y dos
 * gráficos de 12 meses (apalancamiento y caja libre).
 */

type Q = Period & { end: string };
const v = (p: Period | null | undefined, k: string) => {
  const x = p?.[k];
  return typeof x === "number" ? x : null;
};
const div = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? a / b : null);
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

/** "2T 26": trimestre calendario del cierre (restando 15 días: KO cierra el 3-abr su 1T). */
export const qLabel = (end: string) => {
  const d = new Date(Date.parse(end) - 15 * 864e5);
  return `${Math.floor(d.getUTCMonth() / 3) + 1}T ${String(d.getUTCFullYear()).slice(2)}`;
};

/** Suma de 12 meses que termina en el trimestre i (4 trimestres consecutivos, todos con dato). */
function ltm(q: Q[], i: number, k: string): number | null {
  if (i < 3) return null;
  const blk = q.slice(i - 3, i + 1);
  if (blk.some((r, j) => j > 0 && (days(blk[j - 1].end, r.end) < 75 || days(blk[j - 1].end, r.end) > 105))) return null;
  const vs = blk.map((r) => v(r, k));
  return vs.every((x) => x != null) ? (vs as number[]).reduce((a, b) => a + b, 0) : null;
}

const cashAll = (r: Period) => (v(r, "cash") == null ? null : v(r, "cash")! + (v(r, "st_investments") ?? 0));
const stDebt = (r: Period) => {
  const a = v(r, "st_debt"), b = v(r, "lt_debt_current");
  return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
};

type Kind = "money" | "ratio" | "times";
type RowDef = {
  key: string; label: string; kind: Kind; lowerBetter?: boolean; neutral?: boolean; tip: string;
  get: (q: Q[], i: number) => number | null;
  detail: (q: Q[], idx: number[], labels: string[]) => React.ReactNode;
};

const fmtOf = (k: Kind) => (k === "money" ? money : k === "ratio" ? pct : (x: number | null) => (x == null ? "–" : num(x, 1) + "x"));
const moneyAxis = (x: number) => (x === 0 ? "0" : money(x));
const pctAxis = (x: number) => `${Math.round(x * 100)}%`;
const xAxis = (x: number) => `${+x.toFixed(1)}x`;
const ser = (q: Q[], idx: number[], f: (q: Q[], i: number) => number | null) => idx.map((i) => f(q, i));
const at = (k: string) => (q: Q[], i: number) => v(q[i], k);
const ltmOf = (k: string) => (q: Q[], i: number) => ltm(q, i, k);

const ndEbitda = (q: Q[], i: number) => {
  const e = ltm(q, i, "ebitda"), nd = v(q[i], "net_debt");
  return e != null && e > 0 && nd != null ? nd / e : null;
};
const cover = (q: Q[], i: number) => {
  const e = ltm(q, i, "ebitda"), it = ltm(q, i, "interest");
  return e != null && it != null && it > 0 ? e / it : null;
};
const cashSt = (q: Q[], i: number) => {
  const d = stDebt(q[i]);
  return d != null && d > 0 ? div(cashAll(q[i]), d) : null;
};

const FIN: RowDef[] = [
  {
    key: "revenue", label: "Ingresos", kind: "money", tip: "Ventas del trimestre.", get: at("revenue"),
    detail: (q, idx, labels) => (
      <>
        <Chart title="Ingresos del trimestre" labels={labels} kind="bar" fmt={money} axisFmt={moneyAxis}
          series={[{ name: "Ingresos", values: ser(q, idx, at("revenue")), tone: 1 }]} />
        <Chart title="Crecimiento interanual" labels={labels} kind="line" fmt={pct} axisFmt={pctAxis} height={120}
          series={[{ name: "Interanual", values: ser(q, idx, at("rev_yoy")), tone: 1 }]} />
      </>
    ),
  },
  {
    key: "ebitda", label: "EBITDA", kind: "money", tip: "Resultado operativo + depreciaciones y amortizaciones.", get: at("ebitda"),
    detail: (q, idx, labels) => (
      <Chart title="EBITDA = resultado operativo + depreciaciones y amortizaciones" labels={labels} kind="bar" stacked
        fmt={money} axisFmt={moneyAxis}
        series={[{ name: "Resultado operativo", values: ser(q, idx, at("operating_income")), tone: 1 },
          { name: "Depreciaciones y amortizaciones", values: ser(q, idx, at("da_total")), tone: 2 }]}
        overlay={[{ name: "EBITDA", values: ser(q, idx, at("ebitda")), tone: 4 }]} />
    ),
  },
  {
    key: "ebitda_margin", label: "Margen EBITDA", kind: "ratio", tip: "EBITDA / ingresos.",
    get: (q, i) => div(v(q[i], "ebitda"), v(q[i], "revenue")),
    detail: (q, idx, labels) => (
      <Chart title="Margen EBITDA y margen operativo" labels={labels} kind="line" fmt={pct} axisFmt={pctAxis} height={150}
        series={[{ name: "Margen EBITDA", values: ser(q, idx, (q, i) => div(v(q[i], "ebitda"), v(q[i], "revenue"))), tone: 1 },
          { name: "Margen operativo", values: ser(q, idx, at("op_margin")), tone: 2 }]} />
    ),
  },
  {
    key: "net_income", label: "Resultado neto", kind: "money", tip: "Ganancia neta del trimestre.", get: at("net_income"),
    detail: (q, idx, labels) => (
      <>
        <Chart title="Resultado neto del trimestre" labels={labels} kind="bar" fmt={money} axisFmt={moneyAxis}
          series={[{ name: "Resultado neto", values: ser(q, idx, at("net_income")), tone: 1 }]} />
        <Chart title="Margen neto" labels={labels} kind="line" fmt={pct} axisFmt={pctAxis} height={120}
          series={[{ name: "Margen neto", values: ser(q, idx, at("net_margin")), tone: 1 }]} />
      </>
    ),
  },
  {
    key: "capex", label: "CAPEX", kind: "money", neutral: true, tip: "Inversión en activo fijo. Contra las amortizaciones: si es mayor, la empresa está ampliando su capacidad.",
    get: at("capex"),
    detail: (q, idx, labels) => (
      <>
        <Chart title="CAPEX contra depreciaciones y amortizaciones" labels={labels} kind="bar" fmt={money} axisFmt={moneyAxis}
          series={[{ name: "CAPEX", values: ser(q, idx, at("capex")), tone: 1 },
            { name: "Depreciaciones y amortizaciones", values: ser(q, idx, at("da_total")), tone: 2 }]} />
        <Chart title="CAPEX / ingresos" labels={labels} kind="line" fmt={pct} axisFmt={pctAxis} height={120}
          series={[{ name: "CAPEX / ingresos", values: ser(q, idx, (q, i) => div(v(q[i], "capex"), v(q[i], "revenue"))), tone: 1 }]} />
      </>
    ),
  },
  {
    key: "fcf", label: "Caja libre", kind: "money", tip: "Flujo operativo − CAPEX.", get: at("fcf"),
    detail: (q, idx, labels) => <FcfChart q={q} idx={idx} labels={labels} f={(k) => at(k)} title="Caja libre del trimestre" />,
  },
];

const LEV: RowDef[] = [
  {
    key: "nd_ebitda", label: "Deuda neta / EBITDA", kind: "times", lowerBetter: true,
    tip: "Deuda neta (financiera + arrendamientos − caja) sobre el EBITDA de 12 meses: años de EBITDA para cancelar la deuda.",
    get: ndEbitda,
    detail: (q, idx, labels) => (
      <>
        <Chart title="Composición de la deuda neta" labels={labels} kind="bar" stacked fmt={money} axisFmt={moneyAxis}
          series={[{ name: "Deuda financiera", values: ser(q, idx, at("fin_debt")), tone: 1 },
            { name: "Arrendamientos", values: ser(q, idx, at("leases")), tone: 2 },
            { name: "Caja e inversiones (resta)", values: ser(q, idx, (q, i) => { const c = cashAll(q[i]); return c == null ? null : -c; }), tone: 3 }]}
          overlay={[{ name: "Deuda neta", values: ser(q, idx, at("net_debt")), tone: 4 }]} />
        <Chart title="Deuda neta / EBITDA" labels={labels} kind="line" fmt={fmtOf("times")} axisFmt={xAxis} height={120}
          series={[{ name: "Deuda neta / EBITDA", values: ser(q, idx, ndEbitda), tone: 1 }]} />
      </>
    ),
  },
  {
    key: "cover", label: "EBITDA / intereses", kind: "times",
    tip: "Cuántas veces el EBITDA de 12 meses cubre los intereses pagados en 12 meses. Más alto, más holgura.",
    get: cover,
    detail: (q, idx, labels) => (
      <>
        <Chart title="Intereses de 12 meses" labels={labels} kind="bar" fmt={money} axisFmt={moneyAxis}
          series={[{ name: "Intereses", values: ser(q, idx, ltmOf("interest")), tone: 2 }]} />
        <Chart title="EBITDA / intereses" labels={labels} kind="line" fmt={fmtOf("times")} axisFmt={xAxis} height={120}
          series={[{ name: "Cobertura", values: ser(q, idx, cover), tone: 1 }]} />
      </>
    ),
  },
  {
    key: "cash_st", label: "Caja / deuda de corto plazo", kind: "times",
    tip: "Caja e inversiones de corto plazo sobre la deuda que vence en 12 meses. Arriba de 1, la caja alcanza para pagarla.",
    get: cashSt,
    detail: (q, idx, labels) => (
      <>
        <Chart title="Caja contra deuda de corto plazo" labels={labels} kind="bar" fmt={money} axisFmt={moneyAxis}
          series={[{ name: "Caja e inversiones CP", values: ser(q, idx, (q, i) => cashAll(q[i])), tone: 1 },
            { name: "Deuda de corto plazo", values: ser(q, idx, (q, i) => stDebt(q[i])), tone: 2 }]} />
        <Chart title="Caja / deuda de corto plazo" labels={labels} kind="line" fmt={fmtOf("times")} axisFmt={xAxis} height={120}
          series={[{ name: "Caja / deuda CP", values: ser(q, idx, cashSt), tone: 1 }]} />
      </>
    ),
  },
];

function FcfChart({ q, idx, labels, f, title }: {
  q: Q[]; idx: number[]; labels: string[]; title: string; f: (k: string) => (q: Q[], i: number) => number | null;
}) {
  const hasWc = idx.some((i) => f("wc")(q, i) != null);
  const neg = (k: string) => (q: Q[], i: number) => { const x = f(k)(q, i); return x == null ? null : -x; };
  const series: Series[] = hasWc
    ? [{ name: "FFO", values: ser(q, idx, f("ffo")), tone: 1 },
      { name: "Capital de trabajo", values: ser(q, idx, f("wc")), tone: 3 },
      { name: "CAPEX", values: ser(q, idx, neg("capex")), tone: 2 }]
    : [{ name: "Flujo operativo", values: ser(q, idx, f("ocf")), tone: 1 },
      { name: "CAPEX", values: ser(q, idx, neg("capex")), tone: 2 }];
  return (
    <Chart title={title} labels={labels} kind="bar" stacked fmt={money} axisFmt={moneyAxis} height={200}
      series={series} overlay={[{ name: "Caja libre", values: ser(q, idx, f("fcf")), tone: 4 }]} />
  );
}

function Delta({ a, b, kind, lowerBetter, neutral }: { a: number | null; b: number | null; kind: Kind; lowerBetter?: boolean; neutral?: boolean }) {
  if (a == null || b == null) return <td className="dv">–</td>;
  let d: number, txt: string;
  if (kind === "money") {
    if (b <= 0) return <td className="dv">–</td>;   // sin base positiva no hay variación % con sentido
    d = a / b - 1;
    txt = `${d >= 0 ? "+" : ""}${Math.round(d * 100)}%`;
  } else if (kind === "ratio") {
    d = a - b;
    txt = `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)} pp`;
  } else {
    d = a - b;
    txt = `${d >= 0 ? "+" : ""}${d.toFixed(1)}x`;
  }
  const good = lowerBetter ? d < 0 : d > 0;
  const zero = /^[+-]?0(\.0)?(%|x| pp)$/.test(txt);   // lo que se ve como 0 no se pinta
  return <td className={`dv ${neutral || zero ? "" : good ? "up" : "down"}`}>{zero ? txt.replace(/^[+-]/, "") : txt}</td>;
}

export function Vista({ c }: { c: Company }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // el detalle se dibuja del ancho visible de la tabla (no del ancho desplazable)
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const q = (c.quarters ?? []) as Q[];
  if (q.length < 5)
    return <p className="hint">La empresa no presenta trimestres en XBRL (ej. ADRs que informan con 20-F una vez por año): no hay vista trimestral.</p>;

  const last6 = q.map((_, i) => i).slice(-6);
  const cols = last6.map((i) => qLabel(q[i].end));
  const i0 = q.length - 1;
  // gráficos de 12 meses: todos los trimestres que tienen 12 meses completos (hasta 17)
  const idxL = q.map((_, i) => i).filter((i) => i >= 3);
  const labelsL = idxL.map((i) => qLabel(q[i].end));
  const idxQ = q.map((_, i) => i).slice(-12);
  const labelsQ = idxQ.map((i) => qLabel(q[i].end));
  const prevQ = i0 - 1, prevY = i0 - 4;

  const sections: { title: string; rows: RowDef[] }[] = c.financial
    ? [{ title: "Resultados del trimestre", rows: FIN.filter((r) => r.key === "revenue" || r.key === "net_income") }]
    : [{ title: "Resultados del trimestre", rows: FIN }, { title: "Deuda, cobertura y liquidez (12 meses)", rows: LEV }];

  const ebitdaL = ser(q, idxL, ltmOf("ebitda"));
  const ndL = ser(q, idxL, at("net_debt"));

  return (
    <section className="vista">
      <p className="lead">
        Últimos 6 trimestres en USD. Tocá un renglón para abrir su detalle con gráficos de 3 años (podés abrir varios a la vez).
        Variación: <span className="up">azul</span> mejoró, <span className="down">rojo</span> empeoró (el CAPEX no se pinta: invertir más no es bueno ni malo en sí).
      </p>
      <div className="tablebox" ref={box}>
        <table className="vtab">
          <thead>
            <tr className="vhead">
              <th className="l sticky" />
              <th colSpan={cols.length}>Trimestres</th>
              <th colSpan={2} className="vvar">Variación</th>
            </tr>
            <tr>
              <th className="l sticky">Concepto</th>
              {cols.map((l) => <th key={l}>{l}</th>)}
              <th className="vvar">T/T</th>
              <th className="vvar">A/A</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.title}>
                <tr className="group"><td colSpan={cols.length + 3}><span>{sec.title}</span></td></tr>
                {sec.rows.map((r) => {
                  const f = fmtOf(r.kind);
                  const isOpen = open.has(r.key);
                  const cur = r.get(q, i0);
                  return (
                    <Fragment key={r.key}>
                      <tr className={`vrow${isOpen ? " open" : ""}`}>
                        <td className="l sticky">
                          <button type="button" className="vtoggle" aria-expanded={isOpen} title={r.tip}
                            onClick={() => toggle(r.key)}>
                            <span className="chev" aria-hidden>▸</span>{r.label}
                          </button>
                        </td>
                        {last6.map((i) => {
                          const x = r.get(q, i);
                          return <td key={i} className={x != null && x < 0 ? "neg" : ""}>{f(x)}</td>;
                        })}
                        <Delta a={cur} b={prevQ >= 0 ? r.get(q, prevQ) : null} kind={r.kind} lowerBetter={r.lowerBetter} neutral={r.neutral} />
                        <Delta a={cur} b={prevY >= 0 ? r.get(q, prevY) : null} kind={r.kind} lowerBetter={r.lowerBetter} neutral={r.neutral} />
                      </tr>
                      {isOpen && (
                        <tr className="vdetail">
                          <td colSpan={cols.length + 3}>
                            <div className="vdetail-in" style={{ width: boxW }}>
                              <p className="note">{r.tip}</p>
                              {r.detail(q, idxQ, labelsQ)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {!c.financial && (
        <div className="vcharts">
          <div>
            <Chart title="Apalancamiento (12 meses)" labels={labelsL} kind="bar" fmt={money} axisFmt={moneyAxis} height={210}
              series={[{ name: "EBITDA 12 meses", values: ebitdaL, tone: 1 }, { name: "Deuda neta", values: ndL, tone: 2 }]} />
            <Chart title="Deuda neta / EBITDA" labels={labelsL} kind="line" fmt={fmtOf("times")} axisFmt={xAxis} height={130} showValues
              series={[{ name: "Deuda neta / EBITDA", values: ser(q, idxL, ndEbitda), tone: 1 }]} />
          </div>
          <div>
            <FcfChart q={q} idx={idxL} labels={labelsL} f={ltmOf} title="Caja libre (12 meses)" />
            <p className="note">
              FFO = flujo operativo antes de capital de trabajo. Capital de trabajo = lo que liberaron (+) o
              consumieron (−) cuentas a cobrar, inventario, proveedores y otros saldos operativos.
              Caja libre = FFO + capital de trabajo − CAPEX.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
