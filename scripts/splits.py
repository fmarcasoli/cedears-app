"""
Splits y errores de unidad en la cantidad de acciones y el EPS.

La SEC publica EPS y acciones "as reported". Después de un split, los filings nuevos
re-publican los períodos anteriores ya ajustados, pero los años que solo aparecen en
filings viejos quedan sin ajustar. Antes se detectaba un split por salto de acciones
(>= 45% de un año a otro), y eso confundía emisiones, fusiones y cambios de unidad con
splits (RTX, LIN, ASTS, COP, GT...) y "ajustaba" mal el EPS.

Ahora:
  1. Split = reexpresión. Si un mismo período aparece en dos filings y el más nuevo
     trae k veces las acciones del más viejo, hubo un split k:1 (o inverso) antes del
     filing nuevo. Una emisión o una fusión nunca reexpresa el pasado.
  2. Se ajustan solo los valores cuyo último filing es anterior al primer filing ya
     reexpresado: esos son los que quedaron en la base vieja.
  3. Unidad: si en un período acciones / (resultado neto / EPS) difiere de la mediana
     de la empresa en ~1.000 o ~1.000.000, las acciones están en miles (o al revés).
     Si la mediana misma está en ~1.000 o ~1.000.000, toda la serie está en otra unidad.
"""
from math import log10
from statistics import median

SHARE_CONCEPTS = ("WeightedAverageNumberOfDilutedSharesOutstanding", "AdjustedWeightedAverageShares")
MIN_FACTOR = 1.45  # 3:2 es el split más chico habitual


def _clean(r):
    """Redondea a un factor de split razonable (k:1 o 1:k, múltiplos de 0,5)."""
    if r >= 1:
        return round(r * 2) / 2
    return 1 / (round((1 / r) * 2) / 2)


def detect(facts: dict, taxonomies) -> list:
    """[(fecha del primer filing reexpresado, factor)], una entrada por split."""
    raw = []
    for tax in taxonomies:
        for concept in SHARE_CONCEPTS:
            node = facts[tax].get(concept)
            if not node or "shares" not in node["units"]:
                continue
            periods = {}
            for f in node["units"]["shares"]:
                if "start" in f and f.get("filed") and f.get("val"):
                    periods.setdefault((f["start"], f["end"]), []).append((f["filed"], f["val"]))
            for vals in periods.values():
                vals.sort()
                for (f1, v1), (f2, v2) in zip(vals, vals[1:]):
                    r = v2 / v1
                    # > 100x no es un split: es un cambio de unidad (lo trata fix_units)
                    if (r >= MIN_FACTOR or r <= 1 / MIN_FACTOR) and 0.01 < r < 100:
                        raw.append((f2, _clean(r)))
    # Un split se ve en muchos períodos y filings: agrupar por factor y quedarse con
    # el primer filing que ya lo muestra. Dos splits iguales separados por más de un
    # año son eventos distintos.
    events = []
    for filed, k in sorted(raw):
        if events and events[-1][1] == k and _days(events[-1][0], filed) < 400:
            continue
        events.append((filed, k))
    return events


def _days(a, b):
    from datetime import date
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def fix_units(periods: list, label) -> list:
    """Corrige acciones informadas en miles (o millones) en algún período. In place."""
    ratios = []
    for p in periods:
        sh, eps, ni = p.get("shares"), p.get("eps_diluted"), p.get("net_income")
        p["_ratio"] = sh / (ni / eps) if sh and eps and ni and (ni / eps) > 0 else None
        if p["_ratio"]:
            ratios.append(p["_ratio"])
    notes = []
    if len(ratios) >= 3:
        # Referencia: los períodos cuyo cociente está más cerca de 1 en potencias de
        # 1.000 (MCD tiene la mitad de los años en millones y la otra mitad en unidades:
        # la mediana simple caería en el medio).
        buckets = {}
        for r in ratios:
            buckets.setdefault(round(log10(r) / 3), []).append(r)
        m = median(buckets[min(buckets, key=abs)])
        # Toda la serie en otra unidad (MCD etiqueta las acciones en millones: 732,3)
        for power in (1e3, 1e6, 1e-3, 1e-6):
            if abs(m / power - 1) < 0.1:
                for p in periods:
                    if p.get("shares"):
                        p["shares"] /= power
                    if p.get("_ratio"):
                        p["_ratio"] /= power
                m /= power
                notes.append("todos los períodos")
                break
        for p in periods:
            r = p.pop("_ratio", None)
            if not r:
                continue
            for power in (1e3, 1e6, 1e-3, 1e-6):
                if abs(r / m / power - 1) < 0.1:
                    p["shares"] /= power
                    notes.append(label(p))
                    break
    for p in periods:
        p.pop("_ratio", None)
    return notes


def apply(periods: list, events: list, filed_sh: dict, filed_eps: dict, key) -> list:
    """Lleva acciones y EPS a la base actual. Devuelve los factores efectivamente usados."""
    used = set()
    for p in periods:
        k = key(p)
        for date, factor in events:
            if p.get("shares") and filed_sh.get(k, "9999") < date:
                p["shares"] *= factor
                used.add((date, factor))
            if p.get("eps_diluted") is not None and filed_eps.get(k, "9999") < date:
                p["eps_diluted"] /= factor
                used.add((date, factor))
    return sorted(used)
