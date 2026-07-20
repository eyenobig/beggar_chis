#!/usr/bin/env python3
"""
Batch download all Pokémon front sprites and convert to JS data.

Output:
  src/data/pokemon/001.js … 493.js   — one file per Pokémon
  Each file: export default { id, palette, indices }

Usage:
  python tools/batch_sprites.py               # all 1-493
  python tools/batch_sprites.py 25            # single ID
  python tools/batch_sprites.py 1 151         # ID range (inclusive)

Requirements:
  pip install Pillow
"""

import sys
import json
import io
import time
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow not found.  Run: pip install Pillow")

GRID = 80
ALPHA_THRESHOLD = 32
MAX_COLORS = 254          # 0 = transparent, 1-254 = color index+1
OUT_DIR = Path(__file__).parent.parent / "src" / "data" / "pokemon"

# 直接精灵图 URL（默认 front）
BASE_URL = (
    "https://raw.githubusercontent.com/PokeAPI/sprites/master"
    "/sprites/pokemon/versions/generation-iv/platinum/{id}.png"
)

# ── 带代理的下载 ────────────────────────────────────────────────────────────
def make_opener():
    """Return a urllib opener that respects the system proxy."""
    proxies = urllib.request.getproxies()
    if proxies:
        handler = urllib.request.ProxyHandler(proxies)
    else:
        handler = urllib.request.ProxyHandler({})
    return urllib.request.build_opener(handler)

OPENER = make_opener()

def fetch_image(pokemon_id: int) -> "Image.Image | None":
    url = BASE_URL.format(id=pokemon_id)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "sprite-tool/1.0"})
        with OPENER.open(req, timeout=15) as resp:
            data = resp.read()
        return Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception as e:
        print(f"  [{pokemon_id:03d}] SKIP — {e}")
        return None


# ── 图像 → palette + indices ────────────────────────────────────────────────
def img_to_data(img: "Image.Image") -> dict:
    orig_w, orig_h = img.size
    resample = Image.Resampling.LANCZOS if (orig_w > GRID or orig_h > GRID) else Image.Resampling.NEAREST
    img = img.resize((GRID, GRID), resample)

    pixels = list(img.getdata())
    color_map: dict[str, int] = {}
    palette: list[str] = []
    indices: list[int] = []

    for r, g, b, a in pixels:
        if a < ALPHA_THRESHOLD:
            indices.append(-1)
            continue
        hex_c = f"#{r:02x}{g:02x}{b:02x}"
        if hex_c not in color_map:
            if len(palette) >= MAX_COLORS:
                best = min(
                    range(len(palette)),
                    key=lambda i: abs(int(palette[i][1:3], 16) - r)
                                + abs(int(palette[i][3:5], 16) - g)
                                + abs(int(palette[i][5:7], 16) - b),
                )
                indices.append(best)
                continue
            color_map[hex_c] = len(palette)
            palette.append(hex_c)
        indices.append(color_map[hex_c])

    return {"palette": palette, "indices": indices}


# ── 写 JS 文件 ──────────────────────────────────────────────────────────────
def write_js(pokemon_id: int, data: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{pokemon_id:03d}.js"

    idx = data["indices"]
    rows = []
    for r in range(GRID):
        rows.append("  " + ",".join(str(v) for v in idx[r * GRID:(r + 1) * GRID]))
    indices_str = "[\n" + ",\n".join(rows) + "\n]"

    path.write_text(
        f"export default {{\n"
        f"  id: {pokemon_id},\n"
        f"  palette: {json.dumps(data['palette'])},\n"
        f"  indices: {indices_str},\n"
        f"}}\n",
        encoding="utf-8",
    )


# ── 主流程 ──────────────────────────────────────────────────────────────────
def process(pokemon_id: int) -> bool:
    out = OUT_DIR / f"{pokemon_id:03d}.js"
    if out.exists():
        print(f"  [{pokemon_id:03d}] skip (already exists)")
        return True

    img = fetch_image(pokemon_id)
    if img is None:
        return False

    data = img_to_data(img)
    write_js(pokemon_id, data)

    transparent = data["indices"].count(-1)
    opaque = GRID * GRID - transparent
    print(
        f"  [{pokemon_id:03d}] OK — {len(data['palette'])} colors "
        f"| {opaque} opaque | {transparent} transparent"
    )
    return True


def main():
    args = sys.argv[1:]
    if len(args) == 0:
        id_range = range(1, 494)
    elif len(args) == 1:
        id_range = range(int(args[0]), int(args[0]) + 1)
    else:
        id_range = range(int(args[0]), int(args[1]) + 1)

    proxies = urllib.request.getproxies()
    print(f"Proxy: {proxies.get('http', 'none')}")
    print(f"Processing {len(id_range)} sprite(s) → {OUT_DIR}\n")

    ok = fail = 0
    for pid in id_range:
        success = process(pid)
        (ok if success else fail).__class__  # just a no-op
        if success:
            ok += 1
        else:
            fail += 1
        time.sleep(0.03)

    print(f"\nDone: {ok} OK, {fail} failed/skipped")
    print(f"Files in: {OUT_DIR}")


if __name__ == "__main__":
    main()
