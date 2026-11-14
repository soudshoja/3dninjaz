"""
Extract the owner's cost-tracker workbook into the LOCAL git-ignored fixture (private data, repo is public - never commit it)
.planning/data/cost-tracker-2026-11.json (consumed by scripts/import-cost-tracker.ts).

Run:  python .planning/data/extract-cost-tracker.py "<path to 3D_Printing_Cost_Tracker.xlsx>"
(use plain `python`, not `python -I`; needs openpyxl)

Each fixture row = one data row of a tab: {tab, keyTab, num, sheetRow, cells, formulas, hash}.
  cells    : header text -> cached value (data_only=True); dates as YYYY-MM-DD
  formulas : header text -> formula text for cells that are formulas
  hash     : sha256 of the canonical JSON of {tab, num, cells}
"""
import datetime
import hashlib
import json
import os
import sys

import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\User\Downloads\3D_Printing_Cost_Tracker.xlsx"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cost-tracker-2026-11.json")

wf = openpyxl.load_workbook(SRC, data_only=False)
wv = openpyxl.load_workbook(SRC, data_only=True)

# tab -> (key used in import_key, header row, first data row, "is data row" column index, id column or None)
TABS = {
    "Machines": ("Machines", 4, 5, 5, None),
    "Supplies": ("Supplies", 5, 6, 6, 1),
    "Designer": ("Designer", 5, 6, 6, 1),
    "Marketing": ("Marketing", 5, 6, 6, 1),
    "Jo Melon": ("JoMelon", 6, 7, 6, 1),
    "Income & Funding": ("Income", 5, 6, 5, 1),
}


def norm(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v == int(v) and abs(v) < 1e15:
        return int(v)
    return v


def canon(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


rows = []
for tab, (keytab, hdr_row, first, data_col, id_col) in TABS.items():
    ws_f, ws_v = wf[tab], wv[tab]
    headers = {}
    for c in range(1, ws_v.max_column + 1):
        h = ws_v.cell(hdr_row, c).value
        headers[c] = str(h).strip() if h not in (None, "") else "col" + openpyxl.utils.get_column_letter(c)
    for r in range(first, ws_v.max_row + 1):
        if ws_v.cell(r, data_col).value is None:
            continue
        if tab == "Machines" and ws_v.cell(r, 1).value in (None, "TOTAL"):
            continue
        cells, formulas = {}, {}
        for c, h in headers.items():
            v = ws_v.cell(r, c).value
            f = ws_f.cell(r, c).value
            if v is not None:
                cells[h] = norm(v)
            if isinstance(f, str) and f.startswith("="):
                formulas[h] = f
        num = ws_v.cell(r, 1).value if tab == "Machines" else ws_v.cell(r, id_col).value
        if tab != "Machines":
            assert isinstance(num, int), (tab, r, num)
        row = {"tab": tab, "keyTab": keytab, "num": num, "sheetRow": r, "cells": cells, "formulas": formulas}
        row["hash"] = hashlib.sha256(canon({"tab": tab, "num": num, "cells": cells}).encode("utf-8")).hexdigest()
        rows.append(row)

# Cached values of the Summary tab (label -> value), kept for assertions only.
summary = {}
ws = wv["Summary"]
for r in range(1, ws.max_row + 1):
    label, val = ws.cell(r, 1).value, ws.cell(r, 2).value
    if label and isinstance(val, (int, float)):
        summary[str(label).strip()] = val

fixture = {
    "fixture": "cost-tracker-2026-11",
    "source": os.path.basename(SRC),
    "sourceSha256": hashlib.sha256(open(SRC, "rb").read()).hexdigest(),
    "summary": summary,
    "rows": rows,
}
with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(fixture, fh, ensure_ascii=False, indent=1)
    fh.write("\n")

from collections import Counter
print("wrote", OUT, "rows:", dict(Counter(r["tab"] for r in rows)))
