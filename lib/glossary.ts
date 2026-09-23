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
      how: "Para cada métrica del pilar se calcula el percentil (0 a 100) contra las empresas no financieras; el pilar es el promedio de esos percentiles. " +
        PILLARS.map((p) => `${p.label}: ${p.tip.charAt(0).toLowerCase()}${p.tip.slice(1)}`).join(" "),
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
    ],
  },
  {
    title: "Rentabilidad",
    entries: [
      { key: "gross_margin", name: "Margen bruto", what: "Cuánto queda de cada dólar vendido después del costo directo.", how: "Resultado bruto / ingresos.", read: "Alto (más de 50%) suele indicar marca, tecnología o poder de precio.", watch: "Algunas empresas no informan costo de ventas y queda vacío.", example: val("gross_margin") },
      { key: "op_margin", name: "Margen operativo", what: "Rentabilidad del negocio antes de intereses e impuestos.", how: "Resultado operativo / ingresos.", read: "Es el mejor margen para comparar negocios entre sí.", example: val("op_margin") },
      { key: "net_margin", name: "Margen neto", what: "Cuánto queda de ganancia final por cada dólar vendido.", how: "Resultado neto / ingresos.", read: "Si supera mucho al operativo, hay ganancias no operativas.", example: val("net_margin") },
      { key: "roe", name: "ROE", what: "Rentabilidad sobre el capital de los accionistas.", how: "Resultado neto / patrimonio neto al cierre.", read: "Arriba de 15% es bueno. En la ficha, “De dónde sale el ROE” lo abre en margen × rotación × apalancamiento.", watch: "Vacío si el PN es negativo o menor al 5% del activo (recompras masivas lo inflan).", example: val("roe") },
    ],
  },
  {
    title: "Caja y balance",
    entries: [
      { key: "fcf_margin", name: "Margen de caja libre", what: "Cuánta caja libre genera cada dólar vendido.", how: "Caja libre / ingresos.", read: "Compararlo con el margen neto: si es menor, parte de la ganancia no se cobra.", example: val("fcf_margin") },
      { key: "fcf_ni", name: "Caja libre / resultado neto", what: "Qué parte de la ganancia contable se convierte en caja.", how: "Caja libre / resultado neto.", read: "Cerca de 1x o más es sano; muy por debajo de 0,8x merece mirarse.", watch: "Solo con resultado positivo. En el perfil se acota entre -1 y 2,5.", example: (v) => v.fcf_ni == null ? null : `${money(v.fcf)} / ${money(v.net_income)} = ${x(v.fcf_ni, 2)}` },
      { key: "de", name: "Deuda / PN", what: "Cuánta deuda financiera tiene por cada dólar de patrimonio.", how: "(Deuda de largo plazo + porción corriente + deuda de corto plazo) / patrimonio neto.", read: "Menos es mejor. Arriba de 2 es apalancamiento alto para una industrial.", watch: "Con PN negativo se muestra con asterisco y no entra en rankings.", example: val("de") },
      { key: "nd_ebitda", name: "Deuda neta / EBITDA", what: "En cuántos años de EBITDA se pagaría la deuda neta.", how: "(Deuda − caja) / (resultado operativo + depreciaciones y amortizaciones). Calculado en la moneda de origen.", read: "Menos de 2x es cómodo; más de 4x es exigente. Caja neta se muestra 0.", watch: "Con EBITDA negativo no se calcula. No incluye arrendamientos.", example: val("nd_ebitda") },
      { key: "current_ratio", name: "Liquidez corriente", what: "Capacidad de pagar las deudas del próximo año con activos del próximo año.", how: "Activo corriente / pasivo corriente.", read: "Arriba de 1 cubre; debajo de 1 depende de refinanciar o de generar caja.", watch: "Empresas con cobro contado (supermercados, restaurantes) viven bien debajo de 1.", example: val("current_ratio") },
    ],
  },
  {
    title: "Valuación",
    entries: [
      {
        key: "pe", name: "PER (precio / ganancias)",
        what: "Cuántos años de ganancias actuales está pagando el mercado.",
        how: "Capitalización bursátil / resultado neto de la base elegida (equivale a precio / EPS).",
        read: "Más bajo = más barato respecto de sus ganancias. Hay que compararlo con el crecimiento y con empresas del mismo sector.",
        watch: "Sin dato si hay pérdida. Un resultado inflado por algo no operativo lo hace parecer barato.",
        example: (v) => v.pe == null ? null : `${money(v.mcap)} / ${money(v.net_income)} = ${x(v.pe)}`,
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
