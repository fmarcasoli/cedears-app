import type { Balance, Row } from "./data";
import { money, num, pct } from "./format";

export type Basis = "ttm" | "annual";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const mmyy = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]}-${d.slice(2, 4)}`;

/** Métricas de una fila en la base elegida (TTM con respaldo al último ejercicio). */
export type Metrics = {
  revenue: number | null; net_income: number | null; fcf: number | null;
  growth: number | null; q_yoy: number | null; q_eps_yoy: number | null; cagr3: number | null;
  gross_margin: number | null; op_margin: number | null; net_margin: number | null; roe: number | null;
  fcf_margin: number | null; fcf_ni: number | null;
  de: number | null; nd_ebitda: number | null; current_ratio: number | null;
  alerts: number;
};
export type MKey = keyof Metrics;
export type PKey = "growth" | "profit" | "solid" | "quality";
export type Profile = Record<PKey, number | null>;

export type View = Metrics & {
  row: Row; period: string; fallback: boolean;
  /** PN <= 0: deuda/PN se muestra, pero queda fuera de rankings y sombreados. */
  neg_equity: boolean;
  profile: Profile | null;
};

const div = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? a / b : null);

function fromBalance(b: Balance | null, financial: boolean) {
  if (!b || financial) return { de: null, neg_equity: false };
  return { de: div(b.debt, b.equity), neg_equity: b.equity != null && b.equity <= 0 };
}

export function metrics(r: Row, basis: Basis): Omit<View, "profile"> {
  const useTtm = basis === "ttm" && !!r.ttm_end;
  const ni = useTtm ? r.t_net_income : r.net_income;
  const fcf = useTtm ? r.t_fcf : r.fcf;
  return {
    row: r,
    period: useTtm ? `TTM ${mmyy(r.ttm_end!)}` : r.fy ? `FY${r.fy}` : "–",
    fallback: basis === "ttm" && !r.ttm_end,
    revenue: useTtm ? r.t_revenue : r.revenue,
    net_income: ni, fcf,
    growth: useTtm ? r.t_rev_growth : r.rev_growth,
    q_yoy: r.q_rev_yoy, q_eps_yoy: r.q_eps_yoy, cagr3: r.rev_cagr3,
    gross_margin: useTtm ? r.t_gross_margin : r.gross_margin,
    op_margin: useTtm ? r.t_op_margin : r.op_margin,
    net_margin: useTtm ? r.t_net_margin : r.net_margin,
    roe: useTtm ? r.t_roe : r.roe,
    fcf_margin: useTtm ? r.t_fcf_margin : r.fcf_margin,
    // Con resultado neto <= 0 el cociente cambia de sentido: no se calcula.
    fcf_ni: r.financial || ni == null || ni <= 0 ? null : div(fcf, ni),
    current_ratio: useTtm ? r.t_current_ratio : r.current_ratio,
    nd_ebitda: r.financial ? null : (useTtm ? r.t_nd_ebitda : r.nd_ebitda) ?? null,
    ...fromBalance(useTtm ? r.bal_t : r.bal_a, r.financial),
    alerts: r.alerts,
  };
}

// ───────────────────────── Perfil por pilares ─────────────────────────

type PMetric = { key: MKey; low?: boolean; clamp?: [number, number] };
export const PILLARS: { key: PKey; label: string; short: string; metrics: PMetric[]; tip: string }[] = [
  {
    key: "growth", label: "Crecimiento", short: "Crec.",
    metrics: [{ key: "growth" }, { key: "q_yoy" }, { key: "cagr3" }],
    tip: "Crecimiento de ingresos 12 meses, último trimestre interanual y CAGR 3 años.",
  },
  {
    key: "profit", label: "Rentabilidad", short: "Rent.",
    metrics: [{ key: "gross_margin" }, { key: "op_margin" }, { key: "roe" }],
    tip: "Margen bruto, margen operativo y ROE.",
  },
  {
    key: "solid", label: "Solidez", short: "Sol.",
    metrics: [{ key: "de", low: true }, { key: "nd_ebitda", low: true }, { key: "current_ratio" }],
    tip: "Deuda/PN (menos es mejor; solo con PN positivo), deuda neta/EBITDA (menos es mejor) y liquidez corriente.",
  },
  {
    key: "quality", label: "Calidad del resultado", short: "Cal.",
    metrics: [{ key: "fcf_margin" }, { key: "fcf_ni", clamp: [-1, 2.5] }],
    tip: "Margen de caja libre y caja libre sobre resultado neto (acotado entre -1 y 2,5).",
  },
];

const PROFILE_NOTE =
  "Cada barra es un percentil de 0 a 100 contra las empresas no financieras del universo, en la base elegida: " +
  "se promedian los percentiles de sus métricas y solo se calcula si hay al menos la mitad de ellas. " +
  "No hay puntaje único: los pilares no se suman.";
export { PROFILE_NOTE };

/** Percentil 0-100 con rango medio para empates. */
function ranker(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return (v: number) => {
    if (s.length < 2) return null;
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
    let eq = lo;
    while (eq < s.length && s[eq] === v) eq++;
    return ((lo + (eq - lo - 1) / 2) / (s.length - 1)) * 100;
  };
}

const metricValue = (v: Omit<View, "profile">, m: PMetric) => {
  if (m.key === "de" && v.neg_equity) return null;
  const x = v[m.key];
  if (x == null) return null;
  return m.clamp ? Math.min(m.clamp[1], Math.max(m.clamp[0], x)) : x;
};

/** Calcula métricas + perfil de todo el universo en la base elegida. */
export function buildViews(rows: Row[], basis: Basis): View[] {
  const base = rows.map((r) => metrics(r, basis));
  const pool = base.filter((v) => !v.row.financial);
  const rank = new Map<MKey, ReturnType<typeof ranker>>();
  for (const p of PILLARS)
    for (const m of p.metrics)
      rank.set(m.key, ranker(pool.map((v) => metricValue(v, m)).filter((x): x is number => x != null)));
  return base.map((v) => {
    if (v.row.financial) return { ...v, profile: null };
    const profile = {} as Profile;
    for (const p of PILLARS) {
      const got = p.metrics
        .map((m) => {
          const x = metricValue(v, m);
          const q = x == null ? null : rank.get(m.key)!(x);
          return q == null ? null : m.low ? 100 - q : q;
        })
        .filter((x): x is number => x != null);
      profile[p.key] = got.length * 2 >= p.metrics.length ? got.reduce((a, b) => a + b, 0) / got.length : null;
    }
    return { ...v, profile };
  });
}

// ───────────────────────────── Listas ─────────────────────────────

export type ListId = "all" | "quality" | "accel" | "solid" | "review" | "mine";
export const LISTS: { id: ListId; label: string; crit: string; test: (v: View, mine: Set<string>) => boolean }[] = [
  { id: "all", label: "Todas", crit: "Todas las empresas con fundamentals en la SEC.", test: () => true },
  {
    id: "quality", label: "Calidad compuesta",
    crit: "Rentabilidad ≥ 70, calidad del resultado ≥ 60 y crecimiento ≥ 50 (percentiles contra no financieras).",
    test: (v) => !!v.profile && (v.profile.profit ?? -1) >= 70 && (v.profile.quality ?? -1) >= 60 && (v.profile.growth ?? -1) >= 50,
  },
  {
    id: "accel", label: "Crecimiento acelerando",
    crit: "Ingresos del último trimestre más de 10% arriba del mismo trimestre del año anterior, y al menos 3 pp por encima del crecimiento 12 meses.",
    test: (v) => v.q_yoy != null && v.growth != null && v.q_yoy > 0.1 && v.q_yoy - v.growth >= 0.03,
  },
  { id: "solid", label: "Balance sólido", crit: "Solidez ≥ 75 (deuda/PN, deuda neta/EBITDA y liquidez corriente).", test: (v) => (v.profile?.solid ?? -1) >= 75 },
  {
    id: "review", label: "Para revisar",
    crit: "3 alertas o más, último ejercicio con más de 15 meses, o un balance presentado que la API de la SEC todavía no incorporó.",
    test: (v) => v.alerts >= 3 || v.row.stale || v.row.api_lag,
  },
  { id: "mine", label: "Mi lista", crit: "Las que marcaste con la estrella. Se guardan en este navegador.", test: (v, mine) => mine.has(v.row.byma) },
];

// ───────────────────────────── Columnas ─────────────────────────────

export type Col = { key: MKey; label: string; fmt: (v: number | null) => string; shade?: "high" | "low"; tip: string };
const x2 = (v: number | null) => num(v);
const times = (v: number | null) => (v == null ? "–" : `${num(v, 2)}x`);

export const COL: Record<MKey, Col> = {
  revenue: { key: "revenue", label: "Ingresos", fmt: money, tip: "Ingresos en USD de la base elegida." },
  net_income: { key: "net_income", label: "Res. neto", fmt: money, tip: "Resultado neto atribuible a los accionistas, en USD." },
  fcf: { key: "fcf", label: "Caja libre", fmt: money, tip: "Flujo operativo menos CAPEX, en USD. No descuenta adquisiciones ni leasing." },
  growth: { key: "growth", label: "Crec. 12m", fmt: pct, shade: "high", tip: "Ingresos TTM contra los 12 meses previos, o ejercicio contra ejercicio. En USD: incluye el efecto cambiario en las convertidas." },
  q_yoy: { key: "q_yoy", label: "Últ. trim. i.a.", fmt: pct, shade: "high", tip: "Ingresos del último trimestre contra el mismo trimestre del año anterior (evita la estacionalidad)." },
  q_eps_yoy: { key: "q_eps_yoy", label: "EPS trim. i.a.", fmt: pct, shade: "high", tip: "EPS diluido del último trimestre contra el mismo trimestre del año anterior. Solo si el EPS previo era positivo." },
  cagr3: { key: "cagr3", label: "CAGR 3a", fmt: pct, shade: "high", tip: "Crecimiento anual compuesto de ingresos en 3 ejercicios. No se calcula si alguna punta es negativa." },
  gross_margin: { key: "gross_margin", label: "Mg. bruto", fmt: pct, shade: "high", tip: "Resultado bruto / ingresos. Algunas empresas no informan costo de ventas y queda vacío." },
  op_margin: { key: "op_margin", label: "Mg. operativo", fmt: pct, shade: "high", tip: "Resultado operativo / ingresos." },
  net_margin: { key: "net_margin", label: "Mg. neto", fmt: pct, shade: "high", tip: "Resultado neto / ingresos. Incluye resultados no operativos." },
  roe: { key: "roe", label: "ROE", fmt: pct, shade: "high", tip: "Resultado neto / patrimonio neto al cierre. Vacío si el PN es negativo o menor al 5% del activo." },
  fcf_margin: { key: "fcf_margin", label: "Mg. caja libre", fmt: pct, shade: "high", tip: "Caja libre / ingresos." },
  fcf_ni: { key: "fcf_ni", label: "Caja libre / RN", fmt: times, shade: "high", tip: "Caja libre sobre resultado neto: cuánto del resultado se convierte en caja. Solo con resultado neto positivo; en el perfil se acota entre -1 y 2,5." },
  de: { key: "de", label: "Deuda/PN", fmt: x2, shade: "low", tip: "Deuda financiera total / patrimonio neto. Con PN negativo se muestra con asterisco y queda fuera del sombreado y del orden." },
  nd_ebitda: {
    key: "nd_ebitda", label: "DN/EBITDA", fmt: times, shade: "low",
    tip: "Deuda neta / EBITDA, con EBITDA = resultado operativo + depreciaciones y amortizaciones informadas. " +
      "Caja neta se muestra 0; con EBITDA negativo no se calcula. La deuda es solo financiera (sin arrendamientos), " +
      "y en IFRS la depreciación del derecho de uso puede no estar incluida. Calculado en la moneda de origen.",
  },
  current_ratio: { key: "current_ratio", label: "Liq. corriente", fmt: x2, shade: "high", tip: "Activo corriente / pasivo corriente." },
  alerts: { key: "alerts", label: "Alertas", fmt: (v) => (v ? String(v) : "–"), tip: "Cantidad de alertas automáticas. El detalle está en la ficha." },
};

export type ViewId = "summary" | "growth" | "profit" | "cash";
export const VIEWS: { id: ViewId; label: string; cols: MKey[] }[] = [
  { id: "summary", label: "Resumen", cols: ["revenue", "growth", "op_margin", "roe", "fcf_margin", "de", "alerts"] },
  { id: "growth", label: "Crecimiento", cols: ["revenue", "growth", "q_yoy", "cagr3", "q_eps_yoy"] },
  { id: "profit", label: "Rentabilidad", cols: ["gross_margin", "op_margin", "net_margin", "roe"] },
  { id: "cash", label: "Caja y balance", cols: ["fcf", "fcf_margin", "fcf_ni", "de", "nd_ebitda", "current_ratio"] },
];

/** Valor para ordenar/sombrear: deuda/PN con PN negativo no participa. */
export const rankable = (v: View, k: MKey) => (k === "de" && v.neg_equity ? null : v[k]);

/** Bloques del comparador. `best` indica qué se marca como mejor. */
export const COMPARE: { title: string; rows: { key: MKey; best?: "high" | "low" }[] }[] = [
  { title: "Tamaño", rows: [{ key: "revenue" }, { key: "net_income" }, { key: "fcf", best: "high" }] },
  { title: "Crecimiento", rows: [{ key: "growth", best: "high" }, { key: "q_yoy", best: "high" }, { key: "cagr3", best: "high" }] },
  {
    title: "Rentabilidad",
    rows: [{ key: "gross_margin", best: "high" }, { key: "op_margin", best: "high" }, { key: "net_margin", best: "high" }, { key: "roe", best: "high" }],
  },
  {
    title: "Caja y balance",
    rows: [
      { key: "fcf_margin", best: "high" }, { key: "fcf_ni", best: "high" }, { key: "de", best: "low" },
      { key: "nd_ebitda", best: "low" }, { key: "current_ratio", best: "high" },
    ],
  },
];
