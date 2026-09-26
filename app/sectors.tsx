"use client";

import { COL, type MKey } from "@/lib/metrics";
import { MIN_PEERS, sectorMedian, type SectorStat } from "@/lib/sector";

/** Tabla de medianas por sector con las columnas de la vista activa. Tocar un sector filtra. */
export default function Sectors({ stats, cols, current, onPick }: {
  stats: Map<string, SectorStat>; cols: MKey[]; current: string; onPick: (s: string) => void;
}) {
  const rows = [...stats.values()].sort((a, b) => b.n - a.n);
  return (
    <section className="gloss" id="sectores" aria-label="Indicadores por sector">
      <p className="hint">
        Mediana de las empresas del universo de CEDEARs en cada sector (clasificación de Nasdaq), en la base
        elegida. La mediana no se deja arrastrar por casos extremos como el promedio. Con menos de {MIN_PEERS} empresas
        con dato no se muestra. Tocá un sector para filtrar la tabla.
      </p>
      <div className="tablebox">
        <table>
          <thead>
            <tr>
              <th className="l sticky" scope="col">Sector</th>
              <th scope="col">Empresas</th>
              {cols.map((k) => <th key={k} scope="col" title={COL[k].tip}>{COL[k].label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((st) => (
              <tr key={st.name} className={current === st.name ? "sel" : undefined}>
                <td className="l sticky">
                  <button type="button" className="tk" onClick={() => onPick(current === st.name ? "" : st.name)}>{st.name}</button>
                </td>
                <td>{st.n}</td>
                {cols.map((k) => {
                  const m = sectorMedian(st, k);
                  return <td key={k} className={m != null && m < 0 && k !== "alerts" ? "neg" : ""}>{COL[k].fmt(m)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
