import type { Row } from "./data";
import { COL, type MKey } from "./metrics";
import { pct } from "./format";

/**
 * Comparación contra la industria con parámetros EXTERNOS por métrica (row.ind_bench):
 * Investing.com (columna "Industria" de su página de ratios) y, para lo que Investing no
 * publica o da un valor absurdo, Damodaran (NYU Stern).
 */
export const BLOCKS: { title: string; keys: MKey[] }[] = [
  { title: "Rentabilidad", keys: ["gross_margin", "op_margin", "pretax_margin", "net_margin", "roe"] },
  { title: "Crecimiento", keys: ["growth", "q_yoy", "eps_ttm_yoy", "q_eps_yoy", "rev_cagr5", "eps_cagr5"] },
  { title: "Deuda y liquidez", keys: ["de", "debt_ebitda", "current_ratio", "quick_ratio"] },
  { title: "Eficiencia", keys: ["asset_turnover", "inv_turnover", "ar_turnover"] },
  { title: "Valuación", keys: ["pe", "peg", "pb", "ps", "pcf"] },
  { title: "Promedios de 5 años", keys: ["gm5", "om5", "ptm5", "nm5", "capex_cagr5"] },
];
export const BENCH_KEYS = BLOCKS.flatMap((b) => b.keys);

/** Diferencias de definición cuando el dato viene de Damodaran. */
export const DAMODARAN_NOTES: Partial<Record<MKey, string>> = {
  eps_cagr5: "Damodaran: crecimiento del resultado neto, no del EPS.",
  debt_ebitda: "Damodaran: deuda bruta con arrendamientos / EBITDA.",
  pe: "Damodaran: capitalización total / resultado de las empresas con ganancias.",
  peg: "Damodaran: con crecimiento esperado a 5 años; el nuestro es histórico.",
  roe: "Damodaran: resultado neto total / patrimonio total.",
  de: "Damodaran: deuda contable / patrimonio, derivada de su deuda sobre capital.",
};

const PCT = new Set<MKey>(["gross_margin", "op_margin", "pretax_margin", "net_margin", "roe", "growth", "q_yoy",
  "eps_ttm_yoy", "q_eps_yoy", "rev_cagr5", "eps_cagr5", "gm5", "om5", "ptm5", "nm5", "capex_cagr5"]);

export function benchValue(r: Row, k: MKey): number | null {
  const v = r.ind_bench?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export const benchSource = (r: Row, k: MKey) => r.ind_src?.[k] ?? null;

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
  const word = ["pe", "peg", "pb", "ps", "pcf"].includes(k) ? (r < 0 ? "más barata" : "más cara") : (r >= 0 ? "arriba" : "abajo");
  return { text: `${pct(Math.abs(r))} ${word}`, better };
}
