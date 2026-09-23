#!/usr/bin/env python3
"""Baja fundamentals de la SEC para cada CEDEAR de data/cedears.json
y escribe public/data/screener.json y public/data/companies/{BYMA}.json.

Local:  SEC_USER_AGENT="Nombre tu@mail.com" python scripts/build_data.py
"""

import json
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests

import os

# ───────────────────────── CONFIGURACIÓN ─────────────────────────
# El User-Agent sale de la variable de entorno SEC_USER_AGENT
# (en GitHub: Settings > Secrets and variables > Actions).
# La SEC exige nombre + mail reales; sin eso devuelve 403.
USER_AGENT = os.environ.get("SEC_USER_AGENT", "")
YEARS = 10
ROOT = Path(__file__).resolve().parent.parent
CEDEARS_FILE = ROOT / "data" / "cedears.json"
OUT_DIR = ROOT / "public" / "data"
CACHE_DIR = ROOT / ".sec_cache"
CACHE_HOURS = 12
# ──────────────────────────────────────────────────────────────────

HEADERS = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}
ANNUAL_FORMS = {"10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A", "10-KT"}

# Cada métrica: lista de conceptos en orden de prioridad (us-gaap, luego ifrs-full).
# Las empresas cambian de concepto con los años (ej. SalesRevenueNet → Revenue...),
# así que por cada período se toma el primer concepto que tenga dato.
CONCEPTS = {
    # ---- Estado de resultados (flujos, duración anual)
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues",
        "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax",
        "SalesRevenueGoodsNet", "Revenue", "RevenueAndOperatingIncome",
    ],
    "gross_profit": ["GrossProfit"],
    "cost_of_revenue": [
        "CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfSales",
    ],
    "operating_income": ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
    "net_income": [
        "NetIncomeLoss", "ProfitLossAttributableToOwnersOfParent", "ProfitLoss",
    ],
    "eps_diluted": ["EarningsPerShareDiluted", "DilutedEarningsLossPerShare"],
    "ocf": [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        "CashFlowsFromUsedInOperatingActivities",
    ],
    "capex": [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
        "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
    ],
    "dividends": [
        "PaymentsOfDividends", "PaymentsOfDividendsCommonStock",
        "DividendsPaidClassifiedAsFinancingActivities",
    ],
    "buybacks": ["PaymentsForRepurchaseOfCommonStock"],
    # D&A para el EBITDA. Primero el concepto combinado (casi siempre del flujo de
    # fondos); si no está, depreciación + amortización por separado. Se excluyen los
    # conceptos que incluyen deterioro (impairment) o amortizaciones futuras.
    "da": [
        "DepreciationDepletionAndAmortization", "DepreciationAndAmortization",
        "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortisationExpense",
        "AdjustmentsForDepreciationAndAmortisationExpense",
    ],
    "depreciation": ["Depreciation", "DepreciationExpense", "DepreciationPropertyPlantAndEquipment"],
    "amortization": [
        "AmortizationOfIntangibleAssets", "FiniteLivedIntangibleAssetsAmortizationExpense",
        "AmortisationIntangibleAssetsOtherThanGoodwill", "AmortisationExpense",
    ],
    # ---- Balance (saldos a una fecha)
    "assets": ["Assets"],
    "current_assets": ["AssetsCurrent", "CurrentAssets"],
    "current_liabilities": ["LiabilitiesCurrent", "CurrentLiabilities"],
    "liabilities": ["Liabilities"],
    "equity": [
        "StockholdersEquity", "EquityAttributableToOwnersOfParent",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "Equity",
    ],
    "cash": [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        "CashAndCashEquivalents",
    ],
    # Deuda en tres bloques que se suman (las empresas cambian de concepto:
    # ej. KO pasó de LongTermDebtNoncurrent a LongTermDebtAndCapitalLeaseObligations).
    "lt_debt": [
        "LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations",
        "NoncurrentPortionOfNoncurrentBorrowings",
    ],
    "lt_debt_current": [
        "LongTermDebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent",
        "CurrentPortionOfNoncurrentBorrowings",
    ],
    "st_debt": ["ShortTermBorrowings", "CommercialPaper", "CurrentBorrowings"],
    "shares": [
        "WeightedAverageNumberOfDilutedSharesOutstanding",
        "AdjustedWeightedAverageShares",
    ],
}
INSTANT = {"assets", "current_assets", "current_liabilities", "liabilities",
           "equity", "cash", "lt_debt", "lt_debt_current", "st_debt"}
PER_SHARE = {"eps_diluted"}
SHARE_COUNT = {"shares"}


# ─────────────────────────── DESCARGA ───────────────────────────
def get_json(url: str, cache_name: str) -> dict:
    CACHE_DIR.mkdir(exist_ok=True)
    path = CACHE_DIR / cache_name
    if path.exists() and (time.time() - path.stat().st_mtime) < CACHE_HOURS * 3600:
        return json.loads(path.read_text())
    r = requests.get(url, headers=HEADERS, timeout=60)
    if r.status_code == 403:
        sys.exit("403 de la SEC: poné un USER_AGENT con nombre y mail reales.")
    r.raise_for_status()
    path.write_text(r.text)
    time.sleep(0.15)  # la SEC permite ~10 req/s; margen de sobra
    return r.json()


def ticker_to_cik() -> dict:
    data = get_json("https://www.sec.gov/files/company_tickers.json", "company_tickers.json")
    return {v["ticker"].upper(): (int(v["cik_str"]), v["title"]) for v in data.values()}


# ─────────────────────────── PARSEO ─────────────────────────────
def pick_unit(units: dict, kind: str):
    if kind in PER_SHARE:
        for u in units:
            if "/shares" in u:
                return u
    if kind in SHARE_COUNT:
        return "shares" if "shares" in units else None
    if "USD" in units:
        return "USD"
    monetary = [u for u in units if "/" not in u and u not in ("shares", "pure")]
    return monetary[0] if monetary else None


def annual_points(facts_list, instant: bool) -> dict:
    """Devuelve {fecha_cierre: (valor, fecha_filing)} solo con datos anuales."""
    out = {}
    for f in facts_list:
        if f.get("form") not in ANNUAL_FORMS:
            continue
        end = f.get("end")
        if not end:
            continue
        if instant:
            if "start" in f:
                continue
        else:
            if "start" not in f:
                continue
            days = (date.fromisoformat(end) - date.fromisoformat(f["start"])).days
            if not 350 <= days <= 380:
                continue
        filed = f.get("filed", "")
        # Si hay reexpresiones, gana el filing más reciente.
        if end not in out or filed > out[end][1]:
            out[end] = (f["val"], filed)
    return out


def build_company(ticker: str, cik: int, name: str) -> dict:
    facts = get_json(
        f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json",
        f"CIK{cik:010d}.json",
    )["facts"]
    taxonomies = [t for t in ("us-gaap", "ifrs-full") if t in facts]

    series, currency, used = {}, None, {}
    fiscal_ends = set()
    last_filed = ""

    for key, concepts in CONCEPTS.items():
        merged, used_here = {}, []
        for concept in concepts:
            for tax in taxonomies:
                node = facts[tax].get(concept)
                if not node:
                    continue
                unit = pick_unit(node["units"], key)
                if not unit:
                    continue
                if key not in PER_SHARE | SHARE_COUNT:
                    if currency is None:
                        currency = unit
                    elif unit != currency:
                        continue  # no mezclar monedas
                pts = annual_points(node["units"][unit], key in INSTANT)
                added = False
                for end, (val, filed) in pts.items():
                    if end not in merged:
                        merged[end] = val
                        added = True
                    elif key in MAX_OF and val is not None and val > merged[end]:
                        merged[end] = val
                        added = True
                    last_filed = max(last_filed, filed)
                if added:
                    used_here.append(concept)
        series[key] = merged
        used[key] = used_here
        if key == "revenue" or key == "net_income":
            fiscal_ends.update(merged.keys())

    # Años fiscales = cierres donde hay ingresos o resultado neto; se agrupa por
    # año de cierre (ej. NVDA cierra en enero: FY2025 = cierre ene-2025).
    by_year = {}
    for end in sorted(fiscal_ends):
        by_year[int(end[:4])] = end
    years = sorted(by_year)[-YEARS:]

    def val(key, y):
        end = by_year[y]
        s = series.get(key, {})
        if end in s:
            return s[end]
        # Balances: tolerar pequeñas diferencias de fecha de cierre (±7 días)
        if key in INSTANT:
            d0 = date.fromisoformat(end)
            for e, v in s.items():
                if abs((date.fromisoformat(e) - d0).days) <= 7:
                    return v
        return None

    rows = []
    for y in years:
        r = {"year": y, "fiscal_end": by_year[y]}
        for key in CONCEPTS:
            r[key] = val(key, y)
        if r["gross_profit"] is None and r["revenue"] is not None and r["cost_of_revenue"] is not None:
            r["gross_profit"] = r["revenue"] - r["cost_of_revenue"]
        rows.append(r)

    # ── Splits: EPS y acciones vienen "as reported" (sin ajustar por splits viejos).
    # Si las acciones saltan ≥45% en un año, se asume split y se ajusta hacia atrás.
    splits = []
    for i in range(len(rows) - 1, 0, -1):
        a, b = rows[i]["shares"], rows[i - 1]["shares"]
        if a and b and a / b >= 1.45:
            factor = round(a / b * 2) / 2
            splits.append(f"Split ~{factor:g}:1 en la serie de acciones: EPS y acciones anteriores a FY{rows[i]['year']} ajustados")
            for r in rows[:i]:
                if r["shares"]:
                    r["shares"] *= factor
                if r["eps_diluted"] is not None:
                    r["eps_diluted"] /= factor

    # ── Ratios
    def div(a, b):
        return a / b if a is not None and b not in (None, 0) else None

    prev = None
    for r in rows:
        r["fcf"] = r["ocf"] - (r["capex"] or 0) if r["ocf"] is not None else None
        r["gross_margin"] = div(r["gross_profit"], r["revenue"])
        r["op_margin"] = div(r["operating_income"], r["revenue"])
        r["net_margin"] = div(r["net_income"], r["revenue"])
        r["fcf_margin"] = div(r["fcf"], r["revenue"])
        thin = r["equity"] is not None and (r["equity"] <= 0 or (
            r["assets"] and r["equity"] / r["assets"] < 0.05))
        r["roe"] = None if thin else div(r["net_income"], r["equity"])
        r["thin_equity"] = bool(thin)
        r["roa"] = div(r["net_income"], r["assets"])
        r["current_ratio"] = div(r["current_assets"], r["current_liabilities"])
        parts = [r["lt_debt"], r["lt_debt_current"], r["st_debt"]]
        debt = sum(p or 0 for p in parts) if any(p is not None for p in parts) else None
        r["total_debt"] = debt
        r["net_debt"] = debt - r["cash"] if debt is not None and r["cash"] is not None else None
        r["debt_equity"] = div(debt, r["equity"])
        r["fcf_conversion"] = div(r["fcf"], r["net_income"])
        r["ebitda"] = ebitda_of(r)
        r["nd_ebitda"] = nd_ebitda(r["net_debt"], r["ebitda"])
        r["rev_growth"] = (
            div(r["revenue"], prev["revenue"]) - 1
            if prev and div(r["revenue"], prev["revenue"]) is not None else None
        )
        prev = r

    # ── Alertas automáticas (para no mirar solo lo lindo)
    alerts = []
    if len(rows) >= 2:
        a, b = rows[-1], rows[-2]
        def drop(k, label, thr=0.03):
            if a[k] is not None and b[k] is not None and a[k] < b[k] - thr:
                alerts.append(f"{label} cayó de {b[k]:.1%} a {a[k]:.1%}")
        drop("gross_margin", "Margen bruto")
        drop("op_margin", "Margen operativo")
        drop("roe", "ROE", 0.05)
        if a["fcf_conversion"] is not None and a["fcf_conversion"] < 0.8 and (a["net_income"] or 0) > 0:
            alerts.append(f"Conversión FCF/Resultado neto baja: {a['fcf_conversion']:.2f}x")
        if a["rev_growth"] is not None and a["rev_growth"] < 0:
            alerts.append(f"Ingresos cayeron {a['rev_growth']:.1%} interanual")
        if a["current_ratio"] is not None and a["current_ratio"] < 1:
            alerts.append(f"Liquidez corriente < 1 ({a['current_ratio']:.2f})")
        if a["debt_equity"] is not None and b["debt_equity"] is not None and a["debt_equity"] > b["debt_equity"] * 1.25:
            alerts.append(f"Deuda/PN subió de {b['debt_equity']:.2f} a {a['debt_equity']:.2f}")
        if a["shares"] and b["shares"] and a["shares"] > b["shares"] * 1.02:
            alerts.append(f"Dilución: acciones +{a['shares'] / b['shares'] - 1:.1%}")
    if rows:  # las alertas de arriba son del último ejercicio anual: dejarlo explícito
        alerts = [f"Ejercicio FY{rows[-1]['year']}: {x[0].lower()}{x[1:]}" for x in alerts]
    alerts.extend(splits)
    if currency and currency not in ("USD", "EUR", "GBP", "JPY", "CHF", "CAD"):
        alerts.append(f"Reporta en {currency}: si es moneda de alta inflación (ARS → NIC 29), "
                      "cada año puede estar expresado en moneda de distinto cierre. "
                      "Compará ratios, no montos, y chequeá con el 20-F.")
    if rows and rows[-1].get("thin_equity"):
        alerts.append("Patrimonio neto negativo o menor al 5% del activo (típico de recompras "
                      "masivas): ROE y Deuda/PN no son representativos.")
    missing = [k for k in ("revenue", "net_income", "ocf", "equity") if not used.get(k)]

    quarters = build_quarters(facts, taxonomies, currency or "USD", CONCEPTS, INSTANT,
                              PER_SHARE, SHARE_COUNT, pick_unit)
    if quarters:
        lq = quarters[-1]
        if lq.get("rev_yoy") is not None and lq["rev_yoy"] < 0:
            alerts.append(f"Último trimestre ({lq['end']}): ingresos {lq['rev_yoy']:.1%} interanual")
        if len(quarters) >= 5:
            pq = quarters[-5]
            if lq.get("op_margin") is not None and pq.get("op_margin") is not None \
                    and lq["op_margin"] < pq["op_margin"] - 0.03:
                alerts.append(f"Último trimestre: margen operativo {lq['op_margin']:.1%} "
                              f"vs {pq['op_margin']:.1%} un año antes")

    return {
        "quarters": quarters,
        "ticker": ticker, "name": name, "cik": cik,
        "taxonomy": ", ".join(taxonomies), "currency": currency or "?",
        "last_filed": last_filed, "rows": rows, "alerts": alerts,
        "concepts_used": used, "missing": missing,
    }




# ───────────────────────── CONVERSIÓN A USD ─────────────────────────
from fx import FX  # noqa: E402
from market import Market  # noqa: E402
from quarterly import MAX_OF, build_quarters, ebitda_of, nd_ebitda, ttm  # noqa: E402

FLOW_KEYS = ("revenue", "gross_profit", "cost_of_revenue", "operating_income", "net_income",
             "da", "depreciation", "amortization", "da_total", "ebitda",
             "ocf", "capex", "dividends", "buybacks", "fcf")
STOCK_KEYS = ("assets", "current_assets", "current_liabilities", "liabilities", "equity",
              "cash", "lt_debt", "lt_debt_current", "st_debt", "total_debt", "net_debt")


def to_usd(comp: dict, fx: FX) -> None:
    """Convierte montos a USD in-place. Los ratios quedan como en moneda original
    (márgenes, ROE, deuda/PN no dependen de la moneda si se calculan en origen)."""
    ccy = comp["currency"]
    comp["reported_currency"] = ccy
    comp["converted"] = False
    if ccy == "USD" or not fx.supported(ccy):
        return
    for r in comp["rows"]:
        avg, cls = fx.average(ccy, r["fiscal_end"]), fx.close(ccy, r["fiscal_end"])
        r["fx_avg"], r["fx_close"] = avg, cls
        for k in FLOW_KEYS + ("eps_diluted",):
            r[k] = r[k] * avg if (r.get(k) is not None and avg) else None
        for k in STOCK_KEYS:
            r[k] = r[k] * cls if (r.get(k) is not None and cls) else None
    for r in comp.get("quarters", []):
        avg = fx.average(ccy, r["end"], days=91, min_points=45)
        cls = fx.close(ccy, r["end"])
        r["fx_avg"], r["fx_close"] = avg, cls
        r["rev_yoy_local"] = r.get("rev_yoy")
        for k in FLOW_KEYS + ("eps_diluted",):
            r[k] = r[k] * avg if (r.get(k) is not None and avg) else None
        for k in STOCK_KEYS:
            r[k] = r[k] * cls if (r.get(k) is not None and cls) else None
    qs = comp.get("quarters", [])
    for i, r in enumerate(qs):  # interanual en USD
        p = qs[i - 4] if i >= 4 else None
        r["rev_yoy"] = (r["revenue"] / p["revenue"] - 1
                        if p and r.get("revenue") and p.get("revenue") and r.get("rev_yoy_local") is not None
                        else None)
    # crecimiento: el de moneda local mide el negocio; el de USD suma el efecto cambiario
    prev = None
    for r in comp["rows"]:
        r["rev_growth_local"] = r["rev_growth"]
        r["rev_growth"] = (r["revenue"] / prev["revenue"] - 1
                           if prev and r["revenue"] and prev.get("revenue") else None)
        prev = r
    comp["currency"] = "USD"
    comp["converted"] = True
    comp["fx_source"] = fx.source.get(ccy, "")


# ─────────────────────── SALIDA PARA LA APP ───────────────────────
def get_sector(cik: int):
    """Devuelve (descripción SIC, código SIC) desde el endpoint submissions."""
    try:
        sub = get_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json",
                       f"sub_CIK{cik:010d}.json")
        rec = sub.get("filings", {}).get("recent", {})
        latest = None
        for form, fdate, rdate in zip(rec.get("form", []), rec.get("filingDate", []),
                                      rec.get("reportDate", [])):
            if form in ("10-Q", "10-K", "20-F", "40-F") and rdate:
                latest = {"form": form, "filed": fdate, "period": rdate}
                break
        return sub.get("sicDescription") or "", int(sub.get("sic") or 0), latest
    except Exception:
        return "", 0, None


# Bancos, aseguradoras y brokers (SIC 6000-6499): "ingresos", margen bruto,
# liquidez corriente y deuda/PN no significan lo mismo que en una industrial.
FIN_RATIOS_OFF = ("gross_margin", "op_margin", "net_margin", "fcf_margin", "ebitda", "nd_ebitda",
                  "current_ratio", "debt_equity", "rev_growth")
FIN_SCREENER_OFF = ("revenue", "rev_cagr3", "fcf")  # "ingresos" de bancos no comparables
STALE_DAYS = 450


def ttm_fields(comp):
    t, q = comp.get("ttm"), comp.get("quarters") or []
    out = {"ttm_end": t["end"] if t else None,
           "q_end": q[-1]["end"] if q else None,
           "q_rev_yoy": q[-1].get("rev_yoy") if q else None,
           "q_eps_yoy": q[-1].get("eps_yoy") if q else None}
    for k in ("revenue", "net_income", "fcf", "rev_growth", "gross_margin", "op_margin",
              "net_margin", "fcf_margin", "roe", "debt_equity", "current_ratio", "ebitda", "nd_ebitda"):
        out["t_" + k] = t.get(k) if t else None
    if comp.get("financial"):
        for k in ("t_revenue", "t_fcf", "t_rev_growth", "q_rev_yoy"):
            out[k] = None
    return out


def cagr(rows, key, n=3):
    if len(rows) <= n:
        return None
    a, b = rows[-1].get(key), rows[-1 - n].get(key)
    if not a or not b or a <= 0 or b <= 0:
        return None
    return (a / b) ** (1 / n) - 1


def main():
    if "@" not in USER_AGENT:
        sys.exit("Falta SEC_USER_AGENT (ej: 'Nombre Apellido tu@mail.com').")
    cedears = json.loads(CEDEARS_FILE.read_text(encoding="utf-8"))
    (OUT_DIR / "companies").mkdir(parents=True, exist_ok=True)
    fx = FX(CACHE_DIR)
    market = Market(CACHE_DIR)
    screener, errors = [], []
    targets = [c for c in cedears if c.get("cik")]
    for i, c in enumerate(targets, 1):
        byma, us, cik = c["byma"], c["ticker_us"], c["cik"]
        try:
            comp = build_company(us, cik, c.get("name") or us)
        except Exception as e:
            errors.append({"byma": byma, "error": str(e)[:200]})
            print(f"[{i}/{len(targets)}] x {byma}: {e}")
            continue
        # Control de consistencia: 4 trimestres del último ejercicio vs dato anual
        qmap = {r["end"]: r for r in comp["quarters"]}
        qends = sorted(qmap)
        for row in comp["rows"][-1:]:
            fe = row["fiscal_end"]
            if fe in qmap and qends.index(fe) >= 3:
                blk = [qmap[e] for e in qends[qends.index(fe) - 3: qends.index(fe) + 1]]
                for k, label in (("revenue", "ingresos"), ("net_income", "resultado neto")):
                    vals = [b[k] for b in blk]
                    if None not in vals and row[k] and abs(sum(vals) / row[k] - 1) > 0.02:
                        comp["alerts"].append(
                            f"Los 4 trimestres de FY{row['year']} no suman el {label} anual "
                            f"({sum(vals) / row[k] - 1:+.1%}): posible reexpresión u operaciones "
                            "discontinuadas. Tomar el TTM con cuidado.")
        t_local = ttm(comp["quarters"])
        # Crecimiento del resultado neto para el PEG: en moneda de origen, antes de
        # convertir (así no mezcla el efecto cambiario).
        comp["ni_cagr3"] = cagr(comp["rows"], "net_income")
        try:
            to_usd(comp, fx)
        except Exception as e:  # sin tipo de cambio: queda en moneda original
            comp["reported_currency"], comp["converted"] = comp["currency"], False
            comp["alerts"].append(f"No se pudo convertir a USD: {e}")
        t = ttm(comp["quarters"]) if t_local else None
        if t and t_local:
            for k in ("gross_margin", "op_margin", "net_margin", "fcf_margin", "roe",
                      "debt_equity", "current_ratio", "nd_ebitda"):
                t[k] = t_local[k]
            t["rev_growth_local"] = t_local["rev_growth"]
        comp["ttm"] = t
        base = t or (comp["rows"][-1] if comp["rows"] else {})
        ni, oi = base.get("net_income"), base.get("operating_income")
        if ni and oi and oi > 0 and ni > 1.3 * oi:
            comp["alerts"].append(
                f"El resultado neto supera al operativo en {ni / oi - 1:.0%}: hay ganancias no "
                "operativas (revaluación de inversiones, venta de activos, impuestos). "
                "El margen operativo refleja mejor el negocio.")
        comp["byma"] = byma
        comp["ratio"] = c.get("ratio")
        comp["market_cap"], comp["mcap_date"] = market.market_cap(us)
        comp["sector"], sic, latest = get_sector(cik)
        # ¿La API companyfacts ya incorporó el último 10-Q/10-K presentado?
        have = max([r["end"] for r in comp["quarters"]] + [r["fiscal_end"] for r in comp["rows"]] or [""])
        comp["api_lag"] = bool(latest and have and latest["period"] > have and
                               (date.fromisoformat(latest["period"]) - date.fromisoformat(have)).days > 10)
        if comp["api_lag"]:
            comp["alerts"].append(
                f"Hay un {latest['form']} más nuevo (período {latest['period']}, presentado el "
                f"{latest['filed']}) que la API de la SEC todavía no incorporó en XBRL.")
        rows = comp["rows"]
        comp["financial"] = 6000 <= sic < 6500
        if comp["financial"]:
            for r in rows + comp["quarters"] + ([comp["ttm"]] if comp.get("ttm") else []):
                for k in FIN_RATIOS_OFF + ("rev_yoy", "rev_yoy_local", "fcf_margin"):
                    if k in r:
                        r[k] = None
                # En financieras el apalancamiento alto es normal: ROE vale si PN > 0
                if r.get("thin_equity") and (r["equity"] or 0) > 0 and r["net_income"] is not None:
                    r["roe"], r["thin_equity"] = r["net_income"] / r["equity"], False
            comp["alerts"] = [a for a in comp["alerts"] if not a.startswith("Patrimonio neto negativo")]
            comp["alerts"] = [a for a in comp["alerts"] if not a.startswith(("Margen", "Liquidez", "Deuda", "Ingresos"))]
            comp["alerts"].append("Entidad financiera: márgenes, liquidez y deuda/PN no se calculan "
                                  "(no son comparables con empresas no financieras).")
        L0 = rows[-1] if rows else {}
        age = (date.today() - date.fromisoformat(L0["fiscal_end"])).days if L0.get("fiscal_end") else None
        comp["stale"] = age is None or age > STALE_DAYS
        if comp["stale"]:
            comp["alerts"].append("El último ejercicio disponible en la API tiene más de 15 meses: "
                                  "puede haber un 20-F/10-K más nuevo que la SEC no expone en XBRL. "
                                  "Verificar en EDGAR.")
        (OUT_DIR / "companies" / f"{byma}.json").write_text(
            json.dumps(comp, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        L = rows[-1] if rows else {}
        screener.append({
            "byma": byma, "ticker": us, "name": comp["name"], "sector": comp["sector"],
            "currency": comp["currency"], "reported_currency": comp["reported_currency"],
            "converted": comp["converted"], "fy": L.get("year"), "fiscal_end": L.get("fiscal_end"),
            "last_filed": comp["last_filed"],
            "revenue": L.get("revenue"), "net_income": L.get("net_income"), "fcf": L.get("fcf"),
            "rev_growth": L.get("rev_growth"), "rev_cagr3": cagr(rows, "revenue"),
            "gross_margin": L.get("gross_margin"), "op_margin": L.get("op_margin"),
            "net_margin": L.get("net_margin"), "fcf_margin": L.get("fcf_margin"),
            "roe": L.get("roe"), "debt_equity": L.get("debt_equity"),
            "current_ratio": L.get("current_ratio"),
            "ebitda": L.get("ebitda"), "nd_ebitda": L.get("nd_ebitda"),
            "market_cap": comp["market_cap"], "mcap_date": comp["mcap_date"], "ni_cagr3": comp["ni_cagr3"],
            "financial": comp["financial"], "stale": comp["stale"], "api_lag": comp["api_lag"],
            **ttm_fields(comp),
            "alerts": len(comp["alerts"]), "missing": comp["missing"],
        })
        if comp["financial"]:
            for k in FIN_SCREENER_OFF:
                screener[-1][k] = None
        print(f"[{i}/{len(targets)}] ok {byma} ({us}) {len(rows)} anios")
    meta = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "total_cedears": len(cedears), "with_sec": len(targets),
        "ok": len(screener), "errors": errors,
        "with_market_cap": sum(1 for r in screener if r["market_cap"]),
        "without_sec": [c["byma"] for c in cedears if not c.get("cik")],
    }
    (OUT_DIR / "screener.json").write_text(
        json.dumps({"meta": meta, "rows": screener}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print(f"Listo: {len(screener)} empresas, {len(errors)} errores.")


if __name__ == "__main__":
    main()
