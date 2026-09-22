export const money = (v: number | null | undefined) => {
  if (v == null) return "–";
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + " T";
  if (a >= 1e9) return (v / 1e9).toFixed(1) + " B";
  if (a >= 1e6) return (v / 1e6).toFixed(0) + " M";
  return v.toFixed(0);
};
export const pct = (v: number | null | undefined) =>
  v == null ? "–" : (v * 100).toFixed(1) + "%";
export const num = (v: number | null | undefined, d = 2) =>
  v == null ? "–" : v.toFixed(d);
