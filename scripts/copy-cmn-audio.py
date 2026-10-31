#!/usr/bin/env python3
"""Copy the Chen Wang syllables this app plays.

Sparse-clones https://github.com/hugolpz/audio-cmn (or updates the checkout
already in .cache/audio-cmn) and copies 64k/syllabs into public/audio/c/.
The files are not re-encoded. src/data/syllable-clips-cmn.json lists the
stems that arrived. Syllables the set lacks stay out of that list, and the
player uses the woman's clip for them.

Pass a directory if you already have the repo somewhere else:

    python3 scripts/copy-cmn-audio.py ~/src/audio-cmn
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from audio_notice import write_notice

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "audio-cmn"
REPO = "https://github.com/hugolpz/audio-cmn.git"
DATA = ROOT / "src" / "data"
OUT = ROOT / "public" / "audio" / "c"
CLIPS = DATA / "syllable-clips.json"


def cmn_name(key: str) -> str:
    """CNS stems drop the 1 on tone 1. audio-cmn always writes the number."""
    stem = key if key[-1].isdigit() else f"{key}1"
    return f"cmn-{stem}.mp3"


def checkout(dest: Path) -> None:
    if (dest / ".git").is_dir():
        subprocess.run(["git", "-C", str(dest), "pull", "--ff-only"], check=True)
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "git",
            "clone",
            "--depth",
            "1",
            "--filter=blob:none",
            "--sparse",
            REPO,
            str(dest),
        ],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(dest), "sparse-checkout", "set", "64k/syllabs"],
        check=True,
    )


def syllabs_dir(source: Path) -> Path:
    direct = source / "64k" / "syllabs"
    if direct.is_dir():
        return direct
    nested = source / "syllabs"
    if nested.is_dir():
        return nested
    sys.exit(f"no 64k/syllabs directory in {source}")


def main() -> None:
    if len(sys.argv) > 2:
        sys.exit("usage: copy-cmn-audio.py [path-to-audio-cmn]")
    if len(sys.argv) == 2:
        folder = syllabs_dir(Path(sys.argv[1]).expanduser().resolve())
    else:
        checkout(CACHE)
        folder = syllabs_dir(CACHE)

    wanted = json.loads(CLIPS.read_text())
    copied: list[str] = []
    missing: list[str] = []
    OUT.mkdir(parents=True, exist_ok=True)
    for key in wanted:
        src = folder / cmn_name(key)
        if not src.is_file():
            missing.append(key)
            continue
        (OUT / f"{key}.mp3").write_bytes(src.read_bytes())
        copied.append(key)

    stale = [path for path in OUT.glob("*.mp3") if path.stem not in copied]
    for path in stale:
        path.unlink()

    (DATA / "syllable-clips-cmn.json").write_text(
        json.dumps(copied, ensure_ascii=False, indent=2) + "\n"
    )
    write_notice(ROOT / "public" / "audio" / "NOTICE.txt")
    print(f"{len(copied)} syllables from {folder}")
    if missing:
        print("no Chen Wang clip for", ", ".join(missing))


if __name__ == "__main__":
    main()
