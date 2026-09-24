"use client";

import { useState } from "react";
import { GROUPS } from "@/lib/glossary";
import type { View } from "@/lib/metrics";

/** Panel "Qué son cada uno de los indicadores": qué mide, cómo se calcula, cómo leerlo
 *  y la cuenta hecha con los números de una empresa a elección. */
export default function Glossary({ views, initial, basisLabel }: { views: View[]; initial: string | null; basisLabel: string }) {
  const [pick, setPick] = useState<string | null>(initial);
  const ex = views.find((v) => v.row.byma === pick) ?? views[0] ?? null;

  return (
    <section className="gloss" id="indicadores" aria-label="Qué son cada uno de los indicadores">
      <div className="gloss-h">
        <label>
          Ejemplo con{" "}
          <select value={ex?.row.byma ?? ""} onChange={(e) => setPick(e.target.value)}>
            {views.map((v) => <option key={v.row.byma} value={v.row.byma}>{v.row.byma}: {v.row.name}</option>)}
          </select>
        </label>
        {ex && <span className="muted">{ex.period}. Base: {basisLabel}.</span>}
      </div>
      {GROUPS.map((g) => (
        <div key={g.title} className="gloss-g">
          <h3>{g.title}</h3>
          <div className="gloss-grid">
            {g.entries.map((e) => {
              const sample = ex && e.example ? e.example(ex) : null;
              return (
                <article key={e.key} className="gloss-card">
                  <h4>{e.name}</h4>
                  <p>{e.what}</p>
                  {e.parts && (
                    <ul className="gloss-parts">
                      {e.parts.map((p) => <li key={p.name}><strong>{p.name}</strong>{p.text}</li>)}
                    </ul>
                  )}
                  <dl>
                    <dt>Cómo se calcula</dt><dd>{e.how}</dd>
                    <dt>Cómo leerlo</dt><dd>{e.read}</dd>
                    {e.watch && <><dt>Ojo</dt><dd>{e.watch}</dd></>}
                    {ex && e.example && (
                      <><dt>{ex.row.byma}</dt><dd className="sample">{sample ?? "Sin dato para esta empresa."}</dd></>
                    )}
                  </dl>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
