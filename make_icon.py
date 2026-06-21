from PIL import Image
import numpy as np

# CSC Logo laden
logo = Image.open('logo.png').convert('RGBA')
print(f"Original Logo: {logo.size}, mode: {logo.mode}")

# Weißen Hintergrund transparent machen
data = np.array(logo)
r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
mask = (r > 230) & (g > 230) & (b > 230)
data[:,:,3][mask] = 0
logo_transparent = Image.fromarray(data)

# Icon-Größen erstellen
for size in [192, 512]:
    # Hintergrund: CSC Blau #1a3a5c
    icon = Image.new('RGBA', (size, size), (26, 58, 92, 255))

    # Logo skalieren: 75% Breite, zentriert
    logo_w = int(size * 0.75)
    logo_ratio = logo_transparent.width / logo_transparent.height
    logo_h = int(logo_w / logo_ratio)

    # Höhe begrenzen auf 60%
    if logo_h > int(size * 0.6):
        logo_h = int(size * 0.6)
        logo_w = int(logo_h * logo_ratio)

    logo_scaled = logo_transparent.resize((logo_w, logo_h), Image.LANCZOS)

    # Zentriert platzieren
    x = (size - logo_w) // 2
    y = (size - logo_h) // 2

    icon.paste(logo_scaled, (x, y), logo_scaled)

    filename = f'icon-{size}.png'
    icon.save(filename, 'PNG')
    print(f"Erstellt: {filename} ({size}x{size}), Logo-Pos ({x},{y}), Logo-Größe {logo_w}x{logo_h}")

print("Fertig!")
