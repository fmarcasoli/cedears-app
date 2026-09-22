# Fundamentals de CEDEARs

Screener de fundamentals de las empresas detrás de los CEDEARs que operan en BYMA,
con datos de SEC EDGAR (XBRL). Next.js en Vercel + ETL diario en GitHub Actions.

## Cómo funciona

```
GitHub Actions (todos los días hábiles, 07:00 ART)
  └─ scripts/build_data.py  → baja companyfacts de la SEC con tu SEC_USER_AGENT
       └─ escribe public/data/*.json y hace commit
            └─ Vercel detecta el push y redeploya el sitio (páginas estáticas)
```

## Estructura

| Ruta | Qué es |
|---|---|
| `data/cedears.json` | Universo: código BYMA → ticker EE.UU. → CIK. **Editable a mano.** |
| `scripts/build_universe.py` | Regenera el universo desde BYMA (respaldo: data912) |
| `scripts/build_data.py` | ETL: SEC → ratios → `public/data/` |
| `public/data/screener.json` | Una fila por empresa (último ejercicio) |
| `public/data/companies/*.json` | Serie de 10 años por empresa |
| `app/` | Next.js: listado (`/`) y detalle (`/empresa/AAPL`) |
| `.github/workflows/update-data.yml` | Cron diario + botón manual |

## Correr local

```bash
pip install -r scripts/requirements.txt
export SEC_USER_AGENT="Tu Nombre tu@mail.com"     # Windows: set SEC_USER_AGENT=...
python scripts/build_universe.py    # opcional: regenera data/cedears.json
python scripts/build_data.py        # ~5 min la primera vez; después usa caché
npm install
npm run dev                         # http://localhost:3000
```

## Mantener el universo

Cuando `data/cedears.json` tiene un código BYMA que no coincide con el ticker
de EE.UU., corregí `ticker_us` a mano, poné `"verified": true` y volvé a correr
`build_universe.py` (respeta lo editado). También podés cargar el `ratio` de cada
CEDEAR (ej. `"20:1"`), que se muestra en la ficha.
