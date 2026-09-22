import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, getScreener } from "@/lib/data";
import { money, num, pct } from "@/lib/format";

export async function generateStaticParams() {
  const { rows } = await getScreener();
  return rows.map((r) => ({ byma: r.byma }));
}

type Params = { params: Promise<{ byma: string }> };

export async function generateMetadata({ params }: Params) {
  const { byma } = await params;
  return { title: `${decodeURIComponent(byma)}: fundamentals` };
}

function Spark({ label, values, fmt }: { label: string; values: (number | null)[]; fmt: (v: number | null) => string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  const last = values[values.length - 1] ?? null;
  if (pts.length < 2) return null;
  const ys = pts.map((p) => p[1]);
  const min = Math.min(...ys, 0), max = Math.max(...ys);
  const W = 300, H = 56, n = values.length - 1 || 1;
  const x = (i: number) => (i / n) * W;
  const y = (v: number) => H - 4 - ((v - min) / (max - min || 1)) * (H - 8);
  const d = pts.map((p, j) => `${j ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  return (
    <figure className="spark" style={{ margin: 0 }}>
      <figcaption><span>{label}</span><strong>{fmt(last)}</strong></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}: evolución`}>
        {min < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" />}
        <path d={d} fill="none" stroke="var(--celeste)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  );
}

const ROWS: ([string] | [string, string, (v: number | null) => string])[] = [
  ["Resultados"],
  ["Ingresos", "revenue", money], ["Crecimiento en USD", "rev_growth", pct],
  ["Resultado bruto", "gross_profit", money], ["Resultado operativo", "operating_income", money],
  ["Resultado neto", "net_income", money], ["EPS diluido", "eps_diluted", (v) => num(v)],
  ["Flujo de fondos"],
  ["Flujo operativo", "ocf", money], ["CAPEX", "capex", money], ["FCF", "fcf", money],
  ["FCF / resultado neto", "fcf_conversion", (v) => num(v)],
  ["Dividendos pagados", "dividends", money], ["Recompras", "buybacks", money],
  ["Balance"],
  ["Activo", "assets", money], ["Patrimonio neto", "equity", money], ["Caja", "cash", money],
  ["Deuda total", "total_debt", money], ["Deuda neta", "net_debt", money],
  ["Acciones diluidas", "shares", money],
  ["Ratios"],
  ["Margen bruto", "gross_margin", pct], ["Margen operativo", "op_margin", pct],
  ["Margen neto", "net_margin", pct], ["Margen FCF", "fcf_margin", pct],
  ["ROE", "roe", pct], ["ROA", "roa", pct],
  ["Deuda / PN", "debt_equity", (v) => num(v)], ["Liquidez corriente", "current_ratio", (v) => num(v)],
];

export default async function CompanyPage({ params }: Params) {
  const { byma } = await params;
  const c = await getCompany(decodeURIComponent(byma));
  if (!c) notFound();
  const R = c.rows;
  const rc = c.reported_currency;
  const last = R[R.length - 1];
  const L = (k: string) => (last ? ((last[k] as number | null) ?? null) : null);
  const T = c.ttm;
  const K = (k: string) => (T ? ((T[k] as number | null) ?? null) : L(k));
  const Q = (c.quarters || []).slice(-8);
  const qLabel = (end: string) => `${["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][Number(end.slice(5, 7)) - 1]}-${end.slice(2, 4)}`;
  const QROWS: ([string] | [string, string, (v: number | null) => string])[] = [
    ["Resultados del trimestre"],
    ["Ingresos", "revenue", money],
    ["Interanual (USD)", "rev_yoy", pct],
    ...(c.converted ? [[`Interanual (${c.reported_currency})`, "rev_yoy_local", pct] as [string, string, (v: number | null) => string]] : []),
    ["Resultado operativo", "operating_income", money], ["Margen operativo", "op_margin", pct],
    ["Resultado neto", "net_income", money], ["Margen neto", "net_margin", pct],
    ["EPS diluido", "eps_diluted", (v) => num(v)], ["EPS interanual", "eps_yoy", pct],
    ["Flujo de fondos del trimestre"],
    ["Flujo operativo", "ocf", money], ["CAPEX", "capex", money], ["FCF", "fcf", money],
    ["Balance al cierre"],
    ["Caja", "cash", money], ["Deuda total", "total_debt", money], ["Patrimonio neto", "equity", money],
  ];
  const rows = c.converted
    ? [
        ...ROWS.slice(0, 3),
        [`Crecimiento en ${rc}`, "rev_growth_local", pct] as [string, string, (v: number | null) => string],
        ...ROWS.slice(3),
        ["Tipo de cambio"] as [string],
        [`USD por ${rc} (promedio)`, "fx_avg", (v: number | null) => (v == null ? "–" : v < 0.01 ? v.toPrecision(3) : v.toFixed(4))] as [string, string, (v: number | null) => string],
        [`USD por ${rc} (cierre)`, "fx_close", (v: number | null) => (v == null ? "–" : v < 0.01 ? v.toPrecision(3) : v.toFixed(4))] as [string, string, (v: number | null) => string],
      ]
    : ROWS;
  const series = (k: string) => R.map((r) => (r[k] as number | null) ?? null);
  const cur = c.currency !== "USD" ? ` ${c.currency}` : "";

  return (
    <main className="wrap co">
      <Link className="back" href="/">Volver al listado</Link>
      <h1>{c.byma} <span style={{ fontWeight: 400, color: "var(--muted)" }}>{c.name}</span></h1>
      <p className="id">
        {c.ticker !== c.byma && <>Ticker en EE.UU.: {c.ticker}. </>}
        {c.sector && <>{c.sector}. </>}
        Último cierre {last?.fiscal_end ?? "–"}, presentado el {c.last_filed || "–"}.
        {c.ratio && <> Ratio CEDEAR {c.ratio}.</>}
      </p>

      {c.converted && (
        <aside className="fxnote">
          <p>
            {c.name} presenta sus estados ante la SEC en {rc}, no en dólares. Los montos de esta página
            están convertidos a USD: resultados, flujos y EPS al tipo de cambio promedio de cada ejercicio;
            activos, pasivos y patrimonio al tipo de cambio de cierre.
          </p>
          <p>
            Fuente del tipo de cambio: {c.fx_source}. Los ratios (márgenes, ROE, deuda/PN) se calculan en {rc}.
            El crecimiento en USD incluye el efecto cambiario; el crecimiento en {rc} figura en la tabla.
            El EPS es por acción ordinaria, no por ADR.
          </p>
        </aside>
      )}

      <p className="basis">
        {T ? <>Últimos 12 meses al {T.end} (suma de los 4 trimestres más recientes)</> :
          <>Ejercicio anual al {last?.fiscal_end ?? "–"} (la empresa no presenta trimestres en XBRL)</>}
      </p>
      <dl className="facts">
        <div><dt>Ingresos{cur}</dt><dd>{money(K("revenue"))}</dd></div>
        <div><dt>Resultado neto{cur}</dt><dd>{money(K("net_income"))}</dd></div>
        <div><dt>FCF{cur}</dt><dd>{money(K("fcf"))}</dd></div>
        <div><dt>Margen operativo</dt><dd>{pct(K("op_margin"))}</dd></div>
        <div><dt>ROE</dt><dd>{pct(K("roe"))}</dd></div>
        <div><dt>Deuda / PN</dt><dd>{num(K("debt_equity"))}</dd></div>
      </dl>

      {(c.alerts.length > 0 || c.missing.length > 0) && (
        <section className="watch">
          <h2>Para revisar</h2>
          <ul>
            {c.alerts.map((a) => <li key={a}>{a}</li>)}
            {c.missing.map((m) => <li key={m}>Sin dato mapeado para {m}: verificar en el filing.</li>)}
          </ul>
        </section>
      )}

      <section className="trends" aria-label="Tendencias">
        <Spark label="Ingresos" values={series("revenue")} fmt={money} />
        <Spark label="Margen operativo" values={series("op_margin")} fmt={pct} />
        <Spark label="FCF" values={series("fcf")} fmt={money} />
        <Spark label="ROE" values={series("roe")} fmt={pct} />
      </section>

      {Q.length > 0 && (
        <section className="sec">
          <h2>Trimestres ({c.currency})</h2>
          <div className="tablebox">
            <table>
              <thead>
                <tr>
                  <th className="l sticky">Concepto</th>
                  {Q.map((r) => <th key={r.end}>{qLabel(r.end)}</th>)}
                </tr>
              </thead>
              <tbody>
                {QROWS.map((d) =>
                  d.length === 1 ? (
                    <tr key={d[0]} className="group"><td colSpan={Q.length + 1}>{d[0]}</td></tr>
                  ) : (
                    <tr key={d[1]}>
                      <td className="l sticky">{d[0]}</td>
                      {Q.map((r) => {
                        const v = (r[d[1]] as number | null) ?? null;
                        return <td key={r.end} className={v != null && v < 0 ? "neg" : ""}>{d[2](v)}</td>;
                      })}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <p className="note">
            Columnas por fecha de cierre del trimestre fiscal. El cuarto trimestre no se presenta por
            separado: se calcula como el anual (10-K) menos los 9 meses acumulados. El flujo de fondos
            se obtiene restando acumulados, porque los 10-Q solo lo informan desde el inicio del ejercicio.
            Las comparaciones son interanuales para evitar la estacionalidad.
          </p>
        </section>
      )}

      <section className="sec">
        <h2>Serie anual ({c.currency})</h2>
        <div className="tablebox">
          <table>
            <thead>
              <tr>
                <th className="l sticky">Concepto</th>
                {R.map((r) => <th key={r.year}>FY{r.year}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) =>
                d.length === 1 ? (
                  <tr key={d[0]} className="group"><td colSpan={R.length + 1}>{d[0]}</td></tr>
                ) : (
                  <tr key={d[1]}>
                    <td className="l sticky">{d[0]}</td>
                    {R.map((r) => {
                      const v = (r[d[1]] as number | null) ?? null;
                      return <td key={r.year} className={v != null && v < 0 ? "neg" : ""}>{d[2](v)}</td>;
                    })}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <details>
        <summary>Conceptos XBRL usados</summary>
        <ul>
          {Object.entries(c.concepts_used).map(([k, v]) => (
            <li key={k}><code>{k}</code>: {v.length ? v.join(", ") : "sin dato"}</li>
          ))}
        </ul>
      </details>
    </main>
  );
}
