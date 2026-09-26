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


def _txt(s):
    s = (s or "").strip()
    return None if not s or s.upper() == "N/A" else s


# Sectores de Nasdaq (parecidos a GICS) en castellano
SECTOR_ES = {
    "Technology": "Tecnología", "Health Care": "Salud", "Finance": "Finanzas",
    "Consumer Discretionary": "Consumo discrecional", "Consumer Staples": "Consumo básico",
    "Industrials": "Industria", "Energy": "Energía", "Utilities": "Servicios públicos",
    "Real Estate": "Inmobiliario", "Basic Materials": "Materiales",
    "Telecommunications": "Telecomunicaciones", "Miscellaneous": "Otros",
}


def sector_from_sic(sic: int):
    """Respaldo cuando Nasdaq no informa sector (ej. BRK.B): por rango de código SIC."""
    if not sic:
        return None
    ranges = [
        ((6500, 6599), "Inmobiliario"), ((6000, 6799), "Finanzas"), ((4900, 4999), "Servicios públicos"),
        ((4800, 4899), "Telecomunicaciones"), ((1300, 1399), "Energía"), ((2900, 2999), "Energía"),
        ((2830, 2836), "Salud"), ((3841, 3851), "Salud"), ((8000, 8099), "Salud"),
        ((3570, 3579), "Tecnología"), ((3670, 3679), "Tecnología"), ((7370, 7379), "Tecnología"),
        ((2000, 2199), "Consumo básico"), ((5400, 5499), "Consumo básico"),
        ((3711, 3716), "Consumo discrecional"), ((5000, 5999), "Consumo discrecional"),
        ((7000, 7999), "Consumo discrecional"), ((2300, 2399), "Consumo discrecional"),
        ((1000, 1499), "Materiales"), ((2600, 2899), "Materiales"), ((3300, 3399), "Materiales"),
    ]
    for (a, b), name in ranges:
        if a <= sic <= b:
            return name
    return "Industria"


class Market:
    def __init__(self, cache_dir: Path):
        self.dir = cache_dir
        self.dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": UA, "Accept": "application/json"})
        self.failures = 0
        self.sector = {}  # ticker -> (sector Nasdaq, industria Nasdaq)

    def market_cap(self, ticker: str):
        """(capitalización USD, precio de cierre anterior USD, fecha ISO) o (None, None, None).
        El sector e industria de Nasdaq quedan en self.sector[ticker]."""
        sym = ticker.replace("-", ".")  # BRK-B -> BRK.B
        path = self.dir / f"mcap_{sym}.json"
        if path.exists() and time.time() - path.stat().st_mtime < CACHE_HOURS * 3600:
            data = json.loads(path.read_text())
            if "price" in data and "sector" in data:
                self.sector[ticker] = (data["sector"], data.get("industry"))
                return data.get("mcap"), data.get("price"), data.get("date")
        if self.failures >= 15:  # Nasdaq caído o bloqueando: no insistir 300 veces
            return None, None, None
        try:
            r = self.session.get(
                f"https://api.nasdaq.com/api/quote/{sym}/summary?assetclass=stocks", timeout=20)
            r.raise_for_status()
            summary = ((r.json() or {}).get("data") or {}).get("summaryData") or {}
            mcap = _num((summary.get("MarketCap") or {}).get("value"))
            price = _num((summary.get("PreviousClose") or {}).get("value"))
            sector = _txt((summary.get("Sector") or {}).get("value"))
            industry = _txt((summary.get("Industry") or {}).get("value"))
        except Exception:
            self.failures += 1
            return None, None, None
        time.sleep(0.2)
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        mcap = mcap if mcap and mcap > 0 else None
        price = price if price and price > 0 else None
        self.sector[ticker] = (sector, industry)
        path.write_text(json.dumps({"mcap": mcap, "price": price, "date": date,
                                    "sector": sector, "industry": industry}))
        return mcap, price, date if mcap else None
