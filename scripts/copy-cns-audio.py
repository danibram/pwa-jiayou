#!/usr/bin/env python3
"""Copy the CNS11643 syllable clips this app actually plays.

Reads Voice.zip (female.zip + male.zip) from the 全字庫 open data and writes
mono MP3s to public/audio/{f,m}/, plus the list of stems in
src/data/syllable-clips.json.

Source: 數位發展部，CNS11643中文標準交換碼全字庫網站
https://www.cns11643.gov.tw
政府資料開放授權條款-第1版

Refresh steps: docs/audio.md
"""

from __future__ import annotations

import io
import json
import re
import subprocess
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audio_notice import write_notice

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
OUT = ROOT / "public" / "audio"

PLAIN = {
    "ā": "a", "á": "a", "ǎ": "a", "à": "a",
    "ē": "e", "é": "e", "ě": "e", "è": "e",
    "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
    "ō": "o", "ó": "o", "ǒ": "o", "ò": "o",
    "ū": "u", "ú": "u", "ǔ": "u", "ù": "u",
    "ǖ": "v", "ǘ": "v", "ǚ": "v", "ǜ": "v",
    "ü": "v", "ê": "eh",
}
TONES = {
    "ā": 1, "ē": 1, "ī": 1, "ō": 1, "ū": 1, "ǖ": 1,
    "á": 2, "é": 2, "í": 2, "ó": 2, "ú": 2, "ǘ": 2,
    "ǎ": 3, "ě": 3, "ǐ": 3, "ǒ": 3, "ǔ": 3, "ǚ": 3,
    "à": 4, "è": 4, "ì": 4, "ò": 4, "ù": 4, "ǜ": 4,
}


def syllable_key(syllable: str) -> str | None:
    tone = None
    base: list[str] = []
    for ch in syllable.strip().lower():
        if ch in TONES:
            tone = TONES[ch]
        if ch in PLAIN:
            base.append(PLAIN[ch])
        elif "a" <= ch <= "z":
            base.append(ch)
    stem = "".join(base)
    if not stem:
        return None
    resolved = tone if tone is not None else 5
    return stem if resolved == 1 else f"{stem}{resolved}"


def tokens(pinyin: str) -> list[str]:
    return [part for part in re.split(r"[\s,;/]+", pinyin) if part]


def load_character_rows() -> list[dict]:
    rows: list[dict] = []
    for path in sorted(DATA.glob("hsk*.json")):
        rows.extend(json.loads(path.read_text()))
    pack_dir = ROOT / "public" / "packs"
    if pack_dir.exists():
        for path in sorted(pack_dir.glob("hsk*.json")):
            rows.extend(json.loads(path.read_text()))
    return rows


def needed_keys() -> set[str]:
    rows = load_character_rows()
    chars: dict[str, str] = {row["character"]: row["pinyin"] for row in rows}
    examples: list[tuple[str, str]] = []
    for row in rows:
        example = row.get("example") or {}
        if example.get("pinyin") and example.get("word"):
            examples.append((example["word"], example["pinyin"]))
    for path in sorted((DATA / "glosses").glob("*.json")):
        for value in json.loads(path.read_text()).values():
            example = value.get("example") or {}
            if example.get("pinyin"):
                examples.append((example["word"], example["pinyin"]))

    keys: set[str] = set()
    for pinyin in chars.values():
        for token in tokens(pinyin):
            key = syllable_key(token)
            if key:
                keys.add(key)
    for word, pinyin in examples:
        syls = tokens(pinyin)
        hanzi = list(word)
        aligned = len(hanzi) == len(syls)
        for index, token in enumerate(syls):
            key = syllable_key(token)
            if key:
                keys.add(key)
            if not aligned:
                continue
            cited = tokens(chars.get(hanzi[index], ""))
            if not cited:
                continue
            citation = syllable_key(cited[0])
            if citation:
                keys.add(citation)
    return keys


def encode(src: bytes, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            "pipe:0",
            "-ac",
            "1",
            "-ar",
            "24000",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "64k",
            str(dest),
        ],
        input=src,
        check=True,
    )


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: copy-cns-audio.py Voice.zip")
    outer = zipfile.ZipFile(sys.argv[1])
    packs = {
        "f": zipfile.ZipFile(io.BytesIO(outer.read("female.zip"))),
        "m": zipfile.ZipFile(io.BytesIO(outer.read("male.zip"))),
    }
    index = {
        voice: {name.split("_", 1)[1].rsplit(".", 1)[0]: name for name in pack.namelist()}
        for voice, pack in packs.items()
    }
    keys = sorted(key for key in needed_keys() if key in index["f"] and key in index["m"])
    missing = sorted(needed_keys() - set(keys))
    if missing:
        print("no clip for", ", ".join(missing))

    jobs: list[tuple[bytes, Path]] = []
    for voice, pack in packs.items():
        for key in keys:
            jobs.append((pack.read(index[voice][key]), OUT / voice / f"{key}.mp3"))

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda job: encode(*job), jobs))

    (DATA / "syllable-clips.json").write_text(json.dumps(keys, ensure_ascii=False, indent=2) + "\n")
    write_notice(OUT / "NOTICE.txt")
    print(f"{len(keys)} syllables, {len(jobs)} files")


if __name__ == "__main__":
    main()
