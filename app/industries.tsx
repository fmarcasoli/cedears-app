"use client";

import type { Meta, Row } from "@/lib/data";
import { BENCH_KEYS, benchSource, benchValue } from "@/lib/industry";
import { COL, type MKey } from "@/lib/metrics";

/** Valores de la industria (Investing; Damodaran de respaldo) para las industrias de las empresas
 *  listadas, con las columnas de la vista activa. Tocar una industria filtra. */
export default function IndustryPanel({ rows, cols, sources, current, onPick }: {
  rows: Row[]; cols: MKey[]; sources: Meta["industry_sources"]; current: string; onPick: (s: string) => void;
}) {
  const shown = cols.filter((k) => BENCH_KEYS.includes(k));
  const groups = new Map<string, { name: string; n: number; row: Row }>();
  for (const r of rows) {
    if (!r.ind_name || !r.ind_bench) continue;
    const g = groups.get(r.ind_name) ?? { name: r.ind_name, n: 0, row: r };
    g.n++;
    groups.set(r.ind_name, g);
  }
  const list = [...groups.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const inv = sources?.investing, dam = sources?.damodaran;
  return (
    <section className="gloss" id="industrias" aria-label="Valores de la industria">
      <p className="hint">
        Valores de la industria tomados de afuera, no calculados acá: {inv ? <>Investing.com (columna “Industria”, al {inv.updated})</> : "Investing.com"}
        {dam && <>; lo que Investing no publica o trae con valores absurdos, de {dam.source} ({dam.updated})</>}.
        {shown.length === 0 && " Esta vista no tiene columnas con dato de industria."} Tocá una industria para filtrar la tabla.
      </p>
      <div className="tablebox">
        <table>
          <thead>
            <tr>
              <th className="l sticky" scope="col">Industria</th>
              <th scope="col" title="CEDEARs de esta industria en la lista">CEDEARs</th>
              {shown.map((k) => <th key={k} scope="col" title={COL[k].tip}>{COL[k].label}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.name} className={current === g.name ? "sel" : undefined}>
                <td className="l sticky">
                  <button type="button" className="tk" onClick={() => onPick(current === g.name ? "" : g.name)}>{g.name}</button>
                </td>
                <td>{g.n}</td>
                {shown.map((k) => {
                  const v = benchValue(g.row, k);
                  const src = benchSource(g.row, k);
                  return (
                    <td key={k} className={v != null && v < 0 ? "neg" : ""} title={src ? `Fuente: ${src === "investing" ? "Investing" : "Damodaran"}` : undefined}>
                      {COL[k].fmt(v)}{src === "damodaran" && <span className="muted"> ᴰ</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">ᴰ = dato de Damodaran (Investing no lo publica para esa industria o su valor no era razonable).</p>
    </section>
  );
}
