# Auto Yard — web sitesi

Android oyunu **Auto Yard**'ın tanıtım, yasal metin ve destek sitesi. Bağımlılıksız statik site + tek Vercel Function.

```
site.config.json    ad, e-posta, geliştirici, Play paket adı, yayın durumu — tek yerden
src/layout.html     tüm sayfaların iskeleti (head, header, footer, çerez bandı)
src/pages/*.html    sayfalar → public/<ad>.html  (/gizlilik, /kullanim-sartlari, …)
src/partials/       ortak parçalar
src/assets/         site.css, site.js, görseller (derlemede ?v=<özet> ile önbelleklenir)
api/contact.js      POST /api/contact — iletişim ve hesap silme formları (Resend)
scripts/build.mjs   derleyici      scripts/check.mjs  denetçi      scripts/serve.mjs  yerel sunucu
tests/              form API testleri (node --test)
```

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
| 1 | Gizlilik politikası | `/gizlilik` — KVKK/GDPR; oyunun gerçek veri akışı (Firebase anonim + Google girişi, Firestore `players/{uid}`), site verileri, aktarım, süreler, haklar | Oyuna veri toplayan yeni bir şey eklenince bu sayfa ve Play *Data safety* formu birlikte güncellenmeli |
| 2 | Kullanım şartları | `/kullanim-sartlari` — lisans, kurallar, sanal para, sorumluluk, Türk hukuku | — |
| 3 | Çerez onayı | Alt bant: *Reddet* ve *Kabul et* eşit ağırlıkta; onaysız hiçbir analiz betiği yüklenmez; GPC sinyali ret sayılır; 12 ayda bir yeniden sorulur; alt bilgideki "Çerez tercihleri" ile değiştirilebilir; `/cerez-politikasi` | Tarayıcıda Ağ sekmesi: onay öncesi `/_vercel/` isteği yok |
| 4 | Net CTA | Hero + sayfa sonu + header'da tek eylem: Play'den indir (yayın öncesi: "Çıkınca haber ver" → iletişim formu, konu seçili gelir) | — |
| 5 | Mobil görünüm | Mobil öncelikli CSS, 16 px kenar boşluğu, ≥44 px dokunma hedefleri, tablolar kendi içinde kayar | 390 px'de `scrollWidth` = 390 |
| 6 | Formlar çalışıyor | İstemci + sunucu doğrulaması, alan bazlı hata mesajları, bal tuzağı, IP hız sınırı, JS kapalıyken de çalışır (303 → `/tesekkurler`), Resend yoksa e-posta adresi gösterilir | `npm test` (11 test) |
| 7 | Kırık link yok | `check.mjs` her derlemede iç link, çapa, kaynak, yönlendirme hedeflerini denetler; kırık link = derleme durur | `npm run build`, `--external` |
| 8 | Site hızı | Framework yok, sistem fontu, WebP + `srcset`, lazy loading, boyutlu görseller (CLS 0), özetli varlıklar 1 yıl önbellek, sayfa başına 350 KB bütçe | Lighthouse mobil: 100 |
| 9 | Erişilebilirlik | `lang`, içeriğe geç linki, tek h1 + sıralı başlıklar, etiketli form alanları, `aria-invalid`/`aria-describedby`, `role=status` duyuruları, görünür odak, koyu mod, `prefers-reduced-motion` | Lighthouse a11y: 100; `check.mjs` |
| 10 | Analytics | Vercel Web Analytics + Speed Insights (çerezsiz), onaya bağlı | Vercel panosu |
| 11–20 | *Sıradaki 10 madde* | | |

Ek olarak: sıkı CSP ve güvenlik başlıkları (`vercel.json`), `robots.txt`, `sitemap.xml`, canonical, Open Graph görseli, `/privacy`, `/terms`, `/delete-account` yönlendirmeleri, özel 404.

> Yasal metinler sağlam bir şablondur ama hukuki görüş değildir; ticari yayından önce bir avukata okutman önerilir.
