#!/usr/bin/env python3
"""
CSC Prüf-App — QR-Code Etiketten 50mm × 80mm
Hochformat: blauer Header oben, QR-Code mitte, Text unten
300 dpi (Etikettendrucker Standard)
"""

import qrcode
from PIL import Image, ImageDraw, ImageFont
import os, zipfile

BASE_URL = "https://thomasschmoldt1967-cpu.github.io/csc-pruefapp"

bereiche = [
    ("aufzug_1",        "Raschplatz 5", "Aufzug",              "Aufzug-Kontrolle"),
    ("bst_eg",          "Raschplatz 5", "Brandschutztür EG",   "Brandschutztür"),
    ("bst_og1",         "Raschplatz 5", "Brandschutztür 1.OG", "Brandschutztür"),
    ("bst_og2",         "Raschplatz 5", "Brandschutztür 2.OG", "Brandschutztür"),
    ("bst_og3",         "Raschplatz 5", "Brandschutztür 3.OG", "Brandschutztür"),
    ("bst_kg",          "Raschplatz 5", "Brandschutztür KG",   "Brandschutztür"),
    ("notbel_th01",     "Raschplatz 5", "Notbeleuchtung TH 01","Notbeleuchtung"),
    ("notbel_th05",     "Raschplatz 5", "Notbeleuchtung TH 05","Notbeleuchtung"),
    ("notbel_anliefeg", "Raschplatz 5", "Notbel. Anlieferung EG","Notbeleuchtung"),
    ("notbel_keller",   "Raschplatz 5", "Notbel. Keller",      "Notbeleuchtung"),
    ("notbel_eingang",  "Raschplatz 5", "Notbel. Eingang",     "Notbeleuchtung"),
]

DPI = 300
def mm(v): return int(v / 25.4 * DPI)

W = mm(50)   # 591 px
H = mm(80)   # 945 px

OUT_DIR = "/opt/data/csc-pruefapp/etiketten_50x80"
os.makedirs(OUT_DIR, exist_ok=True)

# ── Fonts ────────────────────────────────────────────────────────────────────
base_font = "/usr/share/fonts/truetype/dejavu/"
try:
    f_logo   = ImageFont.truetype(base_font + "DejaVuSans-Bold.ttf",  mm(5.5))
    f_header = ImageFont.truetype(base_font + "DejaVuSans-Bold.ttf",  mm(4.2))
    f_sub    = ImageFont.truetype(base_font + "DejaVuSans.ttf",       mm(3.0))
    f_bold   = ImageFont.truetype(base_font + "DejaVuSans-Bold.ttf",  mm(4.8))
    f_small  = ImageFont.truetype(base_font + "DejaVuSans.ttf",       mm(3.2))
    f_tiny   = ImageFont.truetype(base_font + "DejaVuSans.ttf",       mm(2.5))
except:
    f = ImageFont.load_default()
    f_logo = f_header = f_sub = f_bold = f_small = f_tiny = f

def wrap(draw, text, font, max_w):
    words = text.split()
    lines, line = [], []
    for w in words:
        test = " ".join(line + [w])
        bb = draw.textbbox((0,0), test, font=font)
        if bb[2] > max_w and line:
            lines.append(" ".join(line)); line = [w]
        else:
            line.append(w)
    if line: lines.append(" ".join(line))
    return lines

def make_label(bid, standort, name, liste):
    url = f"{BASE_URL}/index.html?bereich={bid}"

    # QR-Code
    qr_size = mm(38)
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=max(4, qr_size // 25),
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img_qr = img_qr.resize((qr_size, qr_size), Image.LANCZOS)

    # Canvas
    img = Image.new("RGB", (W, H), "white")
    d   = ImageDraw.Draw(img)

    # ── Header-Bereich (dunkelblau) ──
    header_h = mm(14)
    d.rectangle([0, 0, W, header_h], fill="#1a3a5c")

    # Gelbes CSC-Badge links
    badge_x1, badge_y1 = mm(3), mm(2.5)
    badge_x2, badge_y2 = mm(14), mm(11.5)
    d.rectangle([badge_x1, badge_y1, badge_x2, badge_y2], fill="#e8a020")
    d.text(((badge_x1+badge_x2)//2, (badge_y1+badge_y2)//2),
           "CSC", fill="#1a3a5c", font=f_logo, anchor="mm")

    # "CSC Hannover" + "Prüf-App" rechts vom Badge
    d.text((mm(16), mm(3.5)), "CSC Hannover", fill="white",   font=f_header, anchor="lt")
    d.text((mm(16), mm(8.5)), "Prüf-App",     fill="#e8a020", font=f_sub,    anchor="lt")

    # ── QR-Code zentriert ──
    qr_y = header_h + mm(4)
    qr_x = (W - qr_size) // 2
    img.paste(img_qr, (qr_x, qr_y))

    # ── Standort (grau, klein) ──
    text_y = qr_y + qr_size + mm(3)
    d.text((W//2, text_y), standort, fill="#888888", font=f_small, anchor="mt")
    bb = d.textbbox((0,0), standort, font=f_small)
    text_y += (bb[3]-bb[1]) + mm(1.5)

    # ── Bereichsname (fett, dunkelblau) ──
    margin = mm(3)
    name_lines = wrap(d, name, f_bold, W - 2*margin)
    for ln in name_lines:
        d.text((W//2, text_y), ln, fill="#1a3a5c", font=f_bold, anchor="mt")
        bb = d.textbbox((0,0), ln, font=f_bold)
        text_y += (bb[3]-bb[1]) + mm(1)

    # ── Listenname (grau) ──
    text_y += mm(0.5)
    liste_lines = wrap(d, liste, f_small, W - 2*margin)
    for ln in liste_lines:
        d.text((W//2, text_y), ln, fill="#666666", font=f_small, anchor="mt")
        bb = d.textbbox((0,0), ln, font=f_small)
        text_y += (bb[3]-bb[1]) + mm(0.8)

    # ── Trennlinie + Fußzeile ──
    foot_y = H - mm(6)
    d.rectangle([margin, foot_y, W-margin, foot_y+1], fill="#cccccc")
    d.text((W//2, foot_y + mm(2.5)), "Scan mit CSC Prüf-App",
           fill="#aaaaaa", font=f_tiny, anchor="mm")

    return img

# ── Generieren ───────────────────────────────────────────────────────────────
print(f"🏷️  50mm × 80mm Etiketten @ {DPI}dpi  ({W}×{H}px)")
print(f"   → {OUT_DIR}\n")

paths = []
for bid, standort, name, liste in bereiche:
    img  = make_label(bid, standort, name, liste)
    path = os.path.join(OUT_DIR, f"{bid}.png")
    img.save(path, dpi=(DPI, DPI))
    paths.append(path)
    print(f"  ✓ {name:30s} → {bid}.png")

# ── ZIP ──────────────────────────────────────────────────────────────────────
zip_path = "/opt/data/csc-pruefapp/CSC_Etiketten_50x80.zip"
with zipfile.ZipFile(zip_path, "w") as z:
    for p in paths:
        z.write(p, os.path.basename(p))

print(f"\n✅ {len(bereiche)} Etiketten erstellt")
print(f"   ZIP: {zip_path}")
print(f"   Format: 50mm × 80mm @ {DPI}dpi")
