import { money, pct } from "./format";
import { COL, PILLARS, type MKey, type View } from "./metrics";

/** Ficha de cada indicador para el panel "Qué son cada uno de los indicadores". */
export type Entry = {
  key: MKey | "profile";
  name: string;
  what: string;      // qué mide
  how: string;       // cómo se calcula
  read: string;      // cómo leerlo
  watch?: string;    // limitaciones
  parts?: { name: string; text: string }[]; // desglose (ej. los cuatro pilares)
  example?: (v: View) => string | null; // cuenta con los números de la empresa elegida
};

const x = (v: number | null, d = 1) => (v == null ? "–" : `${v.toFixed(d)}x`);
const val = (k: MKey) => (v: View) => (v[k] == null ? null : `${COL[k].fmt(v[k])}`);

export const GROUPS: { title: string; entries: Entry[] }[] = [
  {
    title: "Perfil",
    entries: [{
      key: "profile", name: "Perfil por pilares",
      what: "Dónde está la empresa contra el resto del universo en cuatro dimensiones: crecimiento, rentabilidad, solidez y calidad del resultado.",
      how: "Para cada métrica del pilar se calcula el percentil (0 a 100) contra las empresas no financieras; el pilar es el promedio de esos percentiles.",
      parts: PILLARS.map((p) => ({ name: p.label, text: p.tip })),
      read: "80 significa que la empresa supera al 80% del universo en ese pilar. Los pilares no se suman: una empresa puede ser 90 en crecimiento y 10 en solidez.",
      watch: "Es relativo al universo de CEDEARs, no un umbral absoluto. Con menos de la mitad de las métricas, el pilar queda en blanco. Las financieras no tienen perfil.",
      example: (v) => v.profile ? PILLARS.map((p) => `${p.label} ${v.profile![p.key] == null ? "–" : Math.round(v.profile![p.key]!)}`).join(" · ") : "Financiera: sin perfil.",
    }],
  },
  {
    title: "Tamaño",
    entries: [
      {
        key: "mcap", name: "Capitalización bursátil",
        what: "Lo que vale la empresa en bolsa.",
        how: "Precio de la acción × acciones en circulación (todas las clases), en USD. Fuente: Nasdaq, a la fecha de la última actualización.",
        read: "Es la base de todos los múltiplos de valuación.",
        watch: "Es una foto del día de la corrida, no del cierre del balance.",
        example: val("mcap"),
      },
      {
        key: "revenue", name: "Ingresos",
        what: "Ventas del período.",
        how: "TTM: suma de los 4 últimos trimestres. Si no hay trimestres, último ejercicio anual. Convertidos a USD al tipo de cambio promedio.",
        read: "Mide el tamaño del negocio, no su calidad.",
        watch: "En bancos y aseguradoras los “ingresos” no son comparables y no se muestran.",
        example: val("revenue"),
      },
      {
        key: "net_income", name: "Resultado neto",
        what: "Ganancia final atribuible a los accionistas.",
        how: "Tal como lo informa la empresa en el estado de resultados (10-K, 10-Q o 20-F).",
        read: "Incluye resultados no operativos (venta de activos, revaluaciones, impuestos extraordinarios).",
        example: val("net_income"),
      },
      {
        key: "fcf", name: "Caja libre (FCF)",
        what: "Plata que genera el negocio después de invertir en mantenerlo y crecer.",
        how: "Flujo operativo − CAPEX (compra de activo fijo).",
        read: "Positiva y estable es buena señal. Negativa puede ser inversión fuerte o un negocio que consume caja.",
        watch: "No descuenta adquisiciones ni pagos de arrendamientos.",
        example: val("fcf"),
      },
    ],
  },
  {
    title: "Crecimiento",
    entries: [
      { key: "growth", name: "Crecimiento 12 meses", what: "Cuánto crecieron las ventas en el último año.", how: "Ingresos TTM / ingresos de los 12 meses anteriores − 1 (o ejercicio contra ejercicio).", read: "Arriba de 10% es crecimiento fuerte para una empresa grande.", watch: "En USD: en las que reportan en otra moneda incluye el efecto cambiario.", example: val("growth") },
      { key: "q_yoy", name: "Último trimestre interanual", what: "Si el crecimiento se está acelerando o frenando.", how: "Ingresos del último trimestre / mismo trimestre del año anterior − 1.", read: "Comparado con el crecimiento 12 meses: si es mayor, acelera.", watch: "Un solo trimestre puede tener efectos puntuales.", example: val("q_yoy") },
      { key: "cagr3", name: "CAGR 3 años", what: "Crecimiento anual promedio de las ventas en 3 ejercicios.", how: "(Ingresos último ejercicio / ingresos de 3 ejercicios antes)^(1/3) − 1.", read: "Suaviza años buenos y malos.", watch: "No se calcula si alguna punta es negativa.", example: val("cagr3") },
      { key: "q_eps_yoy", name: "EPS trimestral interanual", what: "Crecimiento de la ganancia por acción.", how: "EPS diluido del último trimestre / mismo trimestre del año anterior − 1.", read: "Si crece más que las ventas, mejoran márgenes o hay recompras.", watch: "Solo si el EPS anterior era positivo.", example: val("q_eps_yoy") },
      { key: "eps_ttm_yoy", name: "EPS 12 meses interanual", what: "Cuánto creció la ganancia por acción del último año contra el año anterior.", how: "Suma del EPS diluido de los 4 últimos trimestres / suma de los 4 anteriores − 1 (Investing: “BPA TTM vs TTM 1 año atrás”).", read: "Menos ruidoso que comparar un solo trimestre.", watch: "Solo si el EPS de los 12 meses anteriores era positivo.", example: val("eps_ttm_yoy") },
      { key: "rev_cagr5", name: "Crecimiento de ventas 5 años", what: "Crecimiento anual promedio de las ventas en 5 ejercicios.", how: "(Ingresos del último ejercicio / ingresos de 5 ejercicios antes)^(1/5) − 1, en moneda de origen.", read: "Muestra la tendencia de fondo, más allá de un año puntual.", watch: "No se calcula si alguna punta es negativa o faltan ejercicios.", example: val("rev_cagr5") },
      { key: "eps_cagr5", name: "Crecimiento del EPS 5 años", what: "Crecimiento anual promedio de la ganancia por acción en 5 ejercicios.", how: "(EPS diluido del último ejercicio / EPS de 5 ejercicios antes)^(1/5) − 1. EPS ajustado por splits.", read: "Si crece más que las ventas, mejoraron los márgenes o hubo recompras.", watch: "No se calcula si alguna punta es negativa.", example: val("eps_cagr5") },
    ],
  },
  {
    title: "Rentabilidad",
    entries: [
      { key: "gross_margin", name: "Margen bruto", what: "Cuánto queda de cada dólar vendido después del costo directo.", how: "Resultado bruto / ingresos.", read: "Alto (más de 50%) suele indicar marca, tecnología o poder de precio.", watch: "Algunas empresas no informan costo de ventas y queda vacío.", example: val("gross_margin") },
      { key: "op_margin", name: "Margen operativo", what: "Rentabilidad del negocio antes de intereses e impuestos.", how: "Resultado operativo / ingresos.", read: "Es el mejor margen para comparar negocios entre sí.", example: val("op_margin") },
      { key: "pretax_margin", name: "Margen antes de impuestos", what: "Rentabilidad después de intereses y resultados no operativos, antes del impuesto a las ganancias.", how: "Resultado antes de impuestos / ingresos.", read: "Si es mucho mayor que el operativo, hay ganancias financieras o no operativas (ej. revaluación de inversiones).", example: val("pretax_margin") },
      { key: "net_margin", name: "Margen neto", what: "Cuánto queda de ganancia final por cada dólar vendido.", how: "Resultado neto / ingresos.", read: "Si supera mucho al operativo, hay ganancias no operativas.", example: val("net_margin") },
      { key: "roe", name: "ROE", what: "Rentabilidad sobre el capital de los accionistas.", how: "Resultado neto / patrimonio neto promedio (el del inicio y el del cierre del período, igual que Investing).", read: "Arriba de 15% es bueno. En la ficha, “De dónde sale el ROE” lo abre en margen × rotación × apalancamiento.", watch: "Vacío si el PN es negativo o menor al 5% del activo (recompras masivas lo inflan).", example: val("roe") },
    ],
  },
  {
    title: "Caja y balance",
    entries: [
      { key: "fcf_margin", name: "Margen de caja libre", what: "Cuánta caja libre genera cada dólar vendido.", how: "Caja libre / ingresos.", read: "Compararlo con el margen neto: si es menor, parte de la ganancia no se cobra.", example: val("fcf_margin") },
      { key: "fcf_ni", name: "Caja libre / resultado neto", what: "Qué parte de la ganancia contable se convierte en caja.", how: "Caja libre / resultado neto.", read: "Cerca de 1x o más es sano; muy por debajo de 0,8x merece mirarse.", watch: "Solo con resultado positivo. En el perfil se acota entre -1 y 2,5.", example: (v) => v.fcf_ni == null ? null : `${money(v.fcf)} / ${money(v.net_income)} = ${x(v.fcf_ni, 2)}` },
      { key: "de", name: "Deuda / PN", what: "Cuánta deuda financiera tiene por cada dólar de patrimonio.", how: "(Deuda de largo plazo + porción corriente + deuda de corto plazo + arrendamientos operativos y financieros) / patrimonio neto. Incluye arrendamientos como Investing y S&P desde 2019 (ASC 842 / NIIF 16).", read: "Menos es mejor. Arriba de 2 es apalancamiento alto para una industrial.", watch: "Con PN negativo se muestra con asterisco y no entra en rankings.", example: val("de") },
      { key: "nd_ebitda", name: "Deuda neta / EBITDA", what: "En cuántos años de EBITDA se pagaría la deuda neta.", how: "(Deuda financiera + arrendamientos − caja) / (resultado operativo + depreciaciones y amortizaciones). Calculado en la moneda de origen.", read: "Menos de 2x es cómodo; más de 4x es exigente. Caja neta se muestra 0.", watch: "Con EBITDA negativo no se calcula. La deuda incluye arrendamientos; el EBITDA, la amortización de esos activos.", example: val("nd_ebitda") },
      { key: "current_ratio", name: "Liquidez corriente", what: "Capacidad de pagar las deudas del próximo año con activos del próximo año.", how: "Activo corriente / pasivo corriente.", read: "Arriba de 1 cubre; debajo de 1 depende de refinanciar o de generar caja.", watch: "Empresas con cobro contado (supermercados, restaurantes) viven bien debajo de 1.", example: val("current_ratio") },
      { key: "quick_ratio", name: "Test ácido", what: "Liquidez sin contar inventarios, que pueden tardar en venderse.", how: "(Caja + inversiones de corto plazo + cuentas a cobrar) / pasivo corriente.", read: "Arriba de 1 cubre las deudas del año sin vender stock.", watch: "Las cuentas a cobrar salen del balance tal como las etiqueta la empresa en la SEC; Investing a veces las reclasifica con las notas (en AMZN da 0,84 contra 0,87).", example: val("quick_ratio") },
    ],
  },
  {
    title: "Valuación",
    entries: [
      {
        key: "pe", name: "PER (precio / ganancias)",
        what: "Cuántos años de ganancias actuales está pagando el mercado.",
        how: "Precio de la acción / EPS diluido de la base elegida (TTM = suma de los 4 últimos trimestres), igual que Investing. En los ADRs el precio es por ADR y el EPS por acción ordinaria, así que se usa capitalización / resultado neto.",
        read: "Más bajo = más barato respecto de sus ganancias. Hay que compararlo con el crecimiento y con empresas del mismo sector.",
        watch: "Sin dato si hay pérdida. Un resultado inflado por algo no operativo lo hace parecer barato.",
        example: (v) => {
          if (v.pe == null) return null;
          const eps = v.row.ttm_end && v.period.startsWith("TTM") ? v.row.t_eps : v.row.eps;
          return v.row.per_share_ok && v.row.price && eps
            ? `US$ ${v.row.price.toFixed(2)} / EPS ${eps.toFixed(2)} = ${x(v.pe, 2)}`
            : `${money(v.mcap)} / ${money(v.net_income)} = ${x(v.pe)} (ADR: capitalización / resultado neto)`;
        },
      },
      {
        key: "peg", name: "Relación PEG",
        what: "El PER ajustado por crecimiento: si lo que se paga está justificado por cuánto crece.",
        how: "PER / crecimiento anual compuesto del resultado neto en 3 ejercicios (en puntos, ej. 15% → 15). El crecimiento se mide en la moneda de origen.",
        read: "Cerca de 1 se considera razonable; debajo de 1, crecimiento barato; arriba de 2, caro para lo que crece.",
        watch: "Usa crecimiento histórico, no proyectado (los sitios financieros suelen usar estimaciones de analistas, por eso el número puede diferir). Sin dato si el resultado cayó.",
        example: (v) => v.peg == null ? null : `${x(v.pe)} / ${(v.row.ni_cagr3! * 100).toFixed(1)} = ${v.peg.toFixed(2)}`,
      },
      {
        key: "pb", name: "Precio / valor libro",
        what: "Cuánto paga el mercado por cada dólar de patrimonio contable.",
        how: "Capitalización bursátil / patrimonio neto (del último balance de la base elegida).",
        read: "Es el múltiplo clave en bancos y aseguradoras. En empresas de tecnología o marcas suele ser alto porque el valor está en intangibles que el balance no registra.",
        watch: "Sin dato con PN negativo (recompras acumuladas).",
        example: (v) => v.pb == null ? null : `${money(v.mcap)} / patrimonio = ${x(v.pb)}`,
      },
      {
        key: "ps", name: "Precio / ventas últimos 12 meses",
        what: "Cuánto paga el mercado por cada dólar de ventas.",
        how: "Capitalización bursátil / ingresos TTM (o del último ejercicio si no hay trimestres).",
        read: "Útil cuando no hay ganancias. Hay que leerlo con el margen: un P/Ventas de 10x con margen neto de 40% equivale a un PER de 25x.",
        watch: "No aplica a financieras.",
        example: (v) => v.ps == null ? null : `${money(v.mcap)} / ${money(v.revenue)} = ${x(v.ps)}` + (v.net_margin != null ? ` (con margen neto de ${pct(v.net_margin)})` : ""),
      },
      {
        key: "pcf", name: "Precio / flujo de caja",
        what: "Cuánto paga el mercado por cada dólar de caja que genera la operación.",
        how: "Capitalización bursátil / flujo operativo de la base elegida.",
        read: "Más estable que el PER porque la caja depende menos de criterios contables. Útil en empresas que invierten fuerte (el PER castiga la amortización).",
        watch: "Sin dato con flujo operativo negativo. No descuenta el CAPEX: para eso mirar la caja libre.",
        example: (v) => v.pcf == null ? null : `${money(v.mcap)} / flujo operativo = ${x(v.pcf)}`,
      },
    ],
  },
  {
    title: "Eficiencia",
    entries: [
      { key: "asset_turnover", name: "Rotación de activos", what: "Cuántos dólares vende por cada dólar de activo.", how: "Ingresos / activo promedio (inicio y cierre del período).", read: "Alta en comercio y servicios; baja en empresas intensivas en capital (energía, telecomunicaciones). Compararla dentro del sector.", example: val("asset_turnover") },
      { key: "inv_turnover", name: "Rotación de inventario", what: "Cuántas veces por año se vende y repone el stock.", how: "Costo de ventas / inventario promedio.", read: "Más alta = el stock se vende rápido y ata menos capital. 365 / rotación = días de inventario.", watch: "Vacío en empresas sin inventario (software, servicios).", example: val("inv_turnover") },
      { key: "ar_turnover", name: "Rotación de cuentas a cobrar", what: "Cuántas veces por año se cobra la cartera de clientes.", how: "Ingresos / cuentas a cobrar promedio.", read: "Más alta = cobra más rápido. 365 / rotación = días de cobranza.", watch: "Usa las cuentas a cobrar tal como las etiqueta la empresa en la SEC (en AMZN incluyen otros créditos: 10,7 contra 13,1 de Investing).", example: val("ar_turnover") },
    ],
  },
  {
    title: "Promedios de 5 años",
    entries: [
      { key: "gm5", name: "Margen bruto 5 años", what: "Margen bruto típico de la empresa, sin el ruido de un solo año.", how: "Promedio simple del margen bruto de los últimos 5 ejercicios (Investing: “5YA”).", read: "Si el margen actual está arriba del promedio, la empresa está en un buen momento o mejoró estructuralmente.", example: val("gm5") },
      { key: "om5", name: "Margen operativo 5 años", what: "Margen operativo típico de los últimos 5 años.", how: "Promedio simple del margen operativo de los últimos 5 ejercicios.", read: "Compararlo con el margen actual para ver si el negocio mejoró o empeoró.", watch: "Usa el resultado operativo oficial; Investing excluye extraordinarios y puede diferir un poco.", example: val("om5") },
      { key: "ptm5", name: "Margen antes de impuestos 5 años", what: "Margen antes de impuestos típico de los últimos 5 años.", how: "Promedio simple del margen antes de impuestos de los últimos 5 ejercicios.", read: "Suaviza años con ganancias o pérdidas financieras extraordinarias.", example: val("ptm5") },
      { key: "nm5", name: "Margen neto 5 años", what: "Margen neto típico de los últimos 5 años.", how: "Promedio simple del margen neto de los últimos 5 ejercicios.", read: "Útil para empresas cíclicas: un solo año puede engañar.", example: val("nm5") },
      { key: "capex_cagr5", name: "Crecimiento del CAPEX 5 años", what: "Cuánto aumentó la inversión en activo fijo.", how: "(CAPEX del último ejercicio / CAPEX de 5 ejercicios antes)^(1/5) − 1.", read: "No es bueno ni malo en sí: un CAPEX que crece mucho más que las ventas anticipa capacidad nueva, pero presiona la caja libre.", example: val("capex_cagr5") },
    ],
  },
  {
    title: "Control",
    entries: [{
      key: "alerts", name: "Alertas",
      what: "Avisos automáticos de cosas para revisar antes de confiar en los números.",
      how: "Se generan en la actualización diaria comparando el último ejercicio y trimestre con el anterior: caídas de márgenes, ROE o ingresos, caja libre baja frente al resultado, liquidez menor a 1, suba de deuda/PN, dilución, splits, PN negativo, moneda de alta inflación, trimestres que no suman al anual, resultado no operativo alto, balance nuevo que la SEC todavía no publicó en XBRL y ejercicios de más de 15 meses.",
      read: "No son señales de venta: marcan dónde mirar el filing. El detalle está en la ficha, pestaña Alertas.",
      example: (v) => `${v.alerts} alerta${v.alerts === 1 ? "" : "s"}`,
    }],
  },
];
