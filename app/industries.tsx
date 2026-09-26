"use client";

import type { Industries, Row } from "@/lib/data";
import { BENCH } from "@/lib/industry";
import { COL, type MKey } from "@/lib/metrics";

/** Promedios de la industria real (Damodaran) para las industrias de las empresas listadas,
 *  con las columnas de la vista activa que Damodaran publica. Tocar una industria filtra. */
export default function IndustryPanel({ data, rows, cols, current, onPick }: {
  data: Industries; rows: Row[]; cols: MKey[]; current: string; onPick: (s: string) => void;
}) {
  const shown = cols.filter((k) => BENCH.some((b) => b.key === k));
  const groups = new Map<string, { name: string; region: "us" | "global"; n: number }>();
  for (const r of rows) {
    if (!r.dam_industry || !r.dam_region) continue;
    const id = `${r.dam_region}|${r.dam_industry}`;
    const g = groups.get(id) ?? { name: r.dam_industry, region: r.dam_region, n: 0 };
    g.n++;
    groups.set(id, g);
  }
  const list = [...groups.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const bench = (g: { name: string; region: "us" | "global" }) => data[g.region]?.[g.name] ?? {};
  return (
    <section className="gloss" id="industrias" aria-label="Indicadores de la industria">
      <p className="hint">
        Promedios de la industria real, no de los CEDEARs: {data.meta.source}, actualizado el{" "}
        {data.meta.updated ?? "–"}, sobre ~6.000 empresas de EE.UU. y ~48.000 del mundo. Son agregados (suma de
        resultados / suma de ventas de toda la industria). Empresas de EE.UU. contra la industria de EE.UU.; el resto,
        contra la global. {shown.length === 0 && "Esta vista no tiene columnas que Damodaran publique: probá Rentabilidad, Valuación o 5 años."}
        {" "}Tocá una industria para filtrar la tabla.
      </p>
      <div className="tablebox">
        <table>
          <thead>
            <tr>
              <th className="l sticky" scope="col">Industria</th>
              <th scope="col" title="Empresas de la industria en la base de Damodaran">Empresas</th>
              <th scope="col" title="CEDEARs de esta industria en la lista">CEDEARs</th>
              {shown.map((k) => <th key={k} scope="col" title={BENCH.find((b) => b.key === k)?.note ?? COL[k].tip}>{COL[k].label}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((g) => {
              const b = bench(g);
              const id = `${g.region}|${g.name}`;
              return (
                <tr key={id} className={current === id ? "sel" : undefined}>
                  <td className="l sticky">
                    <button type="button" className="tk" onClick={() => onPick(current === id ? "" : id)}>{g.name}</button>
                    <span className="sub">{g.region === "us" ? "EE.UU." : "Global"}</span>
                  </td>
                  <td>{typeof b.n === "number" ? b.n.toLocaleString("es-AR") : "–"}</td>
                  <td>{g.n}</td>
                  {shown.map((k) => {
                    const m = BENCH.find((x) => x.key === k)!;
                    const v = b[m.bench];
                    return <td key={k} className={typeof v === "number" && v < 0 ? "neg" : ""}>{COL[k].fmt(typeof v === "number" ? v : null)}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
