import type { Row } from "./data";
import { COL, type MKey } from "./metrics";
import { pct } from "./format";

/**
 * Comparación contra la industria real con los valores de Damodaran (NYU Stern) por métrica
 * (row.ind_bench). Son agregados de la industria (suma de resultados / suma de ventas o de
 * patrimonio): pesan por tamaño. Solo se comparan las métricas que Damodaran publica.
 */
export const BLOCKS: { title: string; keys: MKey[] }[] = [
  { title: "Rentabilidad", keys: ["gross_margin", "op_margin", "net_margin", "roe"] },
  { title: "Crecimiento (5 años)", keys: ["rev_cagr5", "ni_cagr5"] },
  { title: "Deuda", keys: ["de", "debt_ebitda", "interest_cov"] },
  { title: "Eficiencia", keys: ["inv_turnover", "ar_turnover"] },
  { title: "Valuación", keys: ["pe", "peg", "pb", "ps"] },
];
export const BENCH_KEYS = BLOCKS.flatMap((b) => b.keys);

/** Cómo define Damodaran cada métrica de industria (tooltip del valor de industria). */
export const DAMODARAN_NOTES: Partial<Record<MKey, string>> = {
  gross_margin: "Resultado bruto total / ventas totales de la industria.",
  op_margin: "Resultado operativo total / ventas totales de la industria (antes de impuestos, sin ajustes).",
  net_margin: "Resultado neto total / ventas totales de la industria.",
  roe: "Resultado neto total / patrimonio contable total de la industria.",
  rev_cagr5: "Crecimiento anual compuesto de las ventas de la industria en 5 años.",
  ni_cagr5: "Crecimiento anual compuesto del resultado neto de la industria en 5 años.",
  de: "Deuda contable (con arrendamientos) / patrimonio, derivada de su deuda sobre capital.",
  debt_ebitda: "Deuda bruta con arrendamientos / EBITDA.",
  interest_cov: "Resultado operativo / intereses de la industria.",
  inv_turnover: "Costo de ventas / inventario, derivado de su inventario sobre ventas.",
  ar_turnover: "Ventas / cuentas a cobrar, derivado de su cartera sobre ventas.",
  pe: "Capitalización total / resultado de las empresas con ganancias.",
  peg: "PER / crecimiento ESPERADO a 5 años (el nuestro usa el histórico de 3 años).",
  pb: "Capitalización total / patrimonio contable total.",
  ps: "Capitalización total / ventas totales.",
};

const PCT = new Set<MKey>(["gross_margin", "op_margin", "pretax_margin", "net_margin", "roe", "growth", "q_yoy",
  "eps_ttm_yoy", "q_eps_yoy", "rev_cagr5", "eps_cagr5", "ni_cagr5", "gm5", "om5", "ptm5", "nm5", "capex_cagr5"]);

export function benchValue(r: Row, k: MKey): number | null {
  const v = r.ind_bench?.[k];
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
  const word = ["pe", "peg", "pb", "ps", "pcf"].includes(k) ? (r < 0 ? "más barata" : "más cara") : (r >= 0 ? "arriba" : "abajo");
  return { text: `${pct(Math.abs(r))} ${word}`, better };
}
