# CLAUDE.md

Contexto del repo para Claude Code. Leelo antes de tocar nada.

## Qué es

Screener de fundamentals de las empresas detrás de los CEDEARs que operan en BYMA.
Datos de SEC EDGAR (XBRL). ETL en Python corre en GitHub Actions y commitea JSON;
Next.js en Vercel los sirve como páginas estáticas.

```
.github/workflows/update-data.yml   cron días hábiles 07:00 ART + botón manual
scripts/build_universe.py           BYMA (o data912) -> data/cedears.json
scripts/build_data.py               SEC -> public/data/screener.json + companies/*.json
scripts/quarterly.py                trimestres derivados y TTM
scripts/fx.py                       tipos de cambio FRED (Fed H.10), Yahoo para CLP
app/                                Next.js App Router (listado + /empresa/[byma])
lib/data.ts, lib/format.ts          tipos y formatos
data/cedears.json                   universo: BYMA -> ticker EE.UU. -> CIK (editable a mano)
```

## Reglas de datos que ya costaron caro

No las cambies sin motivo; cada una salió de un bug real.

- **Moneda de reporte**: `main_currency()` elige la moneda con más datos anuales, NO la
  primera que aparece. Varios 20-F etiquetan unas pocas líneas también en USD
  (traducción de conveniencia) y mezclarlas rompe todo (caso BABA).
- **Conversión a USD**: flujos y EPS al tipo de cambio promedio del ejercicio, saldos de
  balance al de cierre. Los ratios se calculan en moneda original; solo se convierten montos.
- **Trimestres**: los 10-Q traen acumulados. Se derivan restando acumulados con el mismo
  inicio. Q4 = anual menos 9 meses. Un trimestre dura entre 80 y 120 días (los 120 cubren
  calendarios 4-4-5, ej. Costco con Q4 de 16 semanas). La cantidad de acciones es un
  promedio ponderado: NUNCA se resta.
- **TTM**: suma de 4 trimestres consecutivos; balance del último. Si no hay 4 seguidos, no
  hay TTM y la UI cae al último ejercicio anual (se marca en cursiva).
- **Splits** (`scripts/splits.py`): EPS y acciones vienen "as reported". Split = REEXPRESIÓN:
  un filing nuevo re-publica un período viejo con k veces las acciones. Se ajustan solo los
  valores cuyo último filing es anterior al primero reexpresado. NUNCA detectar splits por
  salto de acciones entre años: confunde emisiones y fusiones (RTX, LIN, ASTS) y rompe el EPS.
- **Unidad de acciones**: hay empresas que etiquetan acciones en miles o millones algunos
  años (MCD, COP, GRMN, GT, PCAR). Se corrige contra resultado neto / EPS, tomando como
  referencia los años más cercanos a 1 en potencias de 1.000 (no la mediana simple).
- **Patrimonio negativo**: es legítimo (recompras acumuladas: MCD, SBUX, PM, ABBV).
  Deuda/PN se muestra igual, marcada, pero queda fuera de rankings y sombreados.
  ROE va en null cuando el PN es negativo o menor al 5% del activo.
- **Criterio de referencia: Investing.com** (verificado con AMZN, 2026-09). ROE y ROA sobre
  saldos PROMEDIO (inicio y cierre del período; TTM = trimestre de hace un año y el último).
  Deuda total = financiera + arrendamientos operativos y financieros (ASC 842 / NIIF 16); si el
  concepto de deuda ya incluye arrendamientos financieros (...CapitalLeaseObligations) no se suman.
  Resultado operativo: el oficial del 10-K/10-Q, NO el de Investing, que excluye extraordinarios
  (AMZN 2022: 12.248 oficial vs 13.348; Q3-25 multa FTC).
  Rotaciones (activos, inventario, cobrar) sobre saldos promedio; test ácido = (caja + inv. CP +
  cobrar) / pasivo corriente; 5 años = CAGR y promedio simple de 5 ejercicios. Cobrar usa el
  concepto SEC (AMZN lo mezcla con otros créditos: Investing reclasifica con notas).
- **Financieras** (SIC 6000-6499): no se calculan márgenes, liquidez, deuda/PN ni
  "ingresos" comparables. Se marcan con `financial: true`.
- **EBITDA** = resultado operativo + D&A. D&A = el MAYOR entre los conceptos combinados y
  depreciación + amortización: hay empresas que etiquetan un componente con el concepto
  combinado (MCD: 0,46 B vs 2,2 B reales). Deuda neta/EBITDA se calcula en moneda de origen;
  caja neta se muestra 0, EBITDA <= 0 no admite el ratio. Financieras sin EBITDA.
- **Valuación** (PER, PEG, P/VL, P/Ventas): capitalización bursátil de Nasdaq
  (`scripts/market.py`), NO precio × acciones de la SEC: en ADRs el precio es por ADR y las
  acciones son ordinarias. PER = precio / EPS diluido (como Investing) cuando precio x acciones
  diluidas ≈ capitalización; si no (ADR), cap / resultado neto. P/VL = cap / PN, P/Ventas = cap /
  ingresos; con denominador <= 0 no hay múltiplo. PEG = PER / CAGR 3a del resultado neto en
  moneda de origen (histórico, no proyectado). Si Nasdaq falla, la valuación queda en null.
- **Pilares del perfil**: puntaje contra el valor externo de su industria (ver abajo), no percentil de CEDEARs:
  50 + 50 x (empresa - industria) / max(|industria|, piso), acotado 0-100 (50 = igual, 100 = el
  doble de bueno). Crecimiento: ventas 12m, ventas y EPS 5a; Rentabilidad: mg. bruto, operativo, ROE;
  Solidez: deuda/PN, deuda BRUTA/EBITDA, liquidez y test ácido; Calidad: flujo OPERATIVO/RN contra 1
  (no caja libre: el CAPEX de crecimiento, ej. AMZN en IA, no es mala calidad de la ganancia).
  Sin datos de industria en la corrida, vuelve al percentil del universo.
- **Industria (parámetro EXTERNO, nunca calculado acá)**: el usuario no quiere promedios propios.
  Fuente principal: columna "Industria" de Investing.com (`scripts/investing.py`, workflow semanal
  `update-industry.yml`; curl_cffi porque Cloudflare bloquea requests). Mapa ticker -> página en
  `data/investing_map.json` (del buscador de acciones de Investing; editable a mano). Lo que Investing
  no publica (deuda/EBITDA, PEG) o publica fuera de rango (PLAUSIBLE en build_data: sus promedios
  simples dan absurdos como margen −129%) sale de Damodaran (`scripts/industry.py`), marcado ᴰ.
  Si un margen TTM de la industria se descarta, su promedio de 5 años también (mismo promedio roto).
  Coherencia (MARGIN_GAP = 15 puntos): se descarta el margen antes de impuestos si se aleja del
  operativo, y el promedio de 5 años si se aleja de su margen TTM (AAPL, Computers: operativo 26,8%, 5 años −4%).
  Software & IT Services (42 CEDEARs) tiene los márgenes rotos en Investing: usa Damodaran.
  `sector_group` (Nasdaq) queda solo para el filtro de sector.
- **Desfase de la SEC**: la API companyfacts a veces no tiene el último 10-Q ya presentado.
  Se detecta contra el endpoint `submissions` y se marca `api_lag`.
- **Montos**: en el JSON de salida están en unidades (USD), no en millones. Si armás un
  dataset compacto, documentá la unidad.

## Estilo

- Todo el texto de la UI en español rioplatense. Sin emojis.
- Tokens de color en `app/globals.css`: fondo claro/oscuro, celeste como único acento.
  Nada de gradientes ni paleta arcoíris. Números con `font-variant-numeric: tabular-nums`.
- Cada métrica derivada se explica en la UI (tooltip o nota), incluyendo su limitación.
  El usuario es asesor financiero: prefiere ver el supuesto antes que un número lindo.
- Nunca un score único que resuma todo: se muestran pilares separados.

## Antes de abrir el PR

```bash
npm install && npm run build          # tiene que compilar las ~326 páginas
SEC_USER_AGENT="Nombre mail@dominio" python scripts/build_data.py   # solo si tocaste el ETL
```

- Si tocás el ETL, verificá a mano 3 o 4 empresas conocidas (AAPL, KO, MCD, TM) contra
  el balance publicado antes de dar por buena la corrida.
- No commitees `public/data/` en un PR de código: esos archivos los escribe el cron.
- Nunca pongas claves ni el mail del `SEC_USER_AGENT` en el código: van como secret.
- Next.js pineado en 16.3.5. Versiones viejas quedan bloqueadas por Vercel por CVE.

## Vista (pestaña de la ficha, app/vista.tsx)
- Últimos 6 trimestres + variación T/T y A/A; azul = mejoró, rojo = empeoró (deuda neta/EBITDA invertido, CAPEX neutro).
- Renglones de 12 meses: deuda neta / EBITDA 12m, EBITDA 12m / intereses 12m, (caja + inversiones CP) / (deuda CP + porción corriente LP).
- Caja libre 12m = FFO + capital de trabajo − CAPEX. `wc` sale de los renglones IncreaseDecreaseIn* del flujo
  (wc_of en scripts/quarterly.py; activo que sube resta, pasivo que sube suma; NIIF ya viene con signo de caja);
  FFO = flujo operativo − wc. Si la empresa no informa esos renglones, el gráfico usa flujo operativo y CAPEX.
- N_QUARTERS = 20 para tener 17 puntos de 12 meses.

## Puntaje general (lib/metrics.ts: SECTOR_WEIGHTS, general())
- Promedio ponderado de los 4 pilares con pesos por sector_group (Crec/Rent/Sol/Cal):
  Tecnología 35/30/15/20 · Salud 30/30/20/20 · Consumo básico 20/35/20/25 ·
  Servicios públicos, Telecom, Inmobiliario 15/25/40/20 · Energía, Materiales 15/25/35/25 · resto 25/25/25/25.
- Mínimo 3 pilares (el peso del faltante se reparte). Si algún pilar < 30, tope 60. Financieras: sin puntaje.
- Elegido por el usuario el 2026-09-27; valuación queda fuera (mide salud, no precio).

## Ingresos por segmento (scripts/segments.py, app/segments.tsx)
- companyfacts no trae dimensiones: se baja el instance XBRL (<x>_htm.xml) de las últimas 9 presentaciones
  (10-Q/10-K/20-F/40-F) y se leen los ingresos con StatementBusinessSegmentsAxis (también ProductOrServiceAxis,
  que se superpone: partition() elige la combinación MÁS DETALLADA que suma el ingreso total al 0,05% en el
  último período y en otro anterior; si ninguna cierra, no se muestra). Nombres que son el mismo renglón
  ("Advertising" / "Advertising Services", nunca juntos en un período) se unifican.
- Hechos de todas las presentaciones juntos (la más nueva pisa) y después trimestres: 3 meses directos o
  acumulado − acumulado con el mismo inicio (Q4 = anual − 9 meses). Segmento = nombre legible normalizado.
- Caché commiteada en data/segments/<CIK>.json; salida public/data/segments/<BYMA>.json. Paso del workflow
  con presupuesto de 20 min y continue-on-error.
- Ingresos totales: "revenue" toma el MAYOR entre Revenues y RevenueFromContractWithCustomerExcludingAssessedTax
  (MAX_OF en quarterly.py): el ASC 606 deja afuera intereses de financieras propias (MELI, GM, BRKB...).

## Márgenes de industria: solo Damodaran (27-sep-2026)
- MARGIN_KEYS (bruto, operativo, antes de impuestos, neto y sus promedios de 5 años) nunca salen de Investing:
  su promedio simple se rompe en industrias con muchas empresas chicas en pérdida (Software −127%).
- Damodaran (agregado) da bruto, operativo y neto. Antes de impuestos y 5 años de márgenes quedan sin referencia.
- Reemplaza las reglas anteriores de contagio y MARGIN_GAP.

## Industria = SOLO Damodaran (desde 27-sep-2026, decisión del usuario)
- Investing NO se usa en la app. Solo sirvió para verificar nuestras fórmulas; el workflow
  "Comparar con Investing (manual)" queda para contrastes puntuales y la app no lee su salida.
- Nuestras métricas: definiciones estándar compatibles con Damodaran (agregados de industria).
  Nuevas: ni_cagr5 (resultado neto 5a, lo que publica Damodaran) e interest_cov (resultado operativo / intereses).
- industry_bench(): DAM_KEYS; descarta ROE de signo contrario a un margen neto > 5%, rotaciones > 100x y,
  en financieras, todo salvo FIN_BENCH. ind_name lleva " (global)" para las extranjeras.
- Pilares: Crecimiento = ventas 12m (contra ventas 5a de la industria), ventas 5a, resultado neto 5a;
  Solidez = deuda/PN, deuda/EBITDA, cobertura de intereses (liquidez sin referencia de industria).
- Las secciones anteriores sobre Investing (PLAUSIBLE, contagio, MARGIN_GAP, márgenes solo Damodaran)
  quedan reemplazadas por esta.
