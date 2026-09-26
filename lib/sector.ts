import type { Row } from "./data";
import { COL, rankable, type MKey, type View } from "./metrics";

/** Sector amplio de la fila. Con datos viejos (sin sector_group) cae a la descripción SIC. */
export const sectorOf = (r: Row) => r.sector_group || r.sector || "Sin sector";

export const MIN_PEERS = 3; // con menos empresas con dato, la mediana no dice nada

export type SectorStat = {
  name: string;
  n: number;                                  // empresas del sector
  vals: Partial<Record<MKey, number[]>>;      // valores ordenados por métrica
};

const median = (a: number[]) =>
  a.length % 2 ? a[(a.length - 1) >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;

/** Agrupa el universo (en la base elegida) por sector y guarda los valores de cada métrica. */
export function sectorStats(views: View[]): Map<string, SectorStat> {
  const out = new Map<string, SectorStat>();
  const keys = Object.keys(COL) as MKey[];
  for (const v of views) {
    const name = sectorOf(v.row);
    let st = out.get(name);
    if (!st) out.set(name, (st = { name, n: 0, vals: {} }));
    st.n++;
    for (const k of keys) {
      const x = rankable(v, k);
      if (x == null || !Number.isFinite(x)) continue;
      (st.vals[k] ??= []).push(x);
    }
  }
  for (const st of out.values()) for (const k of keys) st.vals[k]?.sort((a, b) => a - b);
  return out;
}

export function sectorMedian(st: SectorStat | undefined, k: MKey): number | null {
  const a = st?.vals[k];
  return a && a.length >= MIN_PEERS ? median(a) : null;
}

/** Posición de la empresa dentro del sector: % de pares que supera (según si más es mejor). */
export function sectorPosition(st: SectorStat | undefined, k: MKey, x: number | null): number | null {
  const a = st?.vals[k];
  if (x == null || !a || a.length < MIN_PEERS) return null;
  const below = a.filter((y) => y < x).length, equal = a.filter((y) => y === x).length;
  const p = (below + Math.max(equal - 1, 0) / 2) / (a.length - 1);
  return COL[k].shade === "low" ? 1 - p : p;
}
