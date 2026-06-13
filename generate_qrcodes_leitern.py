#!/usr/bin/env python3
"""
CSC Prüf-App — QR-Code Etiketten für Leitern (24mm × 60mm)
Erstellt 20 Etiketten: leiter_01 bis leiter_20
"""

import qrcode
from PIL import Image, ImageDraw, ImageFont
import os

BASE_URL = "https://thomasschmoldt1967-cpu.github.io/csc-pruefapp"

# 20 Leitern-Einträge
bereiche = [(f"leiter_{i:02d}", "CSC Hannover", f"Leiter {i:02d}", "Leiterkontrolle") for i in range(1, 21)]

BAND_BREITE = "24mm"
DPI = 180

def mm2px(mm_val):
    return int(mm_val / 25.4 * DPI)

W = mm2px(24)
H = mm2px(60)

OUT_DIR = "/opt/data/csc-pruefapp/etiketten_leitern"
os.makedirs(OUT_DIR, exist_ok=True)

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
    url = f"{BASE_URL}/index.html?bereich={bereich_id}"

    qr_size_px = W - mm2px(2)
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=max(2, qr_size_px // 25),
        border=1
    )
    qr.add_data(url)
    qr.make(fit=True)
    img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img_qr = img_qr.resize((qr_size_px, qr_size_px), Image.LANCZOS)

    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    # Header
    header_h = mm2px(5)
    d.rectangle([0, 0, W, header_h], fill="#1a3a5c")
    d.text((W // 2, header_h // 2), "CSC", fill="white", font=fonts["bold"], anchor="mm")

    # QR-Code
    qr_y = header_h + mm2px(0.5)
    qr_x = (W - qr_size_px) // 2
    img.paste(img_qr, (qr_x, qr_y))

    # Bereichsname (z. B. "Leiter 01")
    text_y = qr_y + qr_size_px + mm2px(0.8)
    margin = mm2px(1)
    lines = wrap_text(d, bereich_name, fonts["medium"], W - 2 * margin)
    for ln in lines:
        d.text((W // 2, text_y), ln, fill="#1a3a5c", font=fonts["medium"], anchor="mt")
        bb = d.textbbox((0, 0), ln, font=fonts["medium"])
        text_y += (bb[3] - bb[1]) + mm2px(0.3)

    # Listenname (grau klein)
    text_y += mm2px(0.2)
    liste_lines = wrap_text(d, liste, fonts["small"], W - 2 * margin)
    for ln in liste_lines:
        d.text((W // 2, text_y), ln, fill="#888888", font=fonts["small"], anchor="mt")
        bb = d.textbbox((0, 0), ln, font=fonts["small"])
        text_y += (bb[3] - bb[1]) + mm2px(0.2)

    # Trennlinie + Fußzeile
    foot_y = text_y + mm2px(1.5)
    d.rectangle([margin, foot_y, W - margin, foot_y + 1], fill="#cccccc")
    d.text((W // 2, foot_y + mm2px(1.5)), "Scan → Prüf-App", fill="#aaaaaa",
           font=fonts["tiny"], anchor="mm")

    actual_h = foot_y + mm2px(4)
    actual_h = max(actual_h, mm2px(30))
    img = img.crop((0, 0, W, int(actual_h)))
    return img


def make_overview_pdf():
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm as rl_mm

    out_pdf = "/opt/data/csc-pruefapp/CSC_Etiketten_Leitern_24mm.pdf"
    c = rl_canvas.Canvas(out_pdf, pagesize=A4)
    page_w, page_h = A4
    pad = 10 * rl_mm
    label_w_mm = 24
    label_h_mm = 60
    gap_x = 4 * rl_mm
    gap_y = 4 * rl_mm

    cols = max(1, int((page_w - 2 * pad + gap_x) / (label_w_mm * rl_mm + gap_x)))
    col_step = label_w_mm * rl_mm + gap_x
    row_step = label_h_mm * rl_mm + gap_y

    for i, (bid, standort, bname, liste) in enumerate(bereiche):
        col = i % cols
        row = (i // cols) % int((page_h - 2 * pad + gap_y) / row_step)
        page_row = i // (cols * int((page_h - 2 * pad + gap_y) / row_step))

        if i > 0 and i % (cols * int((page_h - 2 * pad + gap_y) / row_step)) == 0:
            c.showPage()

        col_in_page = i % cols
        row_in_page = (i // cols) % int((page_h - 2 * pad + gap_y) / row_step)

        x = pad + col_in_page * col_step
        y = page_h - pad - (row_in_page + 1) * row_step + gap_y

        img_path = os.path.join(OUT_DIR, f"{bid}.png")
        c.drawImage(img_path, x, y,
                    width=label_w_mm * rl_mm,
                    height=label_h_mm * rl_mm,
                    preserveAspectRatio=True, anchor='nw')

        # Beschriftung unter Etikett
        c.setFont("Helvetica", 7)
        c.setFillColorRGB(0.5, 0.5, 0.5)
        c.drawCentredString(x + label_w_mm * rl_mm / 2, y - 3 * rl_mm, bname)

    c.save()
    print(f"✅ Übersichts-PDF: {out_pdf}")
    return out_pdf


# ── Main ──────────────────────────────────────────────────────────────────────
print(f"🪜  Erstelle 20 Leitern-Etiketten (24mm × 60mm @ {DPI}dpi)")
print(f"   Ordner: {OUT_DIR}\n")

for bid, standort, bname, liste in bereiche:
    img = make_label(bid, standort, bname, liste)
    out_path = os.path.join(OUT_DIR, f"{bid}.png")
    img.save(out_path, dpi=(DPI, DPI))
    print(f"  ✓ {bname}")

print(f"\n✅ 20 Etiketten erstellt in: {OUT_DIR}")

try:
    pdf_path = make_overview_pdf()
    print(f"📄 PDF: {pdf_path}")
except Exception as e:
    print(f"⚠️  PDF übersprungen: {e}")
