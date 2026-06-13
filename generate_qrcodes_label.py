#!/usr/bin/env python3
"""
CSC Prüf-App — QR-Code Generator für Etikettendrucker (P-touch / TZe-Band)
Erstellt einzelne PNG-Etiketten pro Bereich, optimiert für schmale Bänder.

Formate (wähle unten):
  - 24mm Band: 24mm × 70mm (empfohlen, kleinste Breite für scanbaren QR)
  - 18mm Band: 18mm × 60mm (QR sehr klein, Grenzwertig)
  - 36mm Band: 36mm × 70mm (beste Lesbarkeit)
"""

import qrcode
from PIL import Image, ImageDraw, ImageFont
import os

BASE_URL = "https://thomasschmoldt1967-cpu.github.io/csc-pruefapp"

bereiche = [
    # (bereich_id, standort_name, bereich_name, liste_name)
    ("aufzug_1",        "Raschplatz 5", "Aufzug",                       "Aufzug-Kontrolle"),
    ("bst_eg",          "Raschplatz 5", "Brandschutz EG",               "Brandschutztür"),
    ("bst_og1",         "Raschplatz 5", "Brandschutz 1.OG",             "Brandschutztür"),
    ("bst_og2",         "Raschplatz 5", "Brandschutz 2.OG",             "Brandschutztür"),
    ("bst_og3",         "Raschplatz 5", "Brandschutz 3.OG",             "Brandschutztür"),
    ("bst_kg",          "Raschplatz 5", "Brandschutz KG",               "Brandschutztür"),
    ("notbel_th01",     "Raschplatz 5", "Notbel. TH 01",                "Notbeleuchtung"),
    ("notbel_th05",     "Raschplatz 5", "Notbel. TH 05",                "Notbeleuchtung"),
    ("notbel_anliefeg", "Raschplatz 5", "Notbel. Anlieferung EG",       "Notbeleuchtung"),
    ("notbel_keller",   "Raschplatz 5", "Notbel. Keller",               "Notbeleuchtung"),
    ("notbel_eingang",  "Raschplatz 5", "Notbel. Eingang",              "Notbeleuchtung"),
]

# ── Etiketten-Format wählen ──────────────────────────────────────────────────
# "24mm" = 24mm × 70mm  | "18mm" = 18mm × 60mm  | "36mm" = 36mm × 70mm
BAND_BREITE = "24mm"

DPI = 180  # P-touch native: 180dpi

def mm2px(mm_val):
    return int(mm_val / 25.4 * DPI)

FORMATE = {
    "18mm": (mm2px(18), mm2px(55)),
    "24mm": (mm2px(24), mm2px(60)),
    "36mm": (mm2px(36), mm2px(70)),
}

W, H = FORMATE[BAND_BREITE]

OUT_DIR = f"/opt/data/csc-pruefapp/etiketten_{BAND_BREITE}"
os.makedirs(OUT_DIR, exist_ok=True)

# Fonts
def load_fonts():
    base = "/usr/share/fonts/truetype/dejavu/"
    try:
        return {
            "bold":   ImageFont.truetype(base + "DejaVuSans-Bold.ttf",  max(8, mm2px(3.0))),
            "medium": ImageFont.truetype(base + "DejaVuSans-Bold.ttf",  max(7, mm2px(2.4))),
            "small":  ImageFont.truetype(base + "DejaVuSans.ttf",       max(6, mm2px(1.8))),
            "tiny":   ImageFont.truetype(base + "DejaVuSans.ttf",       max(5, mm2px(1.4))),
        }
    except:
        f = ImageFont.load_default()
        return {"bold": f, "medium": f, "small": f, "tiny": f}

fonts = load_fonts()

def wrap_text(draw, text, font, max_width):
    """Text umbrechen wenn zu breit."""
    words = text.split()
    lines, line = [], []
    for w in words:
        test = " ".join(line + [w])
        bb = draw.textbbox((0, 0), test, font=font)
        if bb[2] > max_width and line:
            lines.append(" ".join(line))
            line = [w]
        else:
            line.append(w)
    if line:
        lines.append(" ".join(line))
    return lines

def make_label(bereich_id, standort, bereich_name, liste):
    """Erstellt ein Etikett im Hochformat für P-touch Schriftband."""
    url = f"{BASE_URL}/index.html?bereich={bereich_id}"

    # QR-Code generieren — möglichst kompakt
    qr_size_px = W - mm2px(2)  # fast volle Breite
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,  # M = kleinere Module
        box_size=max(2, qr_size_px // 25),
        border=1
    )
    qr.add_data(url)
    qr.make(fit=True)
    img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img_qr = img_qr.resize((qr_size_px, qr_size_px), Image.LANCZOS)

    # Etikett-Canvas (weiß)
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    # ── Dunkler Header (volle Breite) ──
    header_h = mm2px(5)
    d.rectangle([0, 0, W, header_h], fill="#1a3a5c")
    d.text((W // 2, header_h // 2), "CSC", fill="white", font=fonts["bold"], anchor="mm")

    # ── QR-Code zentriert darunter ──
    qr_y = header_h + mm2px(0.5)
    qr_x = (W - qr_size_px) // 2
    img.paste(img_qr, (qr_x, qr_y))

    # ── Bereichsname unter QR ──
    text_y = qr_y + qr_size_px + mm2px(0.8)
    margin = mm2px(1)
    lines = wrap_text(d, bereich_name, fonts["medium"], W - 2 * margin)
    for ln in lines:
        d.text((W // 2, text_y), ln, fill="#1a3a5c", font=fonts["medium"], anchor="mt")
        bb = d.textbbox((0, 0), ln, font=fonts["medium"])
        text_y += (bb[3] - bb[1]) + mm2px(0.3)

    # ── Listennname (klein, grau) ──
    text_y += mm2px(0.2)
    liste_lines = wrap_text(d, liste, fonts["small"], W - 2 * margin)
    for ln in liste_lines:
        d.text((W // 2, text_y), ln, fill="#888888", font=fonts["small"], anchor="mt")
        bb = d.textbbox((0, 0), ln, font=fonts["small"])
        text_y += (bb[3] - bb[1]) + mm2px(0.2)

    # ── Trennlinie + Fußzeile direkt unter letztem Text ──
    foot_y = text_y + mm2px(1.5)
    d.rectangle([margin, foot_y, W - margin, foot_y + 1], fill="#cccccc")
    d.text((W // 2, foot_y + mm2px(1.5)), "Scan → Prüf-App", fill="#aaaaaa",
           font=fonts["tiny"], anchor="mm")

    # Etikett auf tatsächliche Inhaltshöhe zuschneiden
    actual_h = foot_y + mm2px(4)
    actual_h = max(actual_h, mm2px(30))  # mindestens 30mm
    img = img.crop((0, 0, W, int(actual_h)))

    return img


def make_overview_sheet():
    """
    Erstellt ein A4-ähnliches Übersichtsblatt mit allen Etiketten nebeneinander
    → zum Ausdrucken auf normalem Drucker als Referenz / Vorschau.
    """
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm as rl_mm

    out_pdf = f"/opt/data/csc-pruefapp/CSC_Etiketten_{BAND_BREITE}_Uebersicht.pdf"
    c = rl_canvas.Canvas(out_pdf, pagesize=A4)
    page_w, page_h = A4
    pad = 8 * rl_mm
    label_w_mm = float(BAND_BREITE.replace("mm", ""))
    # Höhe des Etiketts in mm
    label_h_mm = H / DPI * 25.4

    cols = max(1, int((page_w - 2 * pad) / ((label_w_mm + 4) * rl_mm)))
    col_step = (page_w - 2 * pad) / cols

    x_off = pad
    y_off = page_h - pad

    for i, (bid, standort, bname, liste) in enumerate(bereiche):
        col = i % cols
        row = i // cols

        x = x_off + col * col_step
        y = y_off - (row + 1) * (label_h_mm * rl_mm + 4 * rl_mm)

        if y < pad:
            c.showPage()
            y_off = page_h - pad
            row = 0
            y = y_off - (label_h_mm * rl_mm + 4 * rl_mm)

        img_path = os.path.join(OUT_DIR, f"{bid}.png")
        c.drawImage(img_path, x, y,
                    width=label_w_mm * rl_mm,
                    height=label_h_mm * rl_mm,
                    preserveAspectRatio=True, anchor='nw')

    c.save()
    print(f"✅ Übersichts-PDF: {out_pdf}")


# ── Main ─────────────────────────────────────────────────────────────────────
print(f"🏷️  Erstelle Etiketten für {BAND_BREITE} Band ({W}×{H}px @ {DPI}dpi)")
print(f"   Ordner: {OUT_DIR}\n")

for bid, standort, bname, liste in bereiche:
    img = make_label(bid, standort, bname, liste)
    out_path = os.path.join(OUT_DIR, f"{bid}.png")
    img.save(out_path, dpi=(DPI, DPI))
    print(f"  ✓ {bname:35s} → {bid}.png  ({W}×{H}px)")

print(f"\n✅ {len(bereiche)} Etiketten erstellt in: {OUT_DIR}")

# Übersichts-PDF
try:
    make_overview_sheet()
except Exception as e:
    print(f"⚠️  Übersichts-PDF übersprungen: {e}")

print("\n📋 Drucken mit P-touch:")
print(f"   Bandbreite: {BAND_BREITE} TZe")
print(f"   Etikettengröße: {W/DPI*25.4:.0f}mm × {H/DPI*25.4:.0f}mm")
print(f"   Auflösung: {DPI} dpi")
print(f"   Druckbefehl (Brother P-touch Editor oder lp):")
print(f"   Oder PNG-Dateien direkt in P-touch Editor importieren")
