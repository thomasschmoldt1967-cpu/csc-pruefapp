#!/usr/bin/env python3
"""
CSC Prüf-App — QR-Code Generator
Erstellt druckfertige QR-Codes für alle Bereiche als PDF
"""
import qrcode
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
import os, io

BASE_URL = "https://csc-pruef.de"  # <- hier eure Domain eintragen

bereiche = [
    # (bereich_id, standort_name, bereich_name, liste_name)
    ("aufzug_1",        "Raschplatz 5", "Aufzug 1",                     "Aufzug-Wartungskontrolle"),
    ("bst_eg",          "Raschplatz 5", "Brandschutztür EG",             "Brandschutztür"),
    ("bst_og1",         "Raschplatz 5", "Brandschutztür 1. OG",          "Brandschutztür"),
    ("bst_og2",         "Raschplatz 5", "Brandschutztür 2. OG",          "Brandschutztür"),
    ("bst_og3",         "Raschplatz 5", "Brandschutztür 3. OG",          "Brandschutztür"),
    ("bst_kg",          "Raschplatz 5", "Brandschutztür KG",             "Brandschutztür"),
    ("notbel_th01",     "Raschplatz 5", "Notbeleuchtung Treppenhaus 01", "Notbeleuchtung"),
    ("notbel_th05",     "Raschplatz 5", "Notbeleuchtung Treppenhaus 05", "Notbeleuchtung"),
    ("notbel_anliefeg", "Raschplatz 5", "Notbeleuchtung Anlieferzone EG","Notbeleuchtung"),
    ("notbel_keller",   "Raschplatz 5", "Notbeleuchtung Kellerbereich",  "Notbeleuchtung"),
    ("notbel_eingang",  "Raschplatz 5", "Notbeleuchtung Eingang",        "Notbeleuchtung"),
]

OUT_DIR = "/opt/data/csc-pruefapp/qrcodes"
os.makedirs(OUT_DIR, exist_ok=True)

def make_qr_image(bereich_id, standort, bereich_name, liste):
    url = f"{BASE_URL}/index.html?bereich={bereich_id}"
    qr = qrcode.QRCode(version=2, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=8, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    # Canvas für Aufkleber: 55mm x 70mm @ 150dpi
    W, H = 325, 415
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    # Blaue Header-Leiste
    d.rectangle([0, 0, W, 52], fill="#1a3a5c")
    # CSC Logo-Text
    d.rectangle([8, 8, 68, 44], fill="#e8a020")

    try:
        font_bold  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
        font_tiny  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
        font_logo  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
    except:
        font_bold = font_small = font_tiny = font_logo = ImageFont.load_default()

    d.text((10, 14), "CSC", fill="#1a3a5c", font=font_logo)
    d.text((78, 10), "CSC Hannover", fill="white", font=font_bold)
    d.text((78, 34), "Prüf-App", fill="#e8a020", font=font_small)

    # QR Code einsetzen
    qr_size = 220
    qr_resized = img_qr.resize((qr_size, qr_size))
    qr_x = (W - qr_size) // 2
    img.paste(qr_resized, (qr_x, 62))

    # Bereich-Info
    y = 295
    d.text((W//2, y), standort, fill="#666666", font=font_tiny, anchor="mm")
    y += 20

    # Bereichsname (ggf. umbrechen)
    words = bereich_name.split()
    lines, line = [], []
    for w in words:
        test = " ".join(line + [w])
        bb = d.textbbox((0,0), test, font=font_bold)
        if bb[2] > W - 20 and line:
            lines.append(" ".join(line)); line = [w]
        else:
            line.append(w)
    if line: lines.append(" ".join(line))
    for ln in lines:
        d.text((W//2, y), ln, fill="#1a3a5c", font=font_bold, anchor="mm")
        y += 28

    y += 4
    d.text((W//2, y), liste, fill="#555555", font=font_small, anchor="mm")

    # Trennlinie
    d.rectangle([20, H-36, W-20, H-35], fill="#dddddd")
    d.text((W//2, H-22), "Scan mit CSC Prüf-App", fill="#aaaaaa", font=font_tiny, anchor="mm")

    return img

# PDF erstellen — 4 QR-Codes pro A4-Seite
def make_pdf():
    out_path = "/opt/data/csc-pruefapp/CSC_QR-Codes_Raschplatz5.pdf"
    c = rl_canvas.Canvas(out_path, pagesize=A4)
    W_page, H_page = A4

    cols, rows = 2, 2
    pad = 10 * mm
    cell_w = (W_page - 3 * pad) / cols
    cell_h = (H_page - 3 * pad) / rows

    idx = 0
    while idx < len(bereiche):
        for row in range(rows):
            for col in range(cols):
                if idx >= len(bereiche): break
                bid, standort, bname, liste = bereiche[idx]
                x = pad + col * (cell_w + pad)
                y = H_page - pad - cell_h - row * (cell_h + pad)

                img = make_qr_image(bid, standort, bname, liste)
                img_path = os.path.join(OUT_DIR, f"{bid}.png")
                img.save(img_path)

                # Rahmen
                c.setStrokeColorRGB(0.7, 0.7, 0.7)
                c.setLineWidth(0.5)
                c.rect(x, y, cell_w, cell_h)

                # QR-Bild einsetzen
                margin = 4 * mm
                c.drawImage(img_path, x + margin, y + margin,
                            width=cell_w - 2*margin, height=cell_h - 2*margin,
                            preserveAspectRatio=True, anchor='c')
                idx += 1

        if idx < len(bereiche):
            c.showPage()

    c.save()
    print(f"✅ PDF gespeichert: {out_path}")
    print(f"✅ {len(bereiche)} QR-Code-Bilder in: {OUT_DIR}")

make_pdf()
