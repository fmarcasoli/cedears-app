"""
Promedios de la INDUSTRIA según Investing.com (columna "Industria" de la página de ratios).

Es la referencia que usa el usuario. Investing no tiene API: la página de ratios trae en su
JSON interno (__NEXT_DATA__) cada indicador con el valor de la empresa y el de la industria:
    state.dividendsStore.ratios.indicators.<clave> = {value, industry_value, ...}

Cloudflare bloquea `requests`; `curl_cffi` imita a Chrome a nivel TLS y pasa. Hay que ir
despacio (2-3 s por página) o devuelve 403/429. Puede dejar de funcionar si Investing cambia
la protección: por eso el resultado se guarda en data/investing_industry.json y, si una
corrida falla, se conserva el anterior.

Uso:  python scripts/investing.py                      # mapa (si faltan) + ratios
      python scripts/investing.py --solo-mapa
      python scripts/investing.py --buscar-faltantes     # además prueba por nombre (lento)
El mapa (data/investing_map.json) se puede editar a mano: {"BYMA": {"slug": ..., "industry": ...}}.
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAP_FILE = ROOT / "data" / "investing_map.json"        # byma -> {slug, industry} (editable)
OUT_FILE = ROOT / "data" / "investing_industry.json"   # byma -> ratios de la industria
SITEMAPS = ["equities_ov_sitemap.xml"] + [f"equities_ov_sitemap_{i}.xml" for i in range(2, 10)]
US_EXCHANGES = {"NASDAQ", "NYSE", "NYSE American", "NYSE Arca", "BATS", "Cboe BZX", "OTC Markets"}
PAUSE = 2.5

# clave de Investing -> (nuestra métrica, es porcentaje)
KEYS = {
    "gross_margin_ttm": ("gross_margin", True), "operating_margin_ttm": ("op_margin", True),
    "pretax_margin_ttm": ("pretax_margin", True), "net_profit_margin_ttm": ("net_margin", True),
    "return_on_equity_ttm": ("roe", True), "return_on_assets_ttm": ("roa", True),
    "gross_margin_5ya": ("gm5", True), "operating_margin_5ya": ("om5", True),
    "pretax_margin_5ya": ("ptm5", True), "net_profit_margin_5ya": ("nm5", True),
    "five_year_sales_growth_5ya": ("rev_cagr5", True), "five_year_eps_growth_5ya": ("eps_cagr5", True),
    "five_year_capital_spending_growth_5ya": ("capex_cagr5", True),
    "sales_ttm_vs_ttm_1_yr_ago_ttm": ("growth", True), "sales_mrq_vs_qtr_1_yr_ago_mrq": ("q_yoy", True),
    "eps_mrq_vs_qtr_1_yr_ago_mrq": ("q_eps_yoy", True), "eps_ttm_vs_ttm_1_yr_ago_ttm": ("eps_ttm_yoy", True),
    "total_debt_to_equity_mrq": ("de", True), "lt_debt_to_equity_mrq": ("lt_de", True),
    "current_ratio_mrq": ("current_ratio", False), "quick_ratio_mrq": ("quick_ratio", False),
    "asset_turnover_ttm": ("asset_turnover", False), "inventory_turnover_ttm": ("inv_turnover", False),
    "receivable_turnover_ttm": ("ar_turnover", False),
    "pe_ratio_ttm": ("pe", False), "price_to_sales_ttm": ("ps", False), "price_to_book_mrq": ("pb", False),
    "price_to_cash_flow_mrq": ("pcf", False),
}
STOP = {"inc", "corp", "corporation", "co", "company", "ltd", "limited", "plc", "sa", "ag", "nv",
        "holdings", "holding", "group", "the", "de", "adr", "spa", "se", "ab", "asa", "sab", "cv",
        "lp", "llc", "incorporated", "ads", "class", "cl", "new", "publ", "com"}


def session():
    from curl_cffi import requests as cr
    return cr.Session(impersonate="chrome120")


def get(s, url, tries=4):
    for i in range(tries):
        try:
            r = s.get(url, timeout=40)
            if r.status_code == 200:
                return r.text
            if r.status_code in (403, 429, 503):
                time.sleep(20 * (i + 1))  # Cloudflare: esperar y reintentar
                continue
            return None
        except Exception:
            time.sleep(5 * (i + 1))
    return None


def next_data(html: str):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html or "", re.S)
    return json.loads(m.group(1))["props"]["pageProps"]["state"] if m else None


def _tokens(s: str) -> set:
    s = re.sub(r"\(.*?\)", "", (s or "").lower()).replace(".", "").replace("&", " ")
    return {t for t in re.split(r"[^a-z0-9]+", s.split("/")[0]) if t and t not in STOP}


def all_slugs(s) -> list[str]:
    slugs = set()
    for f in SITEMAPS:
        xml = get(s, f"https://www.investing.com/{f}") or ""
        slugs.update(re.findall(r"investing\.com/equities/([a-z0-9.\-]+)</loc>", xml))
        time.sleep(1)
    return sorted(slugs)


def _match(a: str, b: str) -> bool:
    """Palabras iguales o una abreviatura de la otra (semicond ~ semiconductor)."""
    return a == b or (min(len(a), len(b)) >= 4 and (a.startswith(b) or b.startswith(a)))


def candidates(name: str, ticker: str, slugs: list[str], n=10) -> list[str]:
    want = _tokens(name)
    tk = ticker.lower().replace(".", "-")
    scored = []
    for sl in slugs:
        toks = set(re.split(r"[-.]", sl)) - STOP
        if not toks:
            continue
        inter = sum(1 for w in want if any(_match(w, t) for t in toks))
        score = inter / (len(want) + len(toks) - inter) if want else 0
        if sl == tk or sl.startswith(tk + "-"):
            score += 0.3
        if score > 0.3:
            scored.append((score, sl))
    return [sl for _, sl in sorted(scored, reverse=True)[:n]]


def crawl_screener(s) -> dict:
    """Ticker -> (slug, industria) desde el buscador de acciones de Investing: 12 sectores ->
    ~60 industrias -> las 50 empresas más grandes de cada una (incluye ADRs). ~75 páginas."""
    def store(url):
        st = next_data(get(s, "https://www.investing.com" + url))
        time.sleep(PAUSE)
        return (st or {}).get("stockScreenerStore") or {}
    out = {}
    root = store("/stock-screener/united-states/technology")  # la raíz sola no trae el índice
    sectors = next((g["links"] for g in root.get("sectorIndustryLinks", []) if g["title"].endswith("Sectors")), [])
    for sec in sectors:
        page = store(sec["link"])
        inds = [l for g in page.get("sectorIndustryLinks", []) if not g["title"].endswith("Sectors") for l in g["links"]]
        for ind in inds:
            rows = ((store(ind["link"]).get("results") or {}).get("rows")) or []
            for r in rows:
                a = r.get("asset") or {}
                ex = (a.get("primary") or "").split(":")[0]
                if a.get("ticker") and a.get("path", "").startswith("/equities/"):
                    key = re.sub(r"[^A-Z0-9]", "", a["ticker"].upper())
                    # si hay dos (ej. ordinaria OTC y ADR), preferir la que cotiza en Nasdaq/NYSE
                    if key not in out or ex.startswith(("Nasdaq", "NYSE")):
                        out[key] = (a["path"].split("/equities/")[1], ind.get("industry") or ind["title"])
            print(f"  {sec['title']} / {ind['title']}: {len(rows)}")
    return out


def instrument(state) -> tuple[str, str]:
    ins = (state or {}).get("equityStore", {}).get("instrument", {}) or {}
    return ((ins.get("name") or {}).get("symbol") or "", (ins.get("exchange") or {}).get("exchange") or "")


def resolve(s, byma: str, ticker: str, name: str, slugs: list[str]):
    """Prueba candidatos hasta que el símbolo coincide y cotiza en EE.UU."""
    alnum = lambda x: re.sub(r"[^A-Z0-9]", "", x.upper())
    want = alnum(ticker)  # BRK-B == BRKb
    for sl in candidates(name, ticker, slugs):
        html = get(s, f"https://www.investing.com/equities/{sl}-ratios")
        time.sleep(PAUSE)
        sym, ex = instrument(next_data(html))
        if alnum(sym) == want and (ex in US_EXCHANGES or "NYSE" in ex or "NASDAQ" in ex):
            return sl
    return None


def industry_name(s, slug: str):
    html = get(s, f"https://www.investing.com/equities/{slug}-company-profile")
    st = next_data(html) or {}
    prof = (st.get("companyProfileStore") or {}).get("profile") or {}
    ind = prof.get("industry")
    return ind.get("name") if isinstance(ind, dict) else ind


def ratios(s, slug: str):
    st = next_data(get(s, f"https://www.investing.com/equities/{slug}-ratios"))
    ind = (((st or {}).get("dividendsStore") or {}).get("ratios") or {}).get("indicators") or {}
    out = {}
    for k, (ours, is_pct) in KEYS.items():
        v = (ind.get(k) or {}).get("industry_value")
        if isinstance(v, (int, float)):
            out[ours] = v / 100 if is_pct else v
    return out


def main():
    only_map = "--solo-mapa" in sys.argv
    cedears = json.loads((ROOT / "data" / "cedears.json").read_text(encoding="utf-8"))
    screener = ROOT / "public" / "data" / "screener.json"
    names = {r["byma"]: r["name"] for r in json.loads(screener.read_text())["rows"]} if screener.exists() else {}
    mp = json.loads(MAP_FILE.read_text(encoding="utf-8")) if MAP_FILE.exists() else {}
    s = session()
    todo = [c for c in cedears if c.get("cik") and c["byma"] not in mp]
    if todo:
        found = crawl_screener(s)
        print(f"buscador: {len(found)} acciones")
        for c in todo:
            hit = found.get(re.sub(r"[^A-Z0-9]", "", c["ticker_us"].upper()))
            mp[c["byma"]] = {"slug": hit[0], "industry": hit[1]} if hit else {"slug": None, "industry": None}
    miss = [c for c in cedears if c.get("cik") and not (mp.get(c["byma"]) or {}).get("slug")
            and not mp.get(c["byma"], {}).get("buscado")
            and not re.search(r"\b(ETF|Trust|Fund)\b", names.get(c["byma"]) or c.get("name") or "", re.I)]
    if miss and "--buscar-faltantes" in sys.argv:  # lento: prueba candidatos del sitemap
        slugs = all_slugs(s)
        for i, c in enumerate(miss, 1):
            sl = resolve(s, c["byma"], c["ticker_us"], names.get(c["byma"]) or c.get("name") or "", slugs)
            mp[c["byma"]] = {"slug": sl, "industry": industry_name(s, sl) if sl else None, "buscado": True}
            print(f"[{i}/{len(miss)}] {c['byma']}: {sl or 'sin match'} {mp[c['byma']]['industry'] or ''}")
            time.sleep(PAUSE)
            MAP_FILE.write_text(json.dumps(mp, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    if todo or miss:
        print(f"mapa: {sum(1 for v in mp.values() if v['slug'])} con dirección, "
              f"{sum(1 for v in mp.values() if not v['slug'])} sin encontrar")
        MAP_FILE.write_text(json.dumps(mp, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    if only_map:
        return
    prev = json.loads(OUT_FILE.read_text(encoding="utf-8")) if OUT_FILE.exists() else {"rows": {}}
    rows, ok, fail = dict(prev.get("rows", {})), 0, 0
    for i, (byma, m) in enumerate(sorted(mp.items()), 1):
        if not m.get("slug"):
            continue
        vals = ratios(s, m["slug"])
        time.sleep(PAUSE)
        if vals:
            rows[byma] = {"industry": m.get("industry"), "values": vals}
            ok += 1
        else:
            fail += 1  # se conserva el valor anterior
        if i % 25 == 0:
            print(f"  {i} páginas: {ok} ok, {fail} fallas")
    if ok == 0:
        sys.exit("Investing no respondió (¿bloqueo de Cloudflare?): se conserva el archivo anterior.")
    OUT_FILE.write_text(json.dumps({
        "meta": {"source": "Investing.com (columna Industria de la página de ratios)",
                 "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "ok": ok, "fallas": fail},
        "rows": rows}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Listo: {ok} empresas con industria de Investing, {fail} fallas.")


if __name__ == "__main__":
    main()
