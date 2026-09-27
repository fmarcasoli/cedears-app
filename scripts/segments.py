"""
Ingresos por segmento de negocio (y por línea de producto), desde el XBRL de cada 10-Q / 10-K.

La API companyfacts de la SEC solo trae totales: el desglose está en el archivo de datos XBRL
de cada presentación (<ticker>-<fecha>_htm.xml), como hechos con dimensión:
  - us-gaap:StatementBusinessSegmentsAxis   -> segmentos que define la empresa (AWS, Norteamérica...)
  - srt:ProductOrServiceAxis                 -> líneas de producto o servicio
Se toman los ingresos con UNA sola dimensión de esas (o segmento + "OperatingSegmentsMember",
la forma que usan muchas empresas desde ASU 2023-07).

Trimestres: los 10-Q traen el trimestre (3 meses) y los acumulados; el cuarto trimestre sale
del 10-K como anual − 9 meses acumulados (misma fecha de inicio), igual que en build_data.

Caché incremental en data/segments/<CIK>.json (se commitea): cada presentación se baja una sola vez.
Salida para la app: public/data/segments/<BYMA>.json, en USD.

Uso: SEC_USER_AGENT="Nombre mail" python scripts/segments.py [--solo AMZN,KO] [--minutos 20]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fx import FX  # noqa: E402

CACHE = ROOT / "data" / "segments"
OUT = ROOT / "public" / "data" / "segments"
SEC_CACHE = ROOT / ".sec_cache"
UA = os.environ.get("SEC_USER_AGENT", "")
HEADERS = {"User-Agent": UA, "Accept-Encoding": "gzip, deflate"}
FORMS = {"10-Q", "10-K", "10-Q/A", "10-K/A", "10-KT", "20-F", "40-F"}
N_FILINGS = 9          # ~2 años de presentaciones; cada 10-Q trae además el trimestre del año anterior
REVENUE = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues",
           "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "Revenue"]
AXES = {"us-gaap:StatementBusinessSegmentsAxis": "seg", "srt:ProductOrServiceAxis": "prod"}
OK_EXTRA = {("srt:ConsolidationItemsAxis", "us-gaap:OperatingSegmentsMember")}
NS = {"x": "http://www.xbrl.org/2003/instance", "xbrldi": "http://xbrl.org/2006/xbrldi"}


def get(url: str) -> requests.Response:
    for wait in (0, 2, 6, 15):
        time.sleep(wait or 0.12)   # la SEC permite ~10 pedidos por segundo
        r = requests.get(url, headers=HEADERS, timeout=90)
        if r.status_code == 403:
            sys.exit("403 de la SEC: revisá SEC_USER_AGENT (nombre y mail reales).")
        if r.status_code in (429, 500, 502, 503):
            continue
        r.raise_for_status()
        return r
    r.raise_for_status()
    return r


def label(member: str) -> str:
    """amzn:AmazonWebServicesSegmentMember -> Amazon Web Services."""
    s = member.split(":")[-1]
    s = re.sub(r"^[A-Z]\.", "", s)   # KO: "A.PacificMember" (para ordenar) = "PacificMember"
    s = re.sub(r"(Segments?|Reportable|Operating)?Member$", "", s)
    s = re.sub(r"Segment$", "", s)
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", s)
    return s.strip() or member


def instance_name(cik: int, acc: str) -> str | None:
    idx = get(f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/index.json").json()
    names = [x["name"] for x in idx["directory"]["item"]]
    hit = [n for n in names if n.endswith("_htm.xml")]
    if hit:
        return hit[0]
    skip = ("_cal.xml", "_def.xml", "_lab.xml", "_pre.xml", "FilingSummary.xml")
    hit = [n for n in names if n.endswith(".xml") and not n.endswith(skip)]
    return hit[0] if hit else None


def parse(xml: bytes) -> dict:
    """{"unit": moneda, "seg": [[miembro, inicio, cierre, valor]], "prod": [...]} de un instance."""
    root = ET.fromstring(xml)
    ctx, units = {}, {}
    for c in root.findall("x:context", NS):
        dims = tuple((m.get("dimension"), (m.text or "").strip()) for m in c.findall(".//xbrldi:explicitMember", NS))
        typed = c.find(".//xbrldi:typedMember", NS) is not None
        p = c.find("x:period", NS)
        s, e = p.find("x:startDate", NS), p.find("x:endDate", NS)
        if s is not None and e is not None and not typed:
            ctx[c.get("id")] = (dims, s.text.strip(), e.text.strip())
    for u in root.findall("x:unit", NS):
        m = u.find("x:measure", NS)
        if m is not None and (m.text or "").startswith("iso4217:"):
            units[u.get("id")] = m.text.split(":")[1]
    found = {}   # concepto -> {"seg": [...], "prod": [...]}
    for el in root:
        tag = el.tag.split("}")[-1]
        if tag not in REVENUE or el.get("contextRef") not in ctx or not (el.text or "").strip():
            continue
        dims, s, e = ctx[el.get("contextRef")]
        main = [d for d in dims if d[0] in AXES]
        rest = set(dims) - set(main)
        if len(main) != 1 or not rest <= OK_EXTRA:
            continue
        try:
            v = float(el.text)
        except ValueError:
            continue
        kind = AXES[main[0][0]]
        f = found.setdefault(tag, {"seg": {}, "prod": {}, "unit": units.get(el.get("unitRef"))})
        f[kind][(main[0][1], s, e)] = v   # si aparece dos veces (con y sin OperatingSegments), mismo valor
    out = {"unit": None, "seg": [], "prod": []}
    for kind in ("seg", "prod"):
        for tag in REVENUE:   # primer concepto de ingresos que tenga ese desglose
            if tag in found and found[tag][kind]:
                out[kind] = [[m, s, e, v] for (m, s, e), v in found[tag][kind].items()]
                out["unit"] = out["unit"] or found[tag]["unit"]
                break
    return out


def _d(s):
    return date.fromisoformat(s)


def quarters(facts: list) -> dict:
    """{cierre: {miembro: valor del trimestre}} desde duraciones de 3 meses o por diferencia de
    acumulados con el mismo inicio (anual − 9 meses = cuarto trimestre)."""
    by = {}
    for m, s, e, v in facts:
        by.setdefault(m, {})[(s, e)] = v
    out = {}
    for m, d in by.items():
        for (s, e), v in d.items():
            days = (_d(e) - _d(s)).days
            if 80 <= days <= 100:
                out.setdefault(e, {})[m] = v
        for (s, e), v in d.items():
            if e in out and m in out[e]:
                continue
            # acumulado hasta e menos acumulado hasta el trimestre anterior, mismo inicio
            for (s2, e2), v2 in d.items():
                if s2 == s and 80 <= (_d(e) - _d(e2)).days <= 100 and (_d(e2) - _d(s2)).days >= 80:
                    out.setdefault(e, {})[m] = v - v2
                    break
    return out


TOTAL_RE = re.compile(r"\b(total|aggregat\w*|consolidated|reportable segments?)\b", re.I)


def clean(period: dict) -> dict:
    """Saca de un período los renglones que no son segmentos sino sumas de otros:
    totales por nombre (COP "Total", MDT "Total Reportable", CAT "Reportable Segment Aggregation")
    y grupos que valen lo mismo que la suma de otros segmentos del período (INTC informa
    "CCG + Datacenter" además de cada uno)."""
    vals = {m: v for m, v in period.items() if v is not None and not TOTAL_RE.search(m)}
    changed = True
    while changed:
        changed = False
        for m, v in sorted(vals.items(), key=lambda x: -abs(x[1])):
            others = [(k, x) for k, x in vals.items() if k != m and x > 0]
            if v <= 0 or len(others) < 2 or len(others) > 12:
                continue
            for mask in range(3, 1 << len(others)):
                if bin(mask).count("1") < 2:
                    continue
                tot = sum(x for i, (_, x) in enumerate(others) if mask >> i & 1)
                if abs(tot - v) <= 0.0005 * v:   # XBRL: un grupo real coincide al millón; más holgura da falsos positivos (CAT)
                    del vals[m]
                    changed = True
                    break
            if changed:
                break
    return vals


def annual(facts: list) -> dict:
    out = {}
    for m, s, e, v in facts:
        if 350 <= (_d(e) - _d(s)).days <= 380:
            out.setdefault(e, {})[m] = v
    return out


def update_cache(cik: int) -> tuple[dict, bool]:
    path = CACHE / f"{cik}.json"
    cache = json.loads(path.read_text()) if path.exists() else {"filings": {}}
    sub = get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json").json()
    r = sub["filings"]["recent"]
    recent = [(f, a, d, p) for f, a, d, p in zip(r["form"], r["accessionNumber"], r["filingDate"], r["reportDate"])
              if f in FORMS][:N_FILINGS]
    changed = False
    for form, acc, filed, period in recent:
        if acc in cache["filings"]:
            continue
        name = instance_name(cik, acc)
        data = parse(get(f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{name}").content) \
            if name else {"unit": None, "seg": [], "prod": []}
        cache["filings"][acc] = {"form": form, "filed": filed, "period": period, **data}
        changed = True
    keep = {a for _, a, _, _ in recent}
    cache["filings"] = {a: v for a, v in cache["filings"].items() if a in keep}
    if changed:
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(cache, separators=(",", ":")))
    return cache, changed


def build(cache: dict, fx: FX | None) -> dict | None:
    """Series para la app. Si una presentación posterior reexpresa un período, gana la más nueva."""
    fil = sorted(cache["filings"].values(), key=lambda f: f["filed"])
    unit = next((f["unit"] for f in reversed(fil) if f.get("unit")), None)
    out = {"unit": unit, "converted": False, "filings": [
        {"form": f["form"], "filed": f["filed"], "period": f["period"]} for f in fil]}
    for kind in ("seg", "prod"):
        # Se juntan los hechos de todas las presentaciones antes de derivar trimestres: el
        # cuarto sale del anual del 10-K menos los 9 meses del 10-Q de septiembre.
        # De la más vieja a la más nueva: la última pisa (reexpresiones).
        # El segmento se identifica por su nombre legible: las empresas a veces cambian el
        # identificador del mismo segmento (NVDA: ComputeAndNetworking / ComputeNetworkingSegment).
        facts = {}
        for f in fil:
            for m, st, e, v in f[kind]:
                facts[(label(m), st, e)] = v
        flat = [[m, st, e, v] for (m, st, e), v in facts.items()]
        q = {e: clean(v) for e, v in quarters(flat).items()}
        a = {e: clean(v) for e, v in annual(flat).items()}
        if not q and not a:
            out[kind] = None
            continue
        members = {}
        for vals in list(q.values()) + list(a.values()):
            for m in vals:
                members.setdefault(m, m)
        conv = lambda e, v, days: v  # noqa: E731
        if unit and unit != "USD" and fx and fx.supported(unit):
            out["converted"] = True
            conv = lambda e, v, days: (v * r if (r := fx.average(unit, e, days=days, min_points=days // 2)) else None)  # noqa: E731
        out[kind] = {
            "members": [{"id": m, "label": lb} for m, lb in members.items()],
            "quarters": [{"end": e, "values": {m: conv(e, v, 91) for m, v in q[e].items()}} for e in sorted(q)],
            "annual": [{"end": e, "values": {m: conv(e, v, 365) for m, v in a[e].items()}} for e in sorted(a)],
        }
    return out if out.get("seg") or out.get("prod") else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", help="BYMA separados por coma")
    ap.add_argument("--minutos", type=float, default=float(os.environ.get("SEG_MINUTES", 20)))
    ap.add_argument("--sin-descargar", action="store_true", help="rearmar la salida solo desde la caché")
    args = ap.parse_args()
    if "@" not in UA and not args.sin_descargar:
        sys.exit("Falta SEC_USER_AGENT (ej: 'Nombre Apellido tu@mail.com').")
    cedears = [c for c in json.loads((ROOT / "data" / "cedears.json").read_text(encoding="utf-8")) if c.get("cik")]
    if args.solo:
        want = set(args.solo.split(","))
        cedears = [c for c in cedears if c["byma"] in want]
    # primero las que no tienen caché: si se corta por tiempo, la próxima corrida sigue
    cedears.sort(key=lambda c: (CACHE / f"{c['cik']}.json").exists())
    fx = FX(SEC_CACHE)
    OUT.mkdir(parents=True, exist_ok=True)
    t0, done, fails = time.time(), 0, 0
    for c in cedears:
        if time.time() - t0 > args.minutos * 60:
            print(f"Tiempo agotado: quedan {len(cedears) - done} para la próxima corrida.")
            break
        done += 1
        try:
            if args.sin_descargar:
                path_c = CACHE / f"{c['cik']}.json"
                if not path_c.exists():
                    continue
                cache, changed = json.loads(path_c.read_text()), False
            else:
                cache, changed = update_cache(c["cik"])
            out = build(cache, fx)
        except SystemExit:
            raise
        except Exception as e:
            fails += 1
            print(f"x {c['byma']}: {str(e)[:150]}")
            continue
        path = OUT / f"{c['byma']}.json"
        if out:
            path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        elif path.exists():
            path.unlink()
        n = len((out or {}).get("seg") or {}) and len(out["seg"]["members"])
        print(f"[{done}/{len(cedears)}] {c['byma']}: {n} segmentos{' (nuevo)' if changed else ''}")
    print(f"Listo: {done} empresas, {fails} con error.")


if __name__ == "__main__":
    main()
