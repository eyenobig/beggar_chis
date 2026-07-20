#!/usr/bin/env python3
"""
Convert a sprite PNG to JS palette+indices data for the 80x80 progress grid.

Usage:
  python tools/sprite_to_js.py <image.png> <export_name>

  <export_name>  camelCase JS identifier, e.g. bulbasaur, pikachu

Output:
  Prints JS snippet to stdout. Append to src/data/sprites.js

Example:
  python tools/sprite_to_js.py ~/pikachu.png pikachu >> src/data/sprites.js

Data format:
  palette  — list of '#rrggbb' hex strings (unique opaque colors)
  indices  — flat array of 6400 integers (80*80), row-major order
             -1  = transparent cell (rendered with diagonal line)
              N  = index into palette array

Requirements:
  pip install Pillow
"""

import sys
import json
from pathlib import Path
from PIL import Image

GRID = 80
ALPHA_THRESHOLD = 32   # pixels with alpha < this are treated as transparent
MAX_COLORS = 256       # safety cap; sprites typically use far fewer


def to_js_array(values, cols=80):
    """Format flat list as compact multi-line JS array."""
    rows = []
    for r in range(0, len(values), cols):
        chunk = values[r : r + cols]
        rows.append("    " + ",".join(str(v) for v in chunk))
    return "[\n" + ",\n".join(rows) + "\n  ]"


def sprite_to_js(path: str, name: str) -> None:
    img = Image.open(path).convert("RGBA")

    # Scale to 80×80 — use LANCZOS for smooth downscale, NEAREST for upscale
    orig_w, orig_h = img.size
    resample = Image.LANCZOS if orig_w > GRID or orig_h > GRID else Image.NEAREST
    img = img.resize((GRID, GRID), resample)

    pixels = list(img.getdata())  # list of (R, G, B, A)

    # Build palette from opaque pixels
    color_map: dict[str, int] = {}
    palette: list[str] = []
    indices: list[int] = []

    for r, g, b, a in pixels:
        if a < ALPHA_THRESHOLD:
            indices.append(-1)
        else:
            hex_color = f"#{r:02x}{g:02x}{b:02x}"
            if hex_color not in color_map:
                if len(palette) >= MAX_COLORS:
                    # Find closest existing color (simple L2 in RGB)
                    best = min(
                        range(len(palette)),
                        key=lambda i: sum(
                            (int(palette[i][j:j+2], 16) - v) ** 2
                            for j, v in zip((1, 3, 5), (r, g, b))
                        ),
                    )
                    indices.append(best)
                    continue
                color_map[hex_color] = len(palette)
                palette.append(hex_color)
            indices.append(color_map[hex_color])

    transparent_count = indices.count(-1)
    opaque_count = len(indices) - transparent_count

    print(f"// {Path(path).name}  →  {len(palette)} colors  "
          f"| {opaque_count} opaque  {transparent_count} transparent")
    print(f"export const {name} = {{")
    print(f"  palette: {json.dumps(palette)},")
    print(f"  indices: {to_js_array(indices)},")
    print(f"}}")
    print()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    sprite_to_js(sys.argv[1], sys.argv[2])
