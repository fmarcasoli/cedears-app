"use client";

import { useEffect, useRef, useState } from "react";

/** tone: color de la paleta (1-2 azules, 3 gris, 4 línea); color: override (categorías, ej. segmentos). */
export type Series = { name: string; values: (number | null)[]; tone: 1 | 2 | 3 | 4; color?: string };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  // de la primera marca <= mínimo a la primera >= máximo: las barras nunca se salen del área
  const top = Math.ceil(max / step - 1e-9) * step;
  for (let v = Math.floor(min / step + 1e-9) * step; v <= top + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

const TIP_W = 180; // ancho del cartel (mismo valor que .tip en globals.css)

/** Path de una barra con las puntas de dato redondeadas (4px) y la base recta. */
function barPath(x: number, w: number, y0: number, y1: number) {
  const h = Math.abs(y1 - y0);
  const r = Math.min(4, w / 2, h);
  if (h < 0.5) return "";
  if (y1 < y0) // positiva: punta arriba
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

/**
 * Gráfico de una sola escala: barras (series lado a lado, o apiladas con `stacked`) o línea.
 * `overlay` suma líneas en la MISMA escala (ej. caja libre sobre sus componentes).
 * Nunca doble eje: dos magnitudes distintas van en dos gráficos apilados.
 */
export function Chart({
  labels, series, kind, fmt, axisFmt, height = 170, title, stacked = false, overlay = [], showValues = false,
}: {
  labels: string[]; series: Series[]; kind: "bar" | "line";
  fmt: (v: number | null) => string; axisFmt?: (v: number) => string; height?: number; title: string;
  stacked?: boolean; overlay?: Series[]; showValues?: boolean;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const lineSeries = kind === "line" ? series : overlay;
  const barSeries = kind === "bar" ? series : [];
  // en barras apiladas la escala sale de las sumas de positivos y de negativos de cada período
  const stackTotals = stacked ? labels.flatMap((_, i) => {
    const vs = barSeries.map((s) => s.values[i] ?? 0);
    return [vs.filter((v) => v > 0).reduce((a, b) => a + b, 0), vs.filter((v) => v < 0).reduce((a, b) => a + b, 0)];
  }) : [];
  const vals = [...(stacked ? stackTotals : barSeries.flatMap((s) => s.values)), ...lineSeries.flatMap((s) => s.values)]
    .filter((v): v is number => v != null);
  if (!n || !vals.length) return <p className="hint">Sin datos para {title.toLowerCase()}.</p>;

  const padL = 48, padR = 8, padT = 10, padB = 22;
  const H = height;
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const ticks = niceTicks(lo, hi);
  const y0v = ticks[0], y1v = ticks[ticks.length - 1];
  const iw = W - padL - padR, ih = H - padT - padB;
  const y = (v: number) => padT + ih - ((v - y0v) / (y1v - y0v || 1)) * ih;
  const band = iw / n;
  const cx = (i: number) => padL + band * i + band / 2;
  const af = axisFmt ?? ((v: number) => fmt(v));
  const every = Math.ceil(n / Math.max(1, Math.floor(iw / 46)));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - box.left - padL) / band);
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <figure className="chart" ref={ref}>
      <figcaption>
        <span className="ctitle">{title}</span>
        {series.length + overlay.length > 1 && (
          <span className="legend">
            {[...series, ...overlay].map((s) => <span key={s.name}><i className={`sw t${s.tone}`} style={s.color ? { background: s.color } : undefined} />{s.name}</span>)}
          </span>
        )}
      </figcaption>
      <svg width={W} height={H} role="img" aria-label={title} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? "zero" : "gridl"} />
            <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" className="axis">{af(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (n - 1 - i) % every === 0 && (
          <text key={l + i} x={cx(i)} y={H - 6} textAnchor="middle" className="axis">{l}</text>
        ))}
        {hover != null && <rect x={padL + band * hover} y={padT} width={band} height={ih} className="hoverband" />}
        {stacked && labels.map((_, i) => {
          const bw = Math.min(band * 0.62, 26);
          let up = 0, down = 0;
          return barSeries.map((s, si) => {
            const v = s.values[i];
            if (v == null || v === 0) return null;
            const base = v > 0 ? up : down;
            if (v > 0) up += v; else down += v;
            return <path key={`${si}-${i}`} className={`bar t${s.tone}`} style={s.color ? { fill: s.color } : undefined}
              d={barPath(cx(i) - bw / 2, bw, y(base), y(base + v))} />;
          });
        })}
        {kind === "bar" && !stacked && series.map((s, si) => {
          const gap = 2, groupW = Math.min(band * 0.72, 22 * series.length + gap);
          const bw = (groupW - gap * (series.length - 1)) / series.length;
          return s.values.map((v, i) => v == null ? null : (
            <path key={`${si}-${i}`} className={`bar t${s.tone}`}
              d={barPath(cx(i) - groupW / 2 + si * (bw + gap), bw, y(0), y(v))} />
          ));
        })}
        {lineSeries.map((s) => {
          let d = "", pen = false;
          s.values.forEach((v, i) => {
            if (v == null) { pen = false; return; }
            d += `${pen ? "L" : "M"}${cx(i).toFixed(1)},${y(v).toFixed(1)}`;
            pen = true;
          });
          return (
            <g key={s.name}>
              <path d={d} className={`line t${s.tone}`} />
              {showValues && s.values.map((v, i) => v == null || (n - 1 - i) % Math.ceil(34 / band) ? null : (
                <text key={i} x={cx(i)} y={y(v) - 8} textAnchor="middle" className="val">{fmt(v)}</text>
              ))}
              {kind === "bar" && s.values.map((v, i) => v == null ? null : (
                <circle key={`m${i}`} cx={cx(i)} cy={y(v)} r={2.5} className={`dot t${s.tone}`} />
              ))}
              {hover != null && s.values[hover] != null && (
                <circle cx={cx(hover)} cy={y(s.values[hover]!)} r={4} className={`dot t${s.tone}`} />
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        // al costado de la columna (a la derecha, o a la izquierda si no entra): nunca tapa lo que se mira
        <div className="tip" style={{
          left: cx(hover) + band / 2 + 8 + TIP_W <= W ? cx(hover) + band / 2 + 8 : Math.max(0, cx(hover) - band / 2 - 8 - TIP_W),
        }}>
          <strong>{labels[hover]}</strong>
          {[...series, ...(kind === "bar" ? overlay : [])].map((s) => (
            <span key={s.name}>{series.length + overlay.length > 1 && <i className={`sw t${s.tone}`} style={s.color ? { background: s.color } : undefined} />}{s.name}: {fmt(s.values[hover] ?? null)}</span>
          ))}
        </div>
      )}
    </figure>
  );
}
