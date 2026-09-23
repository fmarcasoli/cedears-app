"use client";

import { COL, COMPARE, PILLARS, rankable, type Basis, type View } from "@/lib/metrics";
import { PillarBar } from "./profile";
import { useModal } from "./sheet";

export default function Compare({ views, basis, onClose, onOpen }: {
  views: View[]; basis: Basis; onClose: () => void; onOpen: (byma: string) => void;
}) {
  const ref = useModal(onClose);

  const best = (key: (typeof COMPARE)[number]["rows"][number]) => {
    if (!key.best) return null;
    const vals = views.map((v) => rankable(v, key.key)).filter((x): x is number => x != null);
    if (vals.length < 2) return null;
    return key.best === "high" ? Math.max(...vals) : Math.min(...vals);
  };

  return (
    <dialog ref={ref} className="cmp" aria-labelledby="cmp-title">
      <div className="cmp-in">
        <button type="button" className="close" onClick={onClose} aria-label="Cerrar comparador">×</button>
        <h2 id="cmp-title">Comparador</h2>
        <p className="hint">
          Base: {basis === "ttm" ? "últimos 12 meses (o último ejercicio si no hay trimestres)" : "último ejercicio"}.
          En negrita, la mejor de cada fila; ingresos y resultado neto no se marcan porque el tamaño no es mérito.
        </p>
        <div className="tablebox">
          <table>
            <thead>
              <tr>
                <th className="l sticky" scope="col">Métrica</th>
                {views.map((v) => (
                  <th key={v.row.byma} scope="col" className="cmp-co">
                    <button type="button" className="tk" onClick={() => onOpen(v.row.byma)}>{v.row.byma}</button>
                    <span className="sub">{v.row.name}</span>
                    <span className="sub">{v.period}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="group"><td colSpan={views.length + 1}>Perfil (percentil)</td></tr>
              {PILLARS.map((p) => (
                <tr key={p.key}>
                  <td className="l sticky" title={p.tip}>{p.label}</td>
                  {views.map((v) => (
                    <td key={v.row.byma}>{v.profile ? <PillarBar value={v.profile[p.key]} label={p.label} /> : <span className="muted">Financiera</span>}</td>
                  ))}
                </tr>
              ))}
              {COMPARE.map((blk) => (
                <FragmentRows key={blk.title} title={blk.title} span={views.length + 1}>
                  {blk.rows.map((r) => {
                    const b = best(r);
                    const col = COL[r.key];
                    return (
                      <tr key={r.key}>
                        <td className="l sticky" title={col.tip}>{col.label}</td>
                        {views.map((v) => {
                          const x = v[r.key];
                          const neq = r.key === "de" && v.neg_equity && x != null;
                          const isBest = b != null && rankable(v, r.key) === b;
                          return (
                            <td key={v.row.byma} className={neq ? "negeq" : isBest ? "best" : typeof x === "number" && x < 0 ? "neg" : ""}>
                              {col.fmt(x)}{neq ? "*" : ""}{isBest && <span className="sr"> (mejor)</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </FragmentRows>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">* Patrimonio neto negativo: deuda/PN no se compara.</p>
      </div>
    </dialog>
  );
}

function FragmentRows({ title, span, children }: { title: string; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="group"><td colSpan={span}>{title}</td></tr>
      {children}
    </>
  );
}
