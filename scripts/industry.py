"""
Promedios de la industria REAL (no del universo de CEDEARs), de Aswath Damodaran (NYU Stern).

Damodaran publica cada enero métricas por industria (~95 industrias) sobre ~6.000 empresas
de EE.UU. y ~48.000 del mundo, y el listado empresa -> industria. Es la referencia estándar
para comparar una empresa contra su industria.
  https://pages.stern.nyu.edu/~adamodar/New_Home_Page/data.html

Casi todas sus métricas son AGREGADAS (suma de resultados / suma de ventas de la industria),
no promedios simples: las empresas grandes pesan más y los casos extremos no la distorsionan.

Región: empresas de EE.UU. contra la industria de EE.UU.; el resto contra la industria global.
Mapeo de cada CEDEAR a su industria, en este orden:
  1. ticker en una bolsa de EE.UU. (NasdaqGS:AAPL, NYSE:KO);
  2. nombre normalizado (ADRs: Damodaran los lista en su bolsa de origen, ej. TWSE:2330);
  3. código SIC: la industria más frecuente entre las empresas con ese SIC ("aproximada").
"""
from __future__ import annotations

import json
import re
import time
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import requests

BASE = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/"
CACHE_DAYS = 30  # se actualiza una vez por año (enero); no hace falta bajarlo todos los días
FILES = {
    "us": {"margin": "margin.xls", "pe": "pedata.xls", "pbv": "pbvdata.xls", "ps": "psdata.xls",
           "debt": "dbtfund.xls", "roe": "roe.xls", "hist": "histgr.xls", "wc": "wcdata.xls"},
    "global": {"margin": "marginGlobal.xls", "pe": "peGlobal.xls", "pbv": "pbvGlobal.xls",
               "ps": "psGlobal.xls", "debt": "dbtfundGlobal.xls", "roe": "roeGlobal.xls",
               "hist": "histgrGlobal.xls", "wc": "wcdataGlobal.xls"},
}
# (métrica, archivo, encabezado de la columna en el Excel de Damodaran)
COLUMNS = [
    ("n", "margin", "Number of firms"),
    ("gross_margin", "margin", "Gross Margin"),
    ("op_margin", "margin", "Pre-tax Unadjusted Operating Margin"),
    ("net_margin", "margin", "Net Margin"),
    ("ebitda_margin", "margin", "EBITDA/Sales"),
    ("cogs_sales", "margin", "COGS/Sales"),
    ("roe", "roe", "ROE (unadjusted)"),
    ("roic", "pbv", "ROIC"),
    ("pe", "pe", "Aggregate Mkt Cap/ Trailing Net Income (only money making firms)"),
    ("peg", "pe", "PEG Ratio"),
    ("pb", "pbv", "PBV"),
    ("ps", "ps", "Price/Sales"),
    ("book_debt_capital", "debt", "Book Debt to Capital"),
    ("debt_ebitda", "debt", "Debt to EBITDA"),
    ("interest_coverage", "debt", "Interest Coverage Ratio"),
    ("rev_cagr5", "hist", "CAGR in Revenues- Last 5 years"),
    ("ni_cagr5", "hist", "CAGR in Net Income- Last 5 years"),
    ("ar_sales", "wc", "Acc Rec/ Sales"),
    ("inv_sales", "wc", "Inventory/Sales"),
]
US_EXCHANGES = {"NasdaqGS", "NasdaqGM", "NasdaqCM", "NYSE", "NYSEAM", "NYSEArca", "BATS", "CBOE",
                "OTCPK", "OTCQX", "OTCQB"}
STOP = {"inc", "corp", "corporation", "co", "company", "ltd", "limited", "plc", "sa", "ag", "nv",
        "holdings", "holding", "group", "the", "de", "adr", "spa", "se", "ab", "asa", "oyj", "sab",
        "cv", "lp", "llc", "incorporated", "ads", "class", "cl", "new", "publ"}


def _norm(name: str) -> str:
    n = re.sub(r"\(.*?\)", "", (name or "").lower()).replace(".", "")
    n = re.sub(r"[^a-z0-9 ]", " ", n.split("/")[0])
    return " ".join(t for t in n.split() if t not in STOP)


def _get(url: str, path: Path) -> Path:
    if path.exists() and time.time() - path.stat().st_mtime < CACHE_DAYS * 86400:
        return path
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=120)
    r.raise_for_status()
    path.write_bytes(r.content)
    return path


def _num(v):
    return v if isinstance(v, (int, float)) and v == v else None


def _read_industries(path: Path) -> tuple[dict, str | None]:
    """{industria: {encabezado: valor}} de la hoja 'Industry Averages', y fecha de actualización."""
    import xlrd
    book = xlrd.open_workbook(str(path))
    updated = None
    sh = book.sheet_by_name("Industry Averages")
    for i in range(min(sh.nrows, 3)):
        row = sh.row_values(i)
        if str(row[0]).startswith("Date updated") and _num(row[1]):
            updated = (date(1899, 12, 30) + timedelta(days=int(row[1]))).isoformat()
    head = None
    out = {}
    for i in range(sh.nrows):
        row = sh.row_values(i)
        if head is None:
            if str(row[0]).strip() == "Industry Name":
                head = [str(c).strip() for c in row]
            continue
        name = str(row[0]).strip()
        if name:
            out[name] = {h: row[j] for j, h in enumerate(head) if h}
    return out, updated


class Industries:
    def __init__(self, cache_dir: Path):
        self.dir = cache_dir / "damodaran"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.bench = {"us": {}, "global": {}}
        self.updated = None
        for region, files in FILES.items():
            tables = {}
            for key, fname in files.items():
                tables[key], upd = _read_industries(_get(BASE + fname, self.dir / fname))
                self.updated = self.updated or upd
            names = set(tables["margin"])
            for ind in names:
                m = {}
                for out_key, fkey, header in COLUMNS:
                    row = tables[fkey].get(ind, {})
                    m[out_key] = _num(row.get(header))
                # derivados para comparar con nuestras métricas
                b = m.pop("book_debt_capital")
                m["de"] = b / (1 - b) if b is not None and b < 1 else None   # D/(D+E) -> D/E
                ar, inv, cogs = m.pop("ar_sales"), m.pop("inv_sales"), m.pop("cogs_sales")
                m["ar_turnover"] = 1 / ar if ar else None                    # ventas / cobrar
                m["inv_turnover"] = cogs / inv if cogs and inv else None      # costo / inventario
                self.bench[region][ind] = m
        self._load_names()

    def _load_names(self):
        import openpyxl
        path = _get(BASE + "indname.xlsx", self.dir / "indname.xlsx")
        ws = openpyxl.load_workbook(path, read_only=True)["By industry"]
        self.by_ticker, self.by_name = {}, defaultdict(list)
        sic_count = defaultdict(Counter)
        for i, r in enumerate(ws.iter_rows(values_only=True)):
            if i == 0 or not r or not r[1]:
                continue
            name, ext, ind, _sector, sic, country = r[:6]
            ex, _, tk = str(ext).partition(":")
            us = country == "United States"
            if ex in US_EXCHANGES:
                self.by_ticker.setdefault(tk.upper().replace("-", "."), (ind, us))
                self.by_ticker.setdefault(tk.upper().split(".")[0] + "*", (ind, us))  # clase A/B
            self.by_name[_norm(str(name))].append((ind, us))
            if sic:
                code = str(sic)
                for k in (code, "3:" + code[:3], "2:" + code[:2]):
                    sic_count[k][ind] += 1
        self.by_sic = {s: c.most_common(1)[0][0] for s, c in sic_count.items()}

    def match(self, ticker: str, name: str, sic: int, foreign: bool):
        """(industria, región, método) o (None, None, None)."""
        tk = ticker.upper().replace("-", ".")
        hit = self.by_ticker.get(tk) or self.by_ticker.get(tk.split(".")[0] + "*")
        method = "ticker"
        if not hit:
            cands = self.by_name.get(_norm(name))
            if cands:
                hit, method = cands[0], "nombre"
        if hit:
            ind, us = hit
            return ind, ("us" if us else "global"), method
        s = str(sic or "")
        if s and s != "0":
            for k in (s, "3:" + s[:3], "2:" + s[:2]):  # SIC exacto, luego más general
                if k in self.by_sic:
                    return self.by_sic[k], ("global" if foreign else "us"), "sic"
        return None, None, None

    def dump(self, path: Path, used: set):
        """Escribe industries.json solo con las industrias que usa algún CEDEAR."""
        data = {"meta": {"source": "Aswath Damodaran, NYU Stern", "updated": self.updated,
                         "url": "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/data.html"},
                "us": {k: v for k, v in self.bench["us"].items() if ("us", k) in used},
                "global": {k: v for k, v in self.bench["global"].items() if ("global", k) in used}}
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
