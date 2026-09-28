"""
KIZILKAN PLAYER v18.6.0 — Ay-yıldız simgeleri (Türk Bayrağı Kanunu oranları).

Resmî oranlar (G = bayrak yüksekliği; Wikipedia "Flag of Turkey" / Türk Bayrağı Kanunu, 1936):
  F  dış hilal çemberi çapı            = 1/2 G   -> R_dış = 0.25
  D  iç hilal çemberi çapı             = 2/5 G   -> R_iç  = 0.20
  C  iki çember merkezi arası          = 1/16 G  -> 0.0625
  B  yıldız çevrel çemberi çapı        = 1/4 G   -> R_yıldız = 0.125
  E  iç çember ile yıldız çemberi arası = 1/3 G  -> yıldız çemberinin hilale bakan kenarı
                                                     iç çemberin kenarından 1/3 G ötede
Kontrol: yıldızın hilale bakan ucu, hilal uçlarının dikey hizasını ~0.0154 G geçer (kaynakla aynı).
Yıldızın BİR UCU hilale (sola) bakar.

Kullanım: python tools/make-icons.py   (frontend/assets/images altına yazar)
"""
import math
import os
from PIL import Image, ImageDraw

BG = (10, 0, 0, 255)          # mevcut zemin
RED = (227, 10, 23, 255)      # bayrak kırmızısı (#E30A17), mevcut simgeyle aynı
SS = 4                        # süper örnekleme (kenar yumuşatma)

R_OUT, R_IN, C_OFF, R_STAR = 0.25, 0.20, 1 / 16, 0.125
STAR_LEFT = (C_OFF - R_IN) + 1 / 3          # yıldız çemberinin sol kenarı (dış merkeze göre)
STAR_CX = STAR_LEFT + R_STAR
TIP_X = (R_OUT ** 2 - R_IN ** 2 + C_OFF ** 2) / (2 * C_OFF)   # hilal uçlarının x'i
# Amblem sınırları (dış merkeze göre, G biriminde)
X_MIN = -R_OUT
X_MAX = STAR_CX + R_STAR * math.cos(math.radians(36))
EMBLEM_W = X_MAX - X_MIN
EMBLEM_CX = (X_MIN + X_MAX) / 2


def draw_emblem(size, width_frac, bg=BG):
    w, h = size
    W, H = w * SS, h * SS
    im = Image.new("RGBA", (W, H), bg)
    d = ImageDraw.Draw(im)
    scale = (w * width_frac * SS) / EMBLEM_W           # G -> piksel
    ox = W / 2 - EMBLEM_CX * scale                      # dış merkezin piksel x'i
    oy = H / 2

    def circle(cx, r, fill):
        d.ellipse([ox + (cx - r) * scale, oy - r * scale, ox + (cx + r) * scale, oy + r * scale], fill=fill)

    circle(0.0, R_OUT, RED)
    circle(C_OFF, R_IN, bg)
    pts = []
    r_in = R_STAR * math.sin(math.radians(18)) / math.sin(math.radians(54))
    for k in range(10):
        ang = math.radians(180 + k * 36)               # k=0: uç tam sola (hilale) bakar
        r = R_STAR if k % 2 == 0 else r_in
        pts.append((ox + (STAR_CX + r * math.cos(ang)) * scale, oy - r * math.sin(ang) * scale))
    d.polygon(pts, fill=RED)
    return im.resize((w, h), Image.LANCZOS)


def main():
    root = os.path.join(os.path.dirname(__file__), "..", "frontend", "assets", "images")
    print(f"hilal uçları x={TIP_X:.4f}G, yıldız sol ucu x={STAR_LEFT:.4f}G, taşma={TIP_X - STAR_LEFT:.4f}G (kaynak ~0.0154)")
    targets = {
        "icon.png": ((1024, 1024), 0.70),
        "adaptive-icon.png": ((1024, 1024), 0.50),   # Android güvenli alanı (%61 çember) içinde
        "favicon.png": ((256, 256), 0.72),
        "splash-image.png": ((336, 729), 0.33),
    }
    for name, (size, frac) in targets.items():
        draw_emblem(size, frac).save(os.path.join(root, name))
        print("yazıldı:", name, size)


if __name__ == "__main__":
    main()
