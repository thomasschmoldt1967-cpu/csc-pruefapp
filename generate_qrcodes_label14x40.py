#!/usr/bin/env python3
"""
CSC Prüf-App — QR-Code Etiketten 14mm × 40mm
Querformat: QR-Code links | Text rechts
180 dpi (Brother P-touch native)
"""

import qrcode
from PIL import Image, ImageDraw, ImageFont
import os, zipfile

BASE_URL = "https://thomasschmoldt1967-cpu.github.io/csc-pruefapp"

bereiche = [
    ("aufzug_1",        "Aufzug",              "Aufzug-Kontrolle"),
    ("bst_eg",          "Brandschutz EG",      "Brandschutztür"),
    ("bst_og1",         "Brandschutz 1.OG",    "Brandschutztür"),
    ("bst_og2",         "Brandschutz 2.OG",    "Brandschutztür"),
    ("bst_og3",         "Brandschutz 3.OG",    "Brandschutztür"),
    ("bst_kg",          "Brandschutz KG",      "Brandschutztür"),
    ("notbel_th01",     "Notbel. TH 01",       "Notbeleuchtung"),
    ("notbel_th05",     "Notbel. TH 05",       "Notbeleuchtung"),
    ("notbel_anliefeg", "Notbel. Anlieferung", "Notbeleuchtung"),
    ("notbel_keller",   "Notbel. Keller",      "Notbeleuchtung"),
    ("notbel_eingang",  "Notbel. Eingang",     "Notbeleuchtung"),
]

DPI    = 180
def mm(v): return int(v / 25.4 * DPI)

# Etikett-Maße: 40mm breit × 14mm hoch (Querformat)
W = mm(40)   # 283 px
H = mm(14)   # 99 px

OUT_DIR = "/opt/data/csc-pruefapp/etiketten_14x40"
os.makedirs(OUT_DIR, exist_ok=True)

# ── Fonts ────────────────────────────────────────────────────────────────────
base_font = "/usr/share/fonts/truetype/dejavu/"
try:
    f_bold   = ImageFont.truetype(base_font + "DejaVuSans-Bold.ttf", mm(3.2))
    f_small  = ImageFont.truetype(base_font + "DejaVuSans.ttf",      mm(2.4))
    f_tiny   = ImageFont.truetype(base_font + "DejaVuSans.ttf",      mm(1.9))
except:
    f_bold = f_small = f_tiny = ImageFont.load_default()

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

def make_label(bid, name, liste):
    url = f"{BASE_URL}/index.html?bereich={bid}"

    # QR-Code: so klein wie möglich, aber scanbar
    qr_area = H - mm(2)          # fast volle Höhe für QR
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=max(2, qr_area // 21),
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img_qr = img_qr.resize((qr_area, qr_area), Image.LANCZOS)

    # Canvas
    img = Image.new("RGB", (W, H), "white")
    d   = ImageDraw.Draw(img)

    # ── Linke Seite: dunkelblauer Streifen + CSC-Text ──
    stripe_w = mm(5)
    d.rectangle([0, 0, stripe_w, H], fill="#1a3a5c")
    # "CSC" vertikal zentriert
    d.text((stripe_w // 2, H // 2), "CSC", fill="white", font=f_tiny, anchor="mm")

    # ── QR-Code direkt rechts vom Streifen ──
    qr_x = stripe_w + mm(0.5)
    qr_y = (H - qr_area) // 2
    img.paste(img_qr, (qr_x, qr_y))

    # ── Text rechts vom QR ──
    text_x  = qr_x + qr_area + mm(1.2)
    text_w  = W - text_x - mm(0.5)
    line_y  = mm(1.5)

    # Bereichsname (fett, umbrechen)
    name_lines = wrap(d, name, f_bold, text_w)
    for ln in name_lines:
        d.text((text_x, line_y), ln, fill="#1a3a5c", font=f_bold, anchor="lt")
        bb = d.textbbox((0,0), ln, font=f_bold)
        line_y += (bb[3] - bb[1]) + mm(0.3)

    # Listenname (klein, grau)
    liste_lines = wrap(d, liste, f_tiny, text_w)
    line_y += mm(0.3)
    for ln in liste_lines:
        d.text((text_x, line_y), ln, fill="#888888", font=f_tiny, anchor="lt")
        bb = d.textbbox((0,0), ln, font=f_tiny)
        line_y += (bb[3] - bb[1]) + mm(0.2)

    return img

# ── Alle Etiketten generieren ────────────────────────────────────────────────
print(f"🏷️  14mm × 40mm Etiketten @ {DPI}dpi  ({W}×{H}px)")
print(f"   → {OUT_DIR}\n")

paths = []
for bid, name, liste in bereiche:
    img  = make_label(bid, name, liste)
    path = os.path.join(OUT_DIR, f"{bid}.png")
    img.save(path, dpi=(DPI, DPI))
    paths.append(path)
    print(f"  ✓ {name:30s} → {bid}.png")

# ── ZIP packen ───────────────────────────────────────────────────────────────
zip_path = "/opt/data/csc-pruefapp/CSC_Etiketten_14x40.zip"
with zipfile.ZipFile(zip_path, "w") as z:
    for p in paths:
        z.write(p, os.path.basename(p))
    z.write("/opt/data/csc-pruefapp/generate_qrcodes_label14x40.py",
            "generate_qrcodes_label14x40.py")

print(f"\n✅ {len(bereiche)} Etiketten + ZIP erstellt")
print(f"   ZIP: {zip_path}")
print(f"\n📋 Drucken:")
print(f"   Band:    14mm TZe")
print(f"   Länge:   40mm pro Etikett")
print(f"   Import:  PNG in P-touch Editor laden, Bandbreite=14mm, Länge=40mm")
