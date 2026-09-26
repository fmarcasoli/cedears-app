import type { Bench, Industries, Row } from "./data";
import { COL, type MKey, type View } from "./metrics";
import { pct } from "./format";

/** Qué columna de Damodaran se compara con cada indicador nuestro, y en qué difiere. */
export const BENCH: { key: MKey; bench: string; note?: string }[] = [
  { key: "gross_margin", bench: "gross_margin" },
  { key: "op_margin", bench: "op_margin" },
  { key: "net_margin", bench: "net_margin" },
  { key: "roe", bench: "roe", note: "Industria: resultado neto total / patrimonio total (sin promediar saldos)." },
  { key: "rev_cagr5", bench: "rev_cagr5" },
  { key: "eps_cagr5", bench: "ni_cagr5", note: "Industria: crecimiento del resultado neto, no del EPS." },
  { key: "de", bench: "de", note: "Industria: deuda contable / patrimonio, derivada de su deuda sobre capital." },
  { key: "debt_ebitda", bench: "debt_ebitda" },
  { key: "inv_turnover", bench: "inv_turnover" },
  { key: "ar_turnover", bench: "ar_turnover" },
  { key: "pe", bench: "pe", note: "Industria: capitalización total / resultado de las empresas con ganancias." },
  { key: "peg", bench: "peg", note: "Industria: con crecimiento ESPERADO a 5 años; el nuestro es histórico." },
  { key: "pb", bench: "pb" },
  { key: "ps", bench: "ps" },
];

export const BLOCKS: { title: string; keys: MKey[] }[] = [
  { title: "Rentabilidad", keys: ["gross_margin", "op_margin", "net_margin", "roe"] },
  { title: "Crecimiento (5 años)", keys: ["rev_cagr5", "eps_cagr5"] },
  { title: "Deuda", keys: ["de", "debt_ebitda"] },
  { title: "Eficiencia", keys: ["inv_turnover", "ar_turnover"] },
  { title: "Valuación", keys: ["pe", "peg", "pb", "ps"] },
];

const PCT = new Set<MKey>(["gross_margin", "op_margin", "net_margin", "roe", "rev_cagr5", "eps_cagr5"]);

export function benchOf(ind: Industries | null, r: Row): Bench | null {
  if (!ind || !r.dam_industry || !r.dam_region) return null;
  return ind[r.dam_region]?.[r.dam_industry] ?? null;
}

export const regionLabel = (r: Row) => (r.dam_region === "us" ? "EE.UU." : "global");

/** Valor de la industria para uno de nuestros indicadores. */
export function benchValue(b: Bench | null, k: MKey): number | null {
  const m = BENCH.find((x) => x.key === k);
  const v = m && b ? b[m.bench] : null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Diferencia legible y si la empresa está mejor que la industria. */
export function versus(k: MKey, x: number | null, ind: number | null): { text: string; better: boolean | null } {
  if (x == null || ind == null) return { text: "–", better: null };
  const dir = COL[k].shade;
  const better = dir === "high" ? x > ind : dir === "low" ? x < ind : null;
  if (PCT.has(k)) {
    const d = (x - ind) * 100;
    return { text: `${d >= 0 ? "+" : ""}${d.toFixed(1)} pp`, better };
  }
  if (ind <= 0) return { text: "–", better };
  const r = x / ind - 1;
  const word = k === "pe" || k === "peg" || k === "pb" || k === "ps"
    ? (r < 0 ? "más barata" : "más cara")
    : (r >= 0 ? "arriba" : "abajo");
  return { text: `${pct(Math.abs(r))} ${word}`, better };
}
