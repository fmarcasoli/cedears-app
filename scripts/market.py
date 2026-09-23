"""
Capitalización bursátil en USD para los ratios de valuación (PER, PEG, P/VL, P/Ventas).

Fuente: API pública de Nasdaq (api.nasdaq.com/api/quote/{ticker}/summary), sin clave.
Se usa la capitalización y no precio × acciones porque:
  - en los ADRs el precio es por ADR y las acciones de la SEC son ordinarias (el ratio
    ADR/ordinaria no está en XBRL);
  - en empresas con varias clases (GOOGL, META) Nasdaq ya suma todas las clases.
Si Nasdaq falla, la empresa queda sin valuación (None); el resto del ETL sigue.
"""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CACHE_HOURS = 6  # el precio cambia todos los días; la caché solo evita repetir en la misma corrida


def _num(s):
    try:
        return float(str(s).replace("$", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return None


class Market:
    def __init__(self, cache_dir: Path):
        self.dir = cache_dir
        self.dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": UA, "Accept": "application/json"})
        self.failures = 0

    def market_cap(self, ticker: str):
        """(capitalización USD, fecha ISO) o (None, None)."""
        sym = ticker.replace("-", ".")  # BRK-B -> BRK.B
        path = self.dir / f"mcap_{sym}.json"
        if path.exists() and time.time() - path.stat().st_mtime < CACHE_HOURS * 3600:
            data = json.loads(path.read_text())
            return data.get("mcap"), data.get("date")
        if self.failures >= 15:  # Nasdaq caído o bloqueando: no insistir 300 veces
            return None, None
        try:
            r = self.session.get(
                f"https://api.nasdaq.com/api/quote/{sym}/summary?assetclass=stocks", timeout=20)
            r.raise_for_status()
            summary = ((r.json() or {}).get("data") or {}).get("summaryData") or {}
            mcap = _num((summary.get("MarketCap") or {}).get("value"))
        except Exception:
            self.failures += 1
            return None, None
        time.sleep(0.2)
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        mcap = mcap if mcap and mcap > 0 else None
        path.write_text(json.dumps({"mcap": mcap, "date": date}))
        return mcap, date if mcap else None
