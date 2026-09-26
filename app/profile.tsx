import { PILLARS, type Profile } from "@/lib/metrics";

/** Barra corta de un pilar: puntaje 0-100 contra su industria (50 = igual), número al lado. */
export function PillarBar({ value, label }: { value: number | null; label: string }) {
  if (value == null)
    return <span className="pbar empty" title={`${label}: faltan más de la mitad de sus métricas`}>–</span>;
  const v = Math.round(value);
  return (
    <span className="pbar" title={`${label}: ${v} (50 = igual que su industria)`} role="img" aria-label={`${label}: ${v} sobre 100`}>
      <span className="track"><span className="fill" style={{ width: `${Math.max(v, 2)}%` }} /></span>
      <span className="pv">{v}</span>
    </span>
  );
}

export function ProfileBig({ profile }: { profile: Profile | null }) {
  if (!profile)
    return (
      <p className="finnote">
        Financiera: bancos, aseguradoras y brokers no tienen perfil por pilares porque márgenes, liquidez y
        deuda/PN no son comparables con el resto.
      </p>
    );
  return (
    <div className="profile">
      {PILLARS.map((p) => {
        const v = profile[p.key];
        return (
          <div key={p.key} className="prow" title={p.tip}>
            <span className="plabel">{p.label}</span>
            <span className="track big">
              {v != null && <span className="fill" style={{ width: `${Math.max(Math.round(v), 2)}%` }} />}
            </span>
            <span className="pv">{v == null ? "–" : Math.round(v)}</span>
          </div>
        );
      })}
      <p className="note">
        50 = igual que su industria real (Damodaran); 100 = el doble de buena o más; 0 = el doble de mala o peor.
        {PILLARS.some((p) => profile[p.key] == null) && " Guion: el pilar no tiene al menos la mitad de sus métricas."}
      </p>
    </div>
  );
}
