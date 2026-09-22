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
};
export type Meta = {
  generated: string; total_cedears: number; with_sec: number; ok: number;
  errors: { byma: string; error: string }[]; without_sec: string[];
};
export type YearRow = Record<string, number | string | null> & { year: number; fiscal_end: string };
export type Company = {
  byma: string; ticker: string; name: string; cik: number; sector: string;
  taxonomy: string; currency: string; reported_currency: string; converted: boolean;
  fx_source?: string; last_filed: string; ratio: string | null;
  rows: YearRow[]; alerts: string[]; missing: string[]; financial: boolean; stale: boolean;
  api_lag: boolean;
  quarters: (Record<string, number | string | null> & { end: string })[];
  ttm: (Record<string, number | string | null> & { end: string }) | null;
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
