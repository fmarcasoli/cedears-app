"""
Datos trimestrales desde companyfacts de la SEC.

El problema: los 10-Q no traen todos los trimestres "limpios".
  - Resultados: vienen el trimestre (3 meses) y el acumulado del año (6 y 9 meses).
  - Flujo de fondos: casi siempre SOLO el acumulado (3, 6, 9 meses).
  - Q4: nunca hay 10-Q; hay que despejarlo como anual (10-K) menos 9 meses.
La solución general: agrupar todos los períodos que arrancan el mismo día (inicio
del ejercicio) y restar acumulados consecutivos separados por ~3 meses.

Balance: saldo al cierre de cada trimestre (10-Q) o del año (10-K).
Cantidad de acciones: es un promedio ponderado, NO se puede restar; solo se usa
el dato directo de 3 meses.
"""
from datetime import date

FORMS = {"10-Q", "10-Q/A", "10-K", "10-K/A", "10-KT", "6-K", "6-K/A",
         "20-F", "20-F/A", "40-F", "40-F/A"}
N_QUARTERS = 16  # 4 años: 3 para mostrar + 1 para comparar interanual
# Conceptos donde, si una empresa etiqueta varios, gana el mayor y no el primero:
# algunas usan el concepto combinado para un componente (MCD etiqueta como
# DepreciationDepletionAndAmortization 0,46 B y el total de 2,2 B como
# DepreciationAndAmortization). Un componente nunca supera al total.
MAX_OF = {"da"}


def _d(s):
    return date.fromisoformat(s)


def _is_quarter(days):
    return 80 <= days <= 100


def quarter_points(facts_list, instant: bool, additive: bool = True) -> dict:
    """{fin_de_trimestre: valor}. additive=False desactiva la derivación por resta."""
    if instant:
        out = {}
        for f in facts_list:
            if f.get("form") in FORMS and "start" not in f and f.get("end"):
                if f["end"] not in out or f.get("filed", "") > out[f["end"]][1]:
                    out[f["end"]] = (f["val"], f.get("filed", ""))
        return {k: v[0] for k, v in out.items()}

    periods = {}  # (inicio, fin) -> (valor, filed); gana el filing más reciente
    for f in facts_list:
        if f.get("form") not in FORMS or "start" not in f or not f.get("end"):
            continue
        key = (f["start"], f["end"])
        if key not in periods or f.get("filed", "") > periods[key][1]:
            periods[key] = (f["val"], f.get("filed", ""))

    quarters = {}
    for (s, e), (v, _) in periods.items():  # 1) trimestres reportados directamente
        if _is_quarter((_d(e) - _d(s)).days):
            quarters[e] = v
    if not additive:
        return quarters

    by_start = {}  # 2) derivar restando acumulados con el mismo inicio
    for (s, e), (v, _) in periods.items():
        by_start.setdefault(s, []).append((e, v))
    for s, items in by_start.items():
        items.sort()
        for (e0, v0), (e1, v1) in zip(items, items[1:]):
            if e1 not in quarters and _is_quarter((_d(e1) - _d(e0)).days):
                quarters[e1] = v1 - v0
    return quarters


def _near(series: dict, end: str, tol=7):
    if end in series:
        return series[end]
    d0 = _d(end)
    for e, v in series.items():
        if abs((_d(e) - d0).days) <= tol:
            return v
    return None


def build_quarters(facts, taxonomies, currency, concepts, instant_keys, per_share, share_count, pick_unit):
    series = {}
    for key, cands in concepts.items():
        merged = {}
        for concept in cands:
            for tax in taxonomies:
                node = facts[tax].get(concept)
                if not node:
                    continue
                unit = pick_unit(node["units"], key)
                if not unit:
                    continue
                if key not in per_share | share_count and unit != currency:
                    continue
                pts = quarter_points(node["units"][unit], key in instant_keys,
                                     additive=key not in share_count)
                for e, v in pts.items():
                    if key in MAX_OF and e in merged and v is not None:
                        merged[e] = max(merged[e], v)
                    else:
                        merged.setdefault(e, v)
        series[key] = merged

    ends = sorted(set(series.get("revenue", {})) | set(series.get("net_income", {})))
    # descartar fechas casi duplicadas (mismo trimestre con 1-3 días de diferencia)
    clean = []
    for e in ends:
        if clean and (_d(e) - _d(clean[-1])).days < 20:
            clean[-1] = e
        else:
            clean.append(e)
    ends = clean[-N_QUARTERS:]

    q = []
    for e in ends:
        r = {"end": e}
        for key in concepts:
            s = series.get(key, {})
            r[key] = _near(s, e) if key in instant_keys else s.get(e)
        if r["gross_profit"] is None and r["revenue"] is not None and r["cost_of_revenue"] is not None:
            r["gross_profit"] = r["revenue"] - r["cost_of_revenue"]
        q.append(r)

    # Splits: mismo criterio que en la serie anual
    for i in range(len(q) - 1, 0, -1):
        a, b = q[i]["shares"], q[i - 1]["shares"]
        if a and b and a / b >= 1.45:
            factor = round(a / b * 2) / 2
            for r in q[:i]:
                if r["shares"]:
                    r["shares"] *= factor
                if r["eps_diluted"] is not None:
                    r["eps_diluted"] /= factor

    add_quarter_ratios(q)
    return q


def _div(a, b):
    return a / b if a is not None and b not in (None, 0) else None


def ebitda_of(r):
    """Resultado operativo + D&A. D&A = el mayor entre el concepto combinado y
    depreciación + amortización (la amortización sola no alcanza)."""
    oi = r.get("operating_income")
    da = r.get("da")
    if r.get("depreciation") is not None:  # si el combinado es menor, es un componente
        parts = r["depreciation"] + (r.get("amortization") or 0)
        da = parts if da is None else max(da, parts)
    r["da_total"] = da
    return oi + da if oi is not None and da is not None else None


def nd_ebitda(net_debt, ebitda):
    """Deuda neta / EBITDA: caja neta -> 0; EBITDA <= 0 no admite el ratio."""
    if net_debt is None or ebitda is None or ebitda <= 0:
        return None
    return 0.0 if net_debt <= 0 else net_debt / ebitda


def add_quarter_ratios(q):
    for i, r in enumerate(q):
        r["fcf"] = r["ocf"] - (r["capex"] or 0) if r.get("ocf") is not None else None
        parts = [r.get("lt_debt"), r.get("lt_debt_current"), r.get("st_debt")]
        r["total_debt"] = sum(p or 0 for p in parts) if any(p is not None for p in parts) else None
        r["net_debt"] = (r["total_debt"] - r["cash"]
                         if r["total_debt"] is not None and r.get("cash") is not None else None)
        r["gross_margin"] = _div(r["gross_profit"], r["revenue"])
        r["op_margin"] = _div(r["operating_income"], r["revenue"])
        r["net_margin"] = _div(r["net_income"], r["revenue"])
        r["ebitda"] = ebitda_of(r)
        # interanual contra el mismo trimestre del año anterior (evita la estacionalidad)
        prev = q[i - 4] if i >= 4 and 350 <= (_d(r["end"]) - _d(q[i - 4]["end"])).days <= 380 else None
        r["rev_yoy"] = (_div(r["revenue"], prev["revenue"]) - 1
                        if prev and _div(r["revenue"], prev.get("revenue")) is not None else None)
        r["eps_yoy"] = (_div(r["eps_diluted"], prev["eps_diluted"]) - 1
                        if prev and prev.get("eps_diluted") and prev["eps_diluted"] > 0
                        and r.get("eps_diluted") is not None else None)


def _consecutive(block):
    return all(_is_quarter((_d(b["end"]) - _d(a["end"])).days) for a, b in zip(block, block[1:]))


TTM_FLOWS = ("revenue", "gross_profit", "operating_income", "ebitda", "da_total", "net_income", "ocf", "capex",
             "fcf", "dividends", "buybacks", "eps_diluted")


def ttm(q):
    """Últimos 12 meses: suma de 4 trimestres consecutivos + balance del último."""
    if len(q) < 4 or not _consecutive(q[-4:]):
        return None
    last4 = q[-4:]
    t = {"end": last4[-1]["end"]}
    for k in TTM_FLOWS:
        vals = [r.get(k) for r in last4]
        t[k] = sum(vals) if all(v is not None for v in vals) else None
    L = last4[-1]
    for k in ("assets", "equity", "cash", "total_debt", "net_debt", "current_assets",
              "current_liabilities"):
        t[k] = L.get(k)
    t["gross_margin"] = _div(t["gross_profit"], t["revenue"])
    t["op_margin"] = _div(t["operating_income"], t["revenue"])
    t["net_margin"] = _div(t["net_income"], t["revenue"])
    t["fcf_margin"] = _div(t["fcf"], t["revenue"])
    thin = t["equity"] is not None and (t["equity"] <= 0 or (t["assets"] and t["equity"] / t["assets"] < 0.05))
    t["roe"] = None if thin else _div(t["net_income"], t["equity"])
    t["debt_equity"] = None if thin else _div(t["total_debt"], t["equity"])
    t["current_ratio"] = _div(t["current_assets"], t["current_liabilities"])
    t["nd_ebitda"] = nd_ebitda(t["net_debt"], t["ebitda"])
    # crecimiento TTM contra los 12 meses anteriores
    t["rev_growth"] = None
    if len(q) >= 8 and _consecutive(q[-8:]):
        prev = [r.get("revenue") for r in q[-8:-4]]
        if all(v is not None for v in prev) and t["revenue"] is not None and sum(prev):
            t["rev_growth"] = t["revenue"] / sum(prev) - 1
    return t
