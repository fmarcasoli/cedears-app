import { getRows } from "@/lib/data";
import Screener from "./screener";

export default async function Home() {
  const { meta, rows } = await getRows();
  const when = new Date(meta.generated).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Cordoba", dateStyle: "medium", timeStyle: "short",
  });
  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Fundamentals de CEDEARs</h1>
          <p>
            Estados contables presentados ante la SEC, en base a los últimos 12 meses (suma de los
            4 trimestres más recientes) o al último ejercicio anual. Cada empresa tiene un perfil de
            cuatro pilares, sin puntaje único. Tocá el código para abrir la ficha.
          </p>
        </div>
        <div className="fresh">
          Datos actualizados el {when}
          <br />
          {meta.ok} de {meta.total_cedears} CEDEARs con fundamentals
        </div>
      </header>
      <Screener rows={rows} />
      <p className="note">
        Sin fundamentals en esta fuente ({meta.without_sec.length}): ETFs, acciones que cotizan en Brasil
        y emisores que no reportan a la SEC. Todos los montos están en USD: las empresas que presentan sus
        estados en otra moneda ante la SEC se convierten con el tipo de cambio promedio del ejercicio
        (resultados y flujos) y el de cierre (balance). Los ratios se calculan en la moneda original.
      </p>
    </main>
  );
}
