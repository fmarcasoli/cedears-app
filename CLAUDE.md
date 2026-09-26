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
