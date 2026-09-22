"""
Tipos de cambio para pasar a USD los estados de emisores que reportan en otra moneda.

Fuente principal: Fed H.10 vía FRED (fredgraph.csv, sin API key).
Respaldo: Yahoo Finance para monedas que la Fed no publica (ej. CLP).

Convención (la misma que usa NIC 21 / ASC 830 para convertir estados):
  - flujos (resultados, flujo de fondos, EPS) -> promedio del ejercicio
  - saldos de balance                          -> tipo de cambio al cierre
Todas las funciones devuelven USD por 1 unidad de moneda local.
"""
import csv
import io
import json
import time
from bisect import bisect_right
from datetime import date, timedelta
from pathlib import Path

import requests

# serie FRED y si está expresada como USD por moneda (True) o moneda por USD (False)
FRED = {
    "EUR": ("DEXUSEU", True), "GBP": ("DEXUSUK", True), "AUD": ("DEXUSAL", True),
    "BRL": ("DEXBZUS", False), "JPY": ("DEXJPUS", False), "MXN": ("DEXMXUS", False),
    "CAD": ("DEXCAUS", False), "KRW": ("DEXKOUS", False), "SEK": ("DEXSDUS", False),
    "DKK": ("DEXDNUS", False), "CHF": ("DEXSZUS", False), "TWD": ("DEXTAUS", False),
    "CNY": ("DEXCHUS", False), "INR": ("DEXINUS", False), "NOK": ("DEXNOUS", False),
    "HKD": ("DEXHKUS", False), "ZAR": ("DEXSFUS", False),
}
YAHOO = {"CLP": "CLP=X", "COP": "COP=X", "PEN": "PEN=X", "ARS": "ARS=X"}


class FX:
    def __init__(self, cache_dir: Path, max_age_h: float = 20):
        self.dir = cache_dir
        self.dir.mkdir(parents=True, exist_ok=True)
        self.max_age = max_age_h * 3600
        self.series = {}   # ccy -> (fechas ordenadas, valores USD por unidad)
        self.source = {}

    def _load(self, ccy):
        if ccy in self.series:
            return self.series[ccy]
        path = self.dir / f"fx_{ccy}.json"
        if path.exists() and time.time() - path.stat().st_mtime < self.max_age:
            data = json.loads(path.read_text())
        else:
            data = self._download(ccy)
            path.write_text(json.dumps(data))
        pts = sorted((d, v) for d, v in data["points"])
        self.series[ccy] = ([p[0] for p in pts], [p[1] for p in pts])
        self.source[ccy] = data["source"]
        return self.series[ccy]

    def _download(self, ccy):
        if ccy in FRED:
            sid, usd_per = FRED[ccy]
            r = requests.get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}", timeout=60)
            r.raise_for_status()
            pts = []
            for row in list(csv.reader(io.StringIO(r.text)))[1:]:
                try:
                    v = float(row[1])
                except (ValueError, IndexError):
                    continue  # feriados vienen como "." o vacío
                if v > 0:
                    pts.append((row[0], v if usd_per else 1 / v))
            return {"source": f"Fed H.10 (FRED {sid})", "points": pts}
        if ccy in YAHOO:
            sym = YAHOO[ccy]
            r = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=20y&interval=1d",
                headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
            r.raise_for_status()
            res = r.json()["chart"]["result"][0]
            closes = res["indicators"]["quote"][0]["close"]
            pts = [(date.fromtimestamp(t).isoformat(), 1 / c)
                   for t, c in zip(res["timestamp"], closes) if c]
            return {"source": f"Yahoo Finance ({sym})", "points": pts}
        raise KeyError(f"Sin fuente de tipo de cambio para {ccy}")

    def supported(self, ccy) -> bool:
        return ccy in FRED or ccy in YAHOO

    def close(self, ccy, day: str):
        """Último dato disponible en o antes de `day` (hasta 10 días atrás)."""
        ds, vs = self._load(ccy)
        i = bisect_right(ds, day) - 1
        if i < 0 or (date.fromisoformat(day) - date.fromisoformat(ds[i])).days > 10:
            return None
        return vs[i]

    def average(self, ccy, end: str, days: int = 365, min_points: int = 150):
        """Promedio simple de los datos diarios del ejercicio que cierra en `end`."""
        ds, vs = self._load(ccy)
        start = (date.fromisoformat(end) - timedelta(days=days)).isoformat()
        lo, hi = bisect_right(ds, start), bisect_right(ds, end)
        window = vs[lo:hi]
        return sum(window) / len(window) if len(window) >= min_points else None
