"use client";

import { useEffect, useRef, useState } from "react";

export type Series = { name: string; values: (number | null)[]; tone: 1 | 2 };

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
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

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
 * Gráfico de una sola escala: barras (1 o 2 series lado a lado) o línea.
 * Nunca doble eje: dos magnitudes distintas van en dos gráficos apilados.
 */
export function Chart({
  labels, series, kind, fmt, axisFmt, height = 170, title,
}: {
  labels: string[]; series: Series[]; kind: "bar" | "line";
  fmt: (v: number | null) => string; axisFmt?: (v: number) => string; height?: number; title: string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const vals = series.flatMap((s) => s.values).filter((v): v is number => v != null);
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
        {series.length > 1 && (
          <span className="legend">
            {series.map((s) => <span key={s.name}><i className={`sw t${s.tone}`} />{s.name}</span>)}
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
        {kind === "bar" && series.map((s, si) => {
          const gap = 2, groupW = Math.min(band * 0.72, 22 * series.length + gap);
          const bw = (groupW - gap * (series.length - 1)) / series.length;
          return s.values.map((v, i) => v == null ? null : (
            <path key={`${si}-${i}`} className={`bar t${s.tone}`}
              d={barPath(cx(i) - groupW / 2 + si * (bw + gap), bw, y(0), y(v))} />
          ));
        })}
        {kind === "line" && series.map((s) => {
          let d = "", pen = false;
          s.values.forEach((v, i) => {
            if (v == null) { pen = false; return; }
            d += `${pen ? "L" : "M"}${cx(i).toFixed(1)},${y(v).toFixed(1)}`;
            pen = true;
          });
          return (
            <g key={s.name}>
              <path d={d} className={`line t${s.tone}`} />
              {hover != null && s.values[hover] != null && (
                <circle cx={cx(hover)} cy={y(s.values[hover]!)} r={4} className={`dot t${s.tone}`} />
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: Math.min(Math.max(cx(hover) - 70, 0), W - 150) }}>
          <strong>{labels[hover]}</strong>
          {series.map((s) => (
            <span key={s.name}>{series.length > 1 && <i className={`sw t${s.tone}`} />}{s.name}: {fmt(s.values[hover] ?? null)}</span>
          ))}
        </div>
      )}
    </figure>
  );
}
