#!/usr/bin/env python3
"""Fill EN→ES cache for vocabulary/hskN.json when Translate APIs throttle.

Requires a venv with the `translators` package, e.g.:
  python3 -m venv /tmp/jiayou-translate
  /tmp/jiayou-translate/bin/pip install translators
  /tmp/jiayou-translate/bin/python scripts/localize-vocabulary-bulk.py --level 6

Then run `node scripts/localize-vocabulary.mjs` to apply curated overrides and
strip any leftover meaningEn fields.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import translators as ts

ROOT = Path(__file__).resolve().parents[1]
VOCAB = ROOT / "src" / "data" / "vocabulary"
CACHE_PATH = VOCAB / ".translate-cache.json"
ENGINES = ("sogou", "alibaba")


def load_cache() -> dict:
    if CACHE_PATH.exists():
        data = json.loads(CACHE_PATH.read_text())
    else:
        data = {}
    data.setdefault("byWord", {})
    data.setdefault("byEn", {})
    return data


def save_cache(cache: dict) -> None:
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n")


def translate(text: str) -> str:
    for engine in ENGINES:
        for attempt in range(3):
            try:
                out = ts.translate_text(text, translator=engine, from_language="en", to_language="es")
                out = (out or "").strip()
                if out and out.lower() != text.lower():
                    return out
            except Exception:
                time.sleep(0.8 * (attempt + 1))
        time.sleep(0.4)
    return ""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", type=int, action="append", dest="levels")
    args = parser.parse_args()
    levels = args.levels or [1, 2, 3, 4, 5, 6]

    cache = load_cache()
    pending: list[str] = []
    seen: set[str] = set()

    for level in levels:
        path = VOCAB / f"hsk{level}.json"
        rows = json.loads(path.read_text())
        for row in rows:
            if row["simplified"] in cache["byWord"]:
                continue
            en = (row.get("meaningEn") or row.get("meaning") or "").strip()
            if not en:
                continue
            if en in cache["byEn"]:
                cache["byWord"][row["simplified"]] = cache["byEn"][en]
                continue
            if en not in seen:
                seen.add(en)
                pending.append(en)

    print(f"pending unique: {len(pending)}")
    ok = 0
    fail: list[str] = []
    for index, phrase in enumerate(pending, 1):
        if phrase in cache["byEn"]:
            ok += 1
            continue
        es = translate(phrase)
        if es:
            cache["byEn"][phrase] = es
            ok += 1
        else:
            fail.append(phrase)
        if index % 30 == 0 or index == len(pending):
            save_cache(cache)
            print(f"{index}/{len(pending)} ok={ok} fail={len(fail)}", flush=True)
        time.sleep(0.25 + random.random() * 0.25)

    for level in levels:
        path = VOCAB / f"hsk{level}.json"
        rows = json.loads(path.read_text())
        for row in rows:
            en = (row.get("meaningEn") or row.get("meaning") or "").strip()
            es = cache["byWord"].get(row["simplified"]) or cache["byEn"].get(en)
            if es:
                row["meaning"] = es
                cache["byWord"][row["simplified"]] = es
            row.pop("meaningEn", None)
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")

    save_cache(cache)
    print(f"done fail={len(fail)}")


if __name__ == "__main__":
    main()
