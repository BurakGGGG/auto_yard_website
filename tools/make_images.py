#!/usr/bin/env python3
"""Sitenin görsellerini oyunun kaynaklarından üretir (derlemede çalışmaz; çıktılar depoya girer).

Kaynaklar (bu depo dışında):
  ~/Projects/car-town-remake/assets/branding/        logo, Play ikonu, adaptive katmanları
  ~/Projects/ct_shots/ekran_tarama/site_<dil>/      oyun kareleri (qa/ekran_tarama.gd, dev.json kaydı, 1920 genişlik)
  ~/Projects/ct_shots/ekran_tarama/site2_<dil>/     dekorlu garajlı kareler (featured.json kaydı)
  ~/Projects/ct_shots/arkadas/site_<dil>/           ARKADAŞLAR ekranı (qa/arkadaslar_qa.gd, örnek veri)
  ~/Projects/social_media/foto/arac_portreleri/     araç portreleri (döner tabla, krem zemin)
  src/assets/video/tanitim-720.mp4                  hero videosu (kapak ilk karesinden)

Kullanım: python3 -m venv /tmp/v && /tmp/v/bin/pip install pillow && /tmp/v/bin/python tools/make_images.py

Elle yapılan (betik dışı) adımlar:
  Hero videosu: ~/Projects/social_media/film/ham/{g2,restore,hurda,lux}_yatay.mp4 ve video/drag_yatay_1920x1080.mp4'ten
    ffmpeg ile 16,9 sn'lik sessiz kurgu → src/assets/video/tanitim-720.mp4 (crf 30) ve tanitim-480.mp4 (crf 31).
  Yazı tipleri: Google Fonts'un Baloo2[wght].ttf ve Nunito[wght].ttf dosyalarından pyftsubset (fonttools + brotli) ile
    yalnızca TR/EN/ES/DE/FR harfleri (Latin-1 Almanca/Fransızcayı kapsar): --unicodes="U+0020-007E,U+00A0-00FF,U+0131,U+011E-011F,U+0130,U+015E-015F,
    U+0152-0153,U+2010-2015,U+2018-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+20AC,U+20BA,U+2122,U+2190-2193,U+2212"
    --flavor=woff2 → src/assets/fonts/baloo2.woff2, nunito.woff2 (lisanslar OFL-*.txt).
Yazı tipi: Baloo 2 TTF (OFL) — https://github.com/google/fonts/raw/main/ofl/baloo2/Baloo2%5Bwght%5D.ttf
           yolu BALOO_TTF ortam değişkeniyle verilir (paylaşım görsellerindeki slogan için).
"""
import base64
import glob
import io
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HOME = os.path.expanduser("~")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "src", "assets")
BRAND = os.path.join(HOME, "Projects/car-town-remake/assets/branding")
SHOTS = os.path.join(HOME, "Projects/ct_shots/ekran_tarama")
FRIENDS = os.path.join(HOME, "Projects/ct_shots/arkadas")
PORTRAITS = os.environ.get("PORTRAITS_DIR", os.path.join(HOME, "Projects/social_media/foto/arac_portreleri"))
LANGS = ["tr", "en", "es", "de", "fr"]

# Özellik kareleri: ad → (klasör, dosya)
SHOT_SOURCES = {
    "tamir": ("site2_{l}", "12_dunya_arac_tamirde.png"),
    "hurdalik": ("site_{l}", "42_hurdalik.png"),
    "drag": ("site_{l}", "40_yaris_pist.png"),
    "modifiye": ("site_{l}", "21_garaj_modifiye_kategori.png"),
    "dekor": ("site2_{l}", "17_dekor.png"),
    "kasa": ("site_{l}", "23_magaza_son_kasa.png"),
    "koleksiyon": ("site_{l}", "37_koleksiyon.png"),
}
CARS = ["tofas_sahin", "anadol_a1", "ferrari_488_pista", "lambo_huracan", "aston_martin_db5", "ford_mustang_1967",
        "porsche_gt3", "lancia_delta_integrale", "vw_t1_bus", "tesla_model_y", "chevrolet_bel_air_1956", "lamborghini_miura"]
TAGLINES = {
    "tr": "Garajını kur, arabaları tamir et, pistte kazan!",
    "en": "Build your garage, fix cars, win on the strip!",
    "es": "¡Monta tu taller, repara coches y gana en la pista!",
    "de": "Bau deine Werkstatt, repariere Autos, siege auf der Strecke!",
    "fr": "Créez votre garage, réparez des voitures, gagnez sur la piste\u00a0!",
}
SOON = {"tr": "ÇOK YAKINDA GOOGLE PLAY'DE", "en": "COMING SOON TO GOOGLE PLAY", "es": "MUY PRONTO EN GOOGLE PLAY",
        "de": "BALD BEI GOOGLE PLAY", "fr": "BIENTÔT SUR GOOGLE PLAY"}
NAVY = (14, 33, 94)


def webp(im, path, width, quality=74):
    h = round(im.height * width / im.width)
    im.resize((width, h), Image.LANCZOS).save(path, "WEBP", quality=quality, method=6)
    return h


def brand():
    logo = Image.open(os.path.join(BRAND, "autoyard_logo.png")).convert("RGBA")
    logo = logo.crop(logo.getbbox())
    os.makedirs(os.path.join(ASSETS, "img/brand"), exist_ok=True)
    for w in (480, 960, 1440):
        webp(logo, os.path.join(ASSETS, f"img/brand/logo-{w}.webp"), w, 88)
    icon = Image.open(os.path.join(BRAND, "icon_512.png")).convert("RGBA")
    icon.save(os.path.join(ASSETS, "icon-512.png"), optimize=True)
    icon.resize((192, 192), Image.LANCZOS).save(os.path.join(ASSETS, "icon-192.png"), optimize=True)
    icon.convert("RGB").resize((180, 180), Image.LANCZOS).save(os.path.join(ASSETS, "apple-touch-icon.png"), optimize=True)
    bg = Image.open(os.path.join(BRAND, "adaptive_background_432.png")).convert("RGBA")
    fg = Image.open(os.path.join(BRAND, "adaptive_foreground_432.png")).convert("RGBA")
    Image.alpha_composite(bg, fg).resize((512, 512), Image.LANCZOS).convert("RGB").save(
        os.path.join(ASSETS, "icon-maskable-512.png"), optimize=True)
    icon.save(os.path.join(ROOT, "src/static/favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    buf = io.BytesIO()
    icon.resize((64, 64), Image.LANCZOS).save(buf, "PNG", optimize=True)
    with open(os.path.join(ASSETS, "favicon.svg"), "w") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" '
                'href="data:image/png;base64,%s"/></svg>' % base64.b64encode(buf.getvalue()).decode())
    return logo


def shots():
    out = os.path.join(ASSETS, "img/shots")
    os.makedirs(out, exist_ok=True)
    sizes = {}
    for lang in LANGS:
        sources = dict(SHOT_SOURCES)
        sources["arkadaslar"] = (os.path.join(FRIENDS, f"site_{lang}"), "1920x1163_03_arkadaslar.png")
        for name, (folder, file) in sources.items():
            path = os.path.join(SHOTS if not os.path.isabs(folder) else "", folder.format(l=lang), file)
            if not os.path.exists(path):
                # Kare numarası taramadaki durum sayısına göre kayar (filtreyle çekilen DE/FR kareleri): adıyla bul
                found = glob.glob(os.path.join(os.path.dirname(path), "[0-9][0-9]_" + file.split("_", 1)[1]))
                path = found[0] if found else path
            im = Image.open(path).convert("RGB")
            for w in (640, 1280):
                h = webp(im, os.path.join(out, f"{name}-{lang}-{w}.webp"), w)
            sizes[name] = (1280, h)
    return sizes


def cars():
    out = os.path.join(ASSETS, "img/cars")
    os.makedirs(out, exist_ok=True)
    for car in CARS:
        im = Image.open(os.path.join(PORTRAITS, f"{car}_onden_yatay.png")).convert("RGB")
        im = im.crop((60, 40, 1860, 1030))  # döner tabla + araç; kenar boşluğu kırpılır
        webp(im, os.path.join(out, f"{car}-640.webp"), 640, 76)


def poster():
    out = os.path.join(ASSETS, "img/poster")
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(out, "_kare.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.6", "-i", os.path.join(ASSETS, "video/tanitim-720.mp4"),
                    "-frames:v", "1", tmp], check=True)
    im = Image.open(tmp).convert("RGB")
    for w in (640, 960, 1280):
        webp(im, os.path.join(out, f"poster-{w}.webp"), w, 72)
    os.remove(tmp)


def og(logo):
    font_path = os.environ.get("BALOO_TTF")
    if not font_path:
        print("BALOO_TTF yok: paylaşım görselleri atlandı")
        return
    base = Image.open(os.path.join(SHOTS, "site2_tr", "10_dunya_hud_gizli.png")).convert("RGB")   # HUD yok: her dilde aynı zemin
    base = base.resize((1200, round(base.height * 1200 / base.width)), Image.LANCZOS)
    top = base.height - 630  # alttan: sağ üstteki HUD GÖSTER düğmesi kadrajın dışında kalır
    base = base.crop((0, top, 1200, top + 630)).filter(ImageFilter.GaussianBlur(1.2))
    # Lacivert ışıltı: üstte hafif, altta koyu
    shade = Image.new("RGBA", (1200, 630))
    d = ImageDraw.Draw(shade)
    for y in range(630):
        a = int(70 + 175 * (y / 630) ** 1.4)
        d.line([(0, y), (1200, y)], fill=NAVY + (a,))
    for lang in LANGS:
        im = Image.alpha_composite(base.convert("RGBA"), shade)
        lw = 760
        lg = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
        shadow = Image.new("RGBA", im.size)
        shadow.paste((0, 0, 0, 140), ((1200 - lw) // 2 + 6, 70 + 10), lg)
        im = Image.alpha_composite(im, shadow.filter(ImageFilter.GaussianBlur(10)))
        im.alpha_composite(lg, ((1200 - lw) // 2, 70))
        d = ImageDraw.Draw(im)
        font = ImageFont.truetype(font_path, 54)
        font.set_variation_by_name("ExtraBold")
        text = TAGLINES[lang]
        size = 54
        while d.textlength(text, font=font) > 1100:
            size -= 2
            font = ImageFont.truetype(font_path, size)
            font.set_variation_by_name("ExtraBold")
        d.text((600, 420), text, font=font, fill=(255, 255, 255), anchor="mm", stroke_width=5, stroke_fill=(11, 26, 74))
        pill = ImageFont.truetype(font_path, 30)
        pill.set_variation_by_name("ExtraBold")
        label = SOON[lang]
        tw = d.textlength(label, font=pill)
        x0, y0 = 600 - tw / 2 - 28, 500
        d.rounded_rectangle((x0, y0, x0 + tw + 56, y0 + 58), radius=29, fill=(255, 196, 58), outline=(164, 74, 0), width=3)
        d.text((600, y0 + 31), label, font=pill, fill=(14, 33, 94), anchor="mm")
        path = os.path.join(ASSETS, f"img/og-{lang}.jpg")
        im.convert("RGB").save(path, "JPEG", quality=84, optimize=True, progressive=True)
        print("og", lang, os.path.getsize(path))


if __name__ == "__main__":
    logo = brand()
    print("kareler", shots())
    cars()
    poster()
    og(logo)
