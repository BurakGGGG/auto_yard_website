# Auto Yard — web sitesi

Android oyunu **Auto Yard**'ın tanıtım, yasal metin ve destek sitesi. Bağımlılıksız statik site + tek Vercel Function.
Üç dil: **Türkçe** kökte (`/`, `/gizlilik`…), **İngilizce** `/en/…`, **İspanyolca** `/es/…`. Tasarım oyunun logosu ve
arayüzüyle aynı dilde: ışınlı lacivert, altın plaka düğmeler, krem kartlar, sarı-siyah ikaz şeridi (2026-10-17 yenilendi).

```
site.config.json         ad, e-posta, geliştirici, Play paket adı, yayın durumu, diller — tek yerden
src/layout.html          tüm sayfaların iskeleti (head, header, footer, çerez bandı)
src/i18n/<dil>.json      sayfa adresleri ("paths"), arayüz metinleri ("t"), site.js metinleri ("script")
src/pages/<dil>/<anahtar>.html  sayfalar; aynı anahtar = aynı sayfanın çevirisi (hreflang otomatik)
src/pages/404.html       dilsiz 404 (üç dilde kısa metin)
src/partials/            ortak parçalar (header, footer, cta, araç kartları cars-<dil>, ikonlar)
src/assets/              site.css, site.js, davet.js, fonts/ (Baloo 2 + Nunito, OFL), img/, video/
tools/make_images.py     logo/ikon/oyun kareleri/araç kartları/video kapağı/paylaşım görselleri (oyun deposundan üretir)
api/contact.js           POST /api/contact — iletişim ve hesap silme formları (Resend), yanıtlar formun dilinde
scripts/build.mjs   derleyici      scripts/check.mjs  denetçi      scripts/serve.mjs  yerel sunucu
tests/              form API testleri (node --test)
```

Sayfa anahtarları ve adresleri: `home` (/ · /en · /es), `privacy` (/gizlilik · /en/privacy · /es/privacidad),
`terms` (/kullanim-sartlari · /en/terms · /es/terminos), `cookies` (/cerez-politikasi · /en/cookies · /es/cookies),
`delete` (/hesap-silme · /en/delete-account · /es/eliminar-cuenta), `contact` (/iletisim · /en/contact · /es/contacto),
`thanks` ve `invite` (noindex). Oyun Türkçe adreslere bağlanır (`/gizlilik`, `/kullanim-sartlari`, `/iletisim`,
`/hesap-silme`, `/d/<jeton>`): bunlar değişmemeli.

**Davet linki** `/d/<jeton>`: `vercel.json` yeniden yazması tarayıcı diline (Accept-Language) göre `/es/invitacion`,
`/en/invite` ya da `/davet`'i gösterir; adres çubuğu `/d/<jeton>` kalır, `davet.js` jetonu oradan okur.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run build` | `public/`'i derler ve denetler. Denetim hata verirse Vercel derlemesi durur. |
| `npm run dev` | http://localhost:3000 (vercel.json başlıkları + `/api/contact` dahil). `FORM_DRY_RUN=1 npm run dev` formları e-posta göndermeden konsola yazar. |
| `npm test` | Form API testleri |
| `node scripts/check.mjs --external` | Dış linkleri de dener |

Node 20+ yeterli, `npm install` gerekmez.

## Yayına almadan önce

1. **`site.config.json`**: `developerName` ve `contactEmail` alanlarındaki `DEGISTIR` yer tutucularını doldur (derleme bunlar için uyarı verir). Oyun Play'de yayınlanınca `playStoreLive: true` yap → CTA'lar "Google Play'den indir" olur.
2. **Vercel**: Import Project → bu repo. Framework: *Other*. Ayarlar `vercel.json`'dan gelir.
3. **Ortam değişkenleri** (`.env.example`): `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, isteğe bağlı `CONTACT_FROM_EMAIL`, `SITE_URL`. Bunlar yoksa formlar 503 döner ve kullanıcıya e-posta adresini gösterir.
4. **Analytics**: Vercel → Project → *Analytics* ve *Speed Insights*'ı aç. Betikler yalnızca çerez onayı verilirse yüklenir.
5. **Play Console**: Gizlilik politikası URL'si → `https://<alan-adın>/gizlilik`, hesap silme URL'si → `https://<alan-adın>/hesap-silme`.

## Kontrol listesi

| # | Madde | Nasıl karşılanıyor | Nasıl doğrulanır |
|---|---|---|---|
| 1 | Gizlilik politikası | `/gizlilik` (+ EN/ES) — KVKK/GDPR; oyunun kodla doğrulanmış veri akışı (2026-10-17): Google girişi (anonim hesap yok), bulut kaydı, herkese açık garaj profili ve profil fotoğrafı, arkadaşlık verileri, şikâyet/engelleme, FCM bildirimleri, AdMob ödüllü reklamlar + UMP, Play Billing gem paketleri, kamera izni; site verileri, aktarım, süreler, silme, haklar | Oyuna veri toplayan yeni bir şey eklenince üç dildeki sayfa ve Play *Data safety* formu birlikte güncellenmeli |
| 2 | Kullanım şartları | `/kullanim-sartlari` — lisans, kurallar, sanal para, sorumluluk, Türk hukuku | — |
| 3 | Çerez onayı | Alt bant: *Reddet* ve *Kabul et* eşit ağırlıkta; onaysız hiçbir analiz betiği yüklenmez; GPC sinyali ret sayılır; 12 ayda bir yeniden sorulur; alt bilgideki "Çerez tercihleri" ile değiştirilebilir; `/cerez-politikasi` | Tarayıcıda Ağ sekmesi: onay öncesi `/_vercel/` isteği yok |
| 4 | Net CTA | Hero + sayfa sonu + header'da tek eylem: Play'den indir (yayın öncesi: "Çıkınca haber ver" → iletişim formu, konu seçili gelir; `playStoreLive: true` hepsini çevirir) | — |
| 5 | Mobil görünüm | Mobil öncelikli CSS, 16 px kenar boşluğu, ≥44 px dokunma hedefleri, tablolar kendi içinde kayar | 390 px'de `scrollWidth` = 390 |
| 6 | Formlar çalışıyor | İstemci + sunucu doğrulaması, alan bazlı hata mesajları, bal tuzağı, IP hız sınırı, JS kapalıyken de çalışır (303 → `/tesekkurler`), Resend yoksa e-posta adresi gösterilir | `npm test` (11 test) |
| 7 | Kırık link yok | `check.mjs` her derlemede iç link, çapa, kaynak, yönlendirme hedeflerini denetler; kırık link = derleme durur | `npm run build`, `--external` |
| 8 | Site hızı | Framework yok, yerel yazı tipleri (`font-display: swap`, unicode-range), WebP + `srcset`, lazy loading, boyutlu görseller (CLS 0), video yalnızca görününce iner (hareket azaltma / veri tasarrufunda hiç inmez), özetli varlıklar 1 yıl önbellek; bütçe: hemen yüklenen 350 KB, tembel görsellerle toplam 1600 KB | `check.mjs` |
| 9 | Erişilebilirlik | `lang`, içeriğe geç linki, tek h1 + sıralı başlıklar, etiketli form alanları, `aria-invalid`/`aria-describedby`, `role=status` duyuruları, görünür odak, koyu mod, `prefers-reduced-motion` | Lighthouse a11y: 100; `check.mjs` |
| 10 | Analytics | Vercel Web Analytics + Speed Insights (çerezsiz), onaya bağlı | Vercel panosu |
| 11 | Meta başlık ve açıklama | Her sayfada benzersiz `<title>` (≤60) ve açıklama (70–160 karakter); sayfa başındaki `<!--meta-->` yorumundan | `check.mjs`: uzunluk, benzersizlik |
| 12 | sitemap.xml | Derlemede üretilir: yalnızca indekslenen sayfalar, canonical adresleriyle; `lastmod` sayfanın `updated` alanından | `check.mjs`: eksik/fazla sayfa, geçersiz tarih |
| 13 | robots.txt | Derlemede üretilir: her şeye açık, yalnızca `/api/` kapalı, Sitemap satırı canonical alan adıyla | `check.mjs`: `Disallow: /` ve eksik Sitemap satırı hata |
| 14 | Canonical URL'ler | İndekslenen her sayfada tek, mutlak https, sorgusuz canonical; 404 ve teşekkür sayfasında yok. Alan adı `SITE_URL` → Vercel üretim adresi → `site.config.json` sırasıyla | `check.mjs`: doğru sayfayı gösterme, `og:url` eşleşmesi |
| 15 | Görsel alt metinler | Her içerik görselinde ne gösterdiğini anlatan alt; dekoratif görseller `alt=""` + `aria-hidden`; OG görselinin de alt'ı var | `check.mjs`: kısa, "görsel…" ile başlayan, dosya adına benzeyen alt hata |
| 16 | Sık sorulan sorular | Her dilin ana sayfasında 9 soru, her biri bağlantılanabilir (`/#sss-telefon`, `/en#faq-ads` açık gelir); aynı sorular `FAQPage` yapısal verisine ve llms.txt'ye otomatik akar | `check.mjs`: sayfa ↔ yapısal veri sayısı |
| 17 | Özel 404 | Markalı sayfa, gerçek 404 durum kodu, noindex, ana sayfa + 5 yardımcı link | `check.mjs` |
| 18 | Sosyal paylaşım | Open Graph + X kartı (1200×630 görsel, alt metni ile); sayfa sonunda Paylaş (Web Share API), WhatsApp, X, Telegram, linki kopyala — takip betiği yok | `check.mjs`: etiketler + görselin gerçek boyutu |
| 19 | Favicon | Oyunun Play ikonundan: `favicon.ico` (16/32/48), SVG favicon, apple-touch-icon, manifest'te 192/512 + maskable (adaptive katmanlardan) | `check.mjs`: ICO başlığı, manifest ikonları |
| 20 | llms.txt | [llmstxt.org](https://llmstxt.org) biçiminde derlemede üretilir: oyun özeti, temel bilgiler, sayfalar, SSS | `check.mjs`: biçim, kırık link/çapa, eksik sayfa |

Ek olarak: sıkı CSP ve güvenlik başlıkları (`vercel.json`), `VideoGame` + `BreadcrumbList` yapısal verisi, `/privacy`, `/terms`, `/delete-account` → İngilizce sayfalar. Çok dil denetimleri: her sayfanın `<html lang>`'ı klasörünün dili; hreflang bağlantıları gerçek, indekslenen, aynı dildeki sayfaları gösterir ve karşılıklıdır, x-default vardır.

Her denetim, bilerek bozulan bir kopyada hatayı yakaladığı doğrulanarak eklendi.

## Sayfa güncellerken

- Bir sayfayı değiştirirken **üç dili birlikte** güncelle (`src/pages/tr|en|es/<anahtar>.html`); yasal metinlerde Türkçe asıldır.
- İçerik anlamlı değiştiyse sayfanın `<!--meta {"updated": "..."}-->` tarihini güncelle → sitemap ve "Son güncelleme" ondan beslenir.
- SSS'ye soru eklemek için her dilin `home.html`'ine `<details id="sss-…">` (EN `faq-…`, ES `preguntas-…`) ekle; yapısal veri ve llms.txt kendiliğinden güncellenir.
- Oyun güncellenince görselleri yenilemek için oyun deposunda kareleri çek (`qa/ekran_tarama.gd`, `qa/arkadaslar_qa.gd`), sonra `tools/make_images.py`'yi çalıştır.
- Sayılar (57 araç, 28 klasik, 263 dekor, 99 seviye) ve özellik metinleri 2026-10-17'de oyunun kodundan doğrulandı; oyun değişirse güncelle. Araç boyama oyunda kapalı olduğu için sitede yok.

> Yasal metinler sağlam bir şablondur ama hukuki görüş değildir; ticari yayından önce bir avukata okutman önerilir.
