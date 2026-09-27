"use client";

import { useEffect, useState } from "react";
import type { Company, Period } from "@/lib/data";
import { money } from "@/lib/format";
import { Chart } from "./charts";

/**
 * Ingresos por segmento de negocio, desde el XBRL de cada 10-Q / 10-K (scripts/segments.py).
 * Los segmentos son los que define cada empresa: se comparan contra ella misma, no entre empresas.
 */

type Serie = { end: string; values: Record<string, number | null> };
type Block = { members: { id: string; label: string }[]; quarters: Serie[]; annual: Serie[] };
type SegFile = { unit: string | null; converted: boolean; filings: { form: string; filed: string; period: string }[]; seg: Block | null };

// paleta categórica tomada de one618am.com (azules primero, después tonos que se distinguen)
const PALETTE = ["#16469e", "#8fb4e3", "#2d9387", "#b3a9a9", "#6c7cb7", "#3bc3de", "#946745", "#a154a1", "#1b1b59", "#ef6421"];

const qLabel = (end: string) => {
  const d = new Date(Date.parse(end) - 15 * 864e5);
  return `${Math.floor(d.getUTCMonth() / 3) + 1}T ${String(d.getUTCFullYear()).slice(2)}`;
};
const near = (a: string, b: string, tol = 10) => Math.abs(Date.parse(a) - Date.parse(b)) <= tol * 864e5;
const pctTxt = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const moneyAxis = (x: number) => (x === 0 ? "0" : money(x));

export function Segments({ c, q }: { c: Company; q: (Period & { end: string })[] }) {
  const [data, setData] = useState<SegFile | null | "none">(null);
  useEffect(() => {
    let alive = true;
    fetch(`/data/segments/${encodeURIComponent(c.byma)}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: SegFile) => alive && setData(j.seg ? j : "none"))
      .catch(() => alive && setData("none"));
    return () => { alive = false; };
  }, [c.byma]);

  if (data === null) return <p className="hint">Cargando segmentos…</p>;
  if (data === "none")
    return <p className="hint">Sin ingresos por segmento: la empresa no los informa en el XBRL de sus 10-Q / 10-K (o todavía no se procesaron).</p>;

  const seg = data.seg!;
  const quarterly = seg.quarters.length >= 4;
  const series = (quarterly ? seg.quarters : seg.annual).slice(quarterly ? -12 : -6);
  const labels = series.map((s) => (quarterly ? qLabel(s.end) : `FY${s.end.slice(0, 4)}`));
  const last = series[series.length - 1];
  // orden: el segmento más grande del último período primero; fuera los que no tienen datos en la ventana
  const members = seg.members
    .filter((m) => series.some((s) => s.values[m.id] != null))
    .sort((a, b) => (last.values[b.id] ?? -Infinity) - (last.values[a.id] ?? -Infinity));
  const color = (i: number) => PALETTE[i % PALETTE.length];

  const total = (s: Serie) => {
    const pool: Period[] = quarterly ? q : c.rows.map((y) => ({ ...y, end: y.fiscal_end }));
    const v = pool.find((p) => near(String(p.end), s.end))?.revenue;
    return typeof v === "number" ? v : null;
  };
  const sum = (s: Serie) => members.reduce((a, m) => a + (s.values[m.id] ?? 0), 0);
  const cover = total(last) ? sum(last) / total(last)! : null;
  const yearAgo = series.find((s) => {
    const d = (Date.parse(last.end) - Date.parse(s.end)) / 864e5;
    return d > 350 && d < 380;
  });
  if (cover != null && cover < 0.5)
    return (
      <p className="hint">
        La empresa informa por segmento solo el {Math.round(cover * 100)}% de sus ingresos en el XBRL de su último
        {` ${data.filings[data.filings.length - 1]?.form ?? "10-Q"}`}: no alcanza para mostrar un desglose.
      </p>
    );
  const cols = series.slice(-6);
  const lastF = data.filings[data.filings.length - 1];

  return (
    <div className="segs">
      <Chart title={`Ingresos por segmento${quarterly ? " (trimestre)" : " (ejercicio)"}`} labels={labels} kind="bar" stacked
        fmt={money} axisFmt={moneyAxis} height={220}
        series={members.map((m, i) => ({ name: m.label, values: series.map((s) => s.values[m.id] ?? null), tone: 1 as const, color: color(i) }))}
        overlay={[{ name: "Ingresos totales", values: series.map(total), tone: 4 }]} />
      <div className="tablebox">
        <table className="segtab">
          <thead>
            <tr>
              <th className="l sticky">Segmento</th>
              {cols.map((s) => <th key={s.end}>{quarterly ? qLabel(s.end) : `FY${s.end.slice(0, 4)}`}</th>)}
              <th title="Participación en la suma de los segmentos del último período">Peso</th>
              <th title={quarterly ? "Contra el mismo trimestre del año anterior" : "Contra el ejercicio anterior"}>A/A</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const v = last.values[m.id] ?? null;
              const prev = quarterly ? yearAgo?.values[m.id] ?? null : series[series.length - 2]?.values[m.id] ?? null;
              const g = v != null && prev != null && prev > 0 ? v / prev - 1 : null;
              const tot = sum(last);
              return (
                <tr key={m.id}>
                  <td className="l sticky"><i className="sw" style={{ background: color(i) }} />{m.label}</td>
                  {cols.map((s) => {
                    const x = s.values[m.id] ?? null;
                    return <td key={s.end} className={x != null && x < 0 ? "neg" : ""}>{money(x)}</td>;
                  })}
                  <td>{v != null && tot > 0 ? `${Math.round((v / tot) * 100)}%` : "–"}</td>
                  <td className={`dv ${g == null ? "" : g > 0 ? "up" : g < 0 ? "down" : ""}`}>{g == null ? "–" : pctTxt(g)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Segmentos tal como los define la empresa en su {lastF?.form ?? "10-Q"}
        {lastF ? ` (presentado el ${lastF.filed})` : ""}; los nombres quedan en inglés, como en el original.
        {!quarterly && " La empresa no presenta trimestres en XBRL: se muestran ejercicios."}
        {data.converted && ` Convertido a USD desde ${data.unit}.`}
        {cover != null && cover > 1.02 &&
          ` Los segmentos suman ${Math.round(cover * 100)}% de los ingresos totales: incluyen ventas entre segmentos que la empresa elimina recién al consolidar.`}
        {cover != null && cover < 0.98 &&
          ` Los segmentos cubren el ${Math.round(cover * 100)}% de los ingresos totales: el resto la empresa no lo desglosa por segmento (por ejemplo ingresos financieros o de seguros).`}
      </p>
    </div>
  );
}
