#!/usr/bin/env python3
"""
Arma data/cedears.json: lista de CEDEARs de BYMA cruzada con los tickers de la SEC.

- Toma el panel de CEDEARs de BYMA, se queda con la especie en pesos
  (descarta las variantes D = MEP, C = cable y B = otro segmento).
- Aplica OVERRIDES para los casos donde el código BYMA no es el ticker de EE.UU.
- Busca el CIK en https://www.sec.gov/files/company_tickers.json.
- Respeta lo que ya editaste a mano en data/cedears.json (ratio, ticker_us, notas).

Los que quedan sin CIK son ETFs, acciones de Brasil (B3) o emisores que no
reportan a la SEC: no tienen fundamentals en esta fuente.

Uso:  SEC_USER_AGENT="Nombre tu@mail.com" python scripts/build_universe.py
"""
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "cedears.json"
UA = os.environ.get("SEC_USER_AGENT", "")

# Código BYMA -> ticker en EE.UU. cuando difieren. Revisar y ampliar.
OVERRIDES = {
    "BRKB": "BRK-B", "DISN": "DIS", "BBV": "BBVA", "TXR": "TX", "KOFM": "KOF",
    "TRVV": "TRV", "XROX": "XRX", "GOGL": "GOOGL", "NOKA": "NOK", "AKO.B": "AKO-B",
}


def byma_cedears():
    r = requests.post(
        "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cedears",
        json={"page_size": 5000},
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "User-Agent": "Mozilla/5.0"},
        timeout=60, verify=False,  # BYMA usa un certificado SSL no estándar
    )
    r.raise_for_status()
    data = r.json()
    data = data.get("data", data) if isinstance(data, dict) else data
    return sorted({x["symbol"] for x in data if x.get("denominationCcy") == "ARS"})


def data912_cedears():
    """Respaldo: data912 lista especies en ARS, MEP (D) y cable (C) juntas."""
    r = requests.get("https://data912.com/live/arg_cedears", timeout=60)
    r.raise_for_status()
    syms = {x["symbol"] for x in r.json()}
    return sorted(t for t in syms if not (t[-1] in "CD" and t[:-1] in syms))


def get_symbols():
    for fn in (byma_cedears, data912_cedears):
        try:
            syms = fn()
            if len(syms) > 100:   # BYMA a veces devuelve [] fuera de horario
                print(f"Fuente: {fn.__name__} ({len(syms)} especies)")
                return syms
        except Exception as e:
            print(f"{fn.__name__} falló: {e}")
    return []


def strip_variants(symbols):
    s = set(symbols)
    bases = set()
    for t in symbols:
        if t.endswith("B") and len(t) > 1:
            cand = t[:-1].rstrip(".")
            if cand in s or any(a.rstrip(".") == cand for a in s if a != t):
                continue  # variante "B" de otra especie
        bases.add(t.rstrip("."))
    return sorted(bases)


def main():
    if "@" not in UA:
        sys.exit("Falta SEC_USER_AGENT")
    requests.packages.urllib3.disable_warnings()
    sec = requests.get("https://www.sec.gov/files/company_tickers.json",
                       headers={"User-Agent": UA}, timeout=60).json()
    by_ticker = {v["ticker"].upper(): v for v in sec.values()}

    prev = {}
    if OUT.exists():
        prev = {c["byma"]: c for c in json.loads(OUT.read_text(encoding="utf-8"))}

    symbols = get_symbols()
    if not symbols:
        sys.exit("Ninguna fuente devolvió CEDEARs: se conserva el cedears.json actual.")
    out = []
    for b in strip_variants(symbols):
        old = prev.get(b, {})
        us = old.get("ticker_us") or OVERRIDES.get(b, b).replace(".", "-")
        hit = by_ticker.get(us)
        out.append({
            "byma": b,
            "ticker_us": us,
            "cik": int(hit["cik_str"]) if hit else None,
            "name": hit["title"] if hit else old.get("name", ""),
            "ratio": old.get("ratio"),          # completar a mano (ej. "20:1")
            "verified": old.get("verified", False),
            "note": old.get("note", ""),
        })
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(1 for c in out if c["cik"])
    print(f"{len(out)} CEDEARs · {n} con CIK en la SEC · {len(out) - n} sin fundamentals")


if __name__ == "__main__":
    main()
