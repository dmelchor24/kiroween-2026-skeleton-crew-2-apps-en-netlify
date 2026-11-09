# Design: system-design

## Palette (edit here)

> **How to change the colors:** edit the hexadecimal values in the *Dark* / *Light* columns and then tell Kiro **"apply design"**. You can also ask "use the Ocean Blue palette" and Kiro will copy the values from the example palettes below. Required format: `#RRGGBB` (6 digits).

| Token | Dark | Light | What it is for |
|---|---|---|---|
| `--bg` | `#1C1B1A` | `#F5F2ED` | Page background |
| `--card` | `#242220` | `#FFFFFF` | Cards, top bar, side menu |
| `--card-border` | `#34302B` | `#E0D9CE` | Borders and dividers |
| `--text` | `#EDEAE4` | `#1C1B1A` | Main text |
| `--text-muted` | `#9A948A` | `#6B6560` | Secondary text and labels |
| `--accent` | `#C9A227` | `#A07D10` | Brand color: buttons, links, focus |
| `--accent-hover` | `#DDB32D` | `#B8941E` | Brand button on hover |
| `--accent-dim` | `#6B5C22` | `#F0E4B8` | Soft background of selected items |
| `--on-accent` | `#1C1B1A` | `#1C1B1A` | Text/icons over `--accent` |
| `--error` | `#D9695A` | `#C0392B` | Errors |
| `--success` | `#4ADE80` | `#059669` | Connected / success |
| `--offline` | `#F87171` | `#F87171` | Offline indicator |
| `--track` | `#34302B` | `#E0D9CE` | Progress tracks |
| `--input-bg` | `#1A1918` | `#F0EDE8` | Text field background |
| `--input-placeholder` | `#5B564D` | `#A09890` | Placeholder text in fields |
| `--syntax-key` | `#7EAED8` | `#2C5F8A` | JSON: keys |
| `--syntax-str` | `#A8D8A8` | `#4A7A4A` | JSON: strings |
| `--syntax-bool` | `#F5A623` | `#B8761A` | JSON: true/false/null |

### Fonts

| Variable | Font | Google Fonts weights | Use |
|---|---|---|---|
| `--font-display` | Space Grotesk | 500;600 | Headings |
| `--font-body` | Inter | 400;500;600 | General text |
| `--font-mono` | IBM Plex Mono | 500 | Code, labels, JSON |

To change a font: replace the name and weights in the table and say "apply design". The Google Fonts URL is composed like this: `https://fonts.googleapis.com/css2?family=<Name+with+plus+signs>:wght@<weights separated by ;>&family=...&display=swap`.

### Shape

| Variable | Value | Use |
|---|---|---|
| `--radius` | `10px` | Cards and panels |
| `--radius-sm` | `6px` | Fields and buttons |

### Example palettes (only the listed tokens change; the rest are kept)

**Ocean Blue**

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0F1A2B` | `#EEF3FA` |
| `--card` | `#16243A` | `#FFFFFF` |
| `--card-border` | `#223551` | `#D3DEEE` |
| `--text` | `#E6EDF7` | `#0F1A2B` |
| `--text-muted` | `#8EA0BA` | `#5A6B85` |
| `--accent` | `#3B82F6` | `#1D4ED8` |
| `--accent-hover` | `#5B9BF8` | `#1E40AF` |
| `--accent-dim` | `#1E3A66` | `#DBE7FF` |
| `--on-accent` | `#0B1220` | `#FFFFFF` |
| `--track` | `#223551` | `#D3DEEE` |
| `--input-bg` | `#0C1524` | `#E6EDF7` |
| `--input-placeholder` | `#5A6B85` | `#8EA0BA` |

**Forest Green**

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#121A16` | `#F0F5F2` |
| `--card` | `#1A2420` | `#FFFFFF` |
| `--card-border` | `#28372F` | `#D5E2DA` |
| `--text` | `#E8F0EB` | `#121A16` |
| `--text-muted` | `#93A89B` | `#5D7466` |
| `--accent` | `#34D399` | `#047857` |
| `--accent-hover` | `#5BE3B0` | `#065F46` |
| `--accent-dim` | `#1D5A44` | `#CDEFE0` |
| `--on-accent` | `#0E1613` | `#FFFFFF` |
| `--track` | `#28372F` | `#D5E2DA` |
| `--input-bg` | `#0E1613` | `#E4EEE8` |
| `--input-placeholder` | `#5D7466` | `#93A89B` |

## How it is applied

1. Kiro reads the tables above and rewrites `pwa/src/styles/tokens.css` and `web/src/styles/tokens.css` (identical content in both apps) with exactly this structure: Google Fonts `@import` → `:root` (dark + fonts + shape) → `html.theme-light` (light). Hex values are written in uppercase.
2. Kiro runs the inline **apply-palette** block (below) from the repository root: `python3 - <<'PY' ... PY`. It is not saved as a file. The script syncs `web/src/styles/tokens.css` with the one in `pwa/`, and updates the manifest and the icons that only exist in `pwa/public/`.
3. If the script prints `WARNING contrast...` lines, Kiro reports them to the user and suggests an alternative value, but leaves the palette applied.
4. Kiro warns that the service worker keeps files in cache: on iPhone/Mac you have to close and reopen the app to see the change (or bump `CACHE_VERSION` in `pwa/public/sw.js`). The `web/` app has no service worker: a reload is enough.

## Rules for the rest of the project

- Colors: always `var(--token)`. Transparencies: `color-mix(in srgb, var(--token) N%, transparent)`.
- Fonts: always `var(--font-display|body|mono)`. No HTML links Google Fonts: `tokens.css` does it.
- Each HTML (in `web/` and in `pwa/`) loads `<link rel="stylesheet" href="/src/styles/tokens.css">` in the `<head>`.
- The project has **two self-contained apps** (`web/` and `pwa/`). See "Folder structure" in `02-web-portal/design.md`. The PWA is the only one with a manifest and icons.

## Files produced by this spec

The following blocks are the exact content. Paths without a `web/` or `pwa/` prefix that start with `src/` are created **identical in `web/` and in `pwa/`** (for example `src/styles/tokens.css` → `web/src/styles/tokens.css` and `pwa/src/styles/tokens.css`). Those starting with `public/` only exist in `pwa/`. `tokens.css` is the result of applying the default palette; `manifest.webmanifest` is the base that the script updates; the `apply-palette` script runs inline and is NOT saved.

#### `src/styles/tokens.css` (in `web/` and in `pwa/`)

````css
/* tokens.css — GENERATED from .kiro/specs/01-system-design/design.md
 * To change colors or fonts, edit the table in that file and say "apply design".
 * The hex values in this file are the ONLY source of colors in the project. */

@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap");

:root {
  /* ---- Dark mode (default) ---- */
  --bg: #1C1B1A;
  --card: #242220;
  --card-border: #34302B;
  --text: #EDEAE4;
  --text-muted: #9A948A;
  --accent: #C9A227;
  --accent-hover: #DDB32D;
  --accent-dim: #6B5C22;
  --on-accent: #1C1B1A;
  --error: #D9695A;
  --success: #4ADE80;
  --offline: #F87171;
  --track: #34302B;
  --input-bg: #1A1918;
  --input-placeholder: #5B564D;
  --syntax-key: #7EAED8;
  --syntax-str: #A8D8A8;
  --syntax-bool: #F5A623;

  /* ---- Typography ---- */
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;

  /* ---- Shape ---- */
  --radius: 10px;
  --radius-sm: 6px;
}

/* ---- Light mode ---- */
html.theme-light {
  --bg: #F5F2ED;
  --card: #FFFFFF;
  --card-border: #E0D9CE;
  --text: #1C1B1A;
  --text-muted: #6B6560;
  --accent: #A07D10;
  --accent-hover: #B8941E;
  --accent-dim: #F0E4B8;
  --on-accent: #1C1B1A;
  --error: #C0392B;
  --success: #059669;
  --offline: #F87171;
  --track: #E0D9CE;
  --input-bg: #F0EDE8;
  --input-placeholder: #A09890;
  --syntax-key: #2C5F8A;
  --syntax-str: #4A7A4A;
  --syntax-bool: #B8761A;
}
````

#### `public/manifest.webmanifest` (`pwa/` only)

````json
{
  "name": "Kiroween 2026",
  "short_name": "Kiroween 2026",
  "description": "Portal with a chat over a knowledge base and an IAM policy generator.",
  "lang": "en",
  "start_url": "/index.html",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#1C1B1A",
  "theme_color": "#1C1B1A",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
````

#### `apply-palette.py`

````python
"""Syncs the PWA manifest and icons with the palette in pwa/src/styles/tokens.css
and copies those tokens to web/src/styles/tokens.css (both apps use the same colors).

Usage (inline, no .sh files):  python3 apply-palette.py
In the spec it runs as  python3 - <<'PY' ... PY  and is not saved in the repository.
Only uses the Python standard library.
"""
import json, re, struct, zlib, pathlib

ROOT = pathlib.Path(".")
tokens = (ROOT / "pwa/src/styles/tokens.css").read_text(encoding="utf-8")
web_tokens = ROOT / "web/src/styles/tokens.css"
web_tokens.parent.mkdir(parents=True, exist_ok=True)
web_tokens.write_text(tokens, encoding="utf-8")  # same palette in the web app
dark_block = re.search(r":root\s*\{(.*?)\n\}", tokens, re.S).group(1)

def token(name):
    m = re.search(rf"--{name}:\s*(#[0-9A-Fa-f]{{6}})", dark_block)
    if not m:
        raise SystemExit(f"Token --{name} not found in tokens.css (:root)")
    return m.group(1).upper()

def rgb(hexcolor):
    h = hexcolor.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

BG, ACCENT, ON_ACCENT = token("bg"), token("accent"), token("on-accent")

# 0) minimum WCAG AA contrast (4.5:1) in both modes: only warns, does not block
def luminance(hexcolor):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in rgb(hexcolor))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

light_block = re.search(r"html\.theme-light\s*\{(.*?)\n\}", tokens, re.S).group(1)
for mode, block in (("dark", dark_block), ("light", light_block)):
    def tk(name, blk=block):
        m = re.search(rf"--{name}:\s*(#[0-9A-Fa-f]{{6}})", blk)
        return m.group(1) if m else token(name)
    for fg, bgc in (("text", "bg"), ("text", "card"), ("on-accent", "accent"), ("text-muted", "card")):
        ratio = contrast(tk(fg), tk(bgc))
        if round(ratio, 1) < 4.5:
            print(f"WARNING contrast {mode} mode: --{fg} over --{bgc} = {ratio:.1f}:1 (minimum 4.5:1)")

# 1) manifest.webmanifest: PWA startup colors
mpath = ROOT / "pwa/public/manifest.webmanifest"
manifest = json.loads(mpath.read_text(encoding="utf-8"))
manifest["background_color"] = BG
manifest["theme_color"] = BG
mpath.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# 2) PNG icons: --accent background with an --on-accent check mark
def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return ((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2) ** 0.5

def render(size, scale):
    """scale = proportion of the canvas the mark occupies (maskable uses less)."""
    bg, fg = rgb(ACCENT), rgb(ON_ACCENT)
    pts = [(0.28, 0.52), (0.44, 0.68), (0.74, 0.34)]
    pts = [(0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale) for x, y in pts]
    half_w = 0.075 * scale
    ss = 3  # supersampling for smooth edges
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    px, py = (x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size
                    d = min(seg_dist(px, py, *pts[0], *pts[1]), seg_dist(px, py, *pts[1], *pts[2]))
                    hits += d <= half_w
            a = hits / (ss * ss)
            row += bytes(round(bg[i] * (1 - a) + fg[i] * a) for i in range(3))
        rows.append(bytes(row))
    return b"".join(rows)

def png(path, size, scale):
    raw = render(size, scale)
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    data = (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

icons = ROOT / "pwa/public/icons"
png(icons / "apple-touch-icon.png", 180, 1.0)      # iOS supports neither transparency nor SVG
png(icons / "icon-192.png", 192, 1.0)
png(icons / "icon-512.png", 512, 1.0)
png(icons / "icon-maskable-512.png", 512, 0.7)     # 80 % safe zone
print(f"Palette applied: bg={BG} accent={ACCENT} on-accent={ON_ACCENT}")
````
