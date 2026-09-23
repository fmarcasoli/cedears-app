import { promises as fs } from "fs";
import path from "path";

export type ScreenerRow = {
  byma: string; ticker: string; name: string; sector: string; currency: string;
  reported_currency: string; converted: boolean;
  fy: number | null; fiscal_end: string | null; last_filed: string;
  revenue: number | null; net_income: number | null; fcf: number | null;
  rev_growth: number | null; rev_cagr3: number | null;
  gross_margin: number | null; op_margin: number | null; net_margin: number | null;
  fcf_margin: number | null; roe: number | null; debt_equity: number | null;
  current_ratio: number | null; alerts: number; missing: string[];
  financial: boolean; stale: boolean; api_lag: boolean;
  ttm_end: string | null; q_end: string | null; q_rev_yoy: number | null; q_eps_yoy: number | null;
  t_revenue: number | null; t_net_income: number | null; t_fcf: number | null; t_rev_growth: number | null;
  t_gross_margin: number | null; t_op_margin: number | null; t_net_margin: number | null;
  t_fcf_margin: number | null; t_roe: number | null; t_debt_equity: number | null; t_current_ratio: number | null;
  // EBITDA y deuda neta/EBITDA (el ratio se calcula en el ETL en moneda de origen).
  // Opcionales: los screener.json anteriores a este cambio no los traen.
  ebitda?: number | null; nd_ebitda?: number | null; t_ebitda?: number | null; t_nd_ebitda?: number | null;
  // Valuación: capitalización en USD (Nasdaq, fecha de la corrida) y CAGR 3a del
  // resultado neto en moneda de origen, para el PEG.
  market_cap?: number | null; mcap_date?: string | null; ni_cagr3?: number | null;
};

/** Saldos de balance que el screener.json no trae y la UI necesita (deuda/PN con PN
 *  negativo). Salen de companies/*.json al compilar. */
export type Balance = { equity: number | null; debt: number | null };
export type Row = ScreenerRow & { cik: number | null; bal_a: Balance; bal_t: Balance | null };

export type Meta = {
  generated: string; total_cedears: number; with_sec: number; ok: number;
  errors: { byma: string; error: string }[]; without_sec: string[];
};
export type Period = Record<string, number | string | null>;
export type YearRow = Period & { year: number; fiscal_end: string };
export type Company = {
  byma: string; ticker: string; name: string; cik: number; sector: string;
  taxonomy: string; currency: string; reported_currency: string; converted: boolean;
  fx_source?: string; last_filed: string; ratio: string | null;
  rows: YearRow[]; alerts: string[]; missing: string[]; financial: boolean; stale: boolean;
  api_lag: boolean;
  quarters: (Period & { end: string })[];
  ttm: (Period & { end: string }) | null;
  concepts_used: Record<string, string[]>;
};

const DATA_DIR = path.join(process.cwd(), "public", "data");

export async function getScreener(): Promise<{ meta: Meta; rows: ScreenerRow[] }> {
  const raw = await fs.readFile(path.join(DATA_DIR, "screener.json"), "utf-8");
  return JSON.parse(raw);
}

export async function getCompany(byma: string): Promise<Company | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "companies", `${byma}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const n = (p: Period | null | undefined, k: string) => {
  const v = p?.[k];
  return typeof v === "number" ? v : null;
};

const balance = (p: Period | null | undefined): Balance => ({ equity: n(p, "equity"), debt: n(p, "total_debt") });

export async function getRows(): Promise<{ meta: Meta; rows: Row[] }> {
  const { meta, rows } = await getScreener();
  const out = await Promise.all(
    rows.map(async (r) => {
      const c = await getCompany(r.byma);
      const last = c?.rows[c.rows.length - 1];
      return { ...r, cik: c?.cik ?? null, bal_a: balance(last), bal_t: c?.ttm ? balance(c.ttm) : null };
    })
  );
  return { meta, rows: out };
}
