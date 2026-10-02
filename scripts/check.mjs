// Derlenmiş siteyi (public/) denetler. Hata varsa çıkış kodu 1 → Vercel derlemesi durur.
//   node scripts/check.mjs             iç linkler, erişilebilirlik, SEO, boyut bütçesi
//   node scripts/check.mjs --external  ayrıca dış linkleri HEAD/GET ile dener
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");
const PAGE_BUDGET_KB = 350; // sayfa başına HTML + CSS + JS + görseller (sıkıştırmasız)

const errors = [];
const warnings = [];
const err = (page, msg) => errors.push(`${page}: ${msg}`);
const warn = (page, msg) => warnings.push(`${page}: ${msg}`);

const pages = readdirSync(out).filter((f) => f.endsWith(".html"));
const html = Object.fromEntries(pages.map((f) => [f, readFileSync(join(out, f), "utf8")]));

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
};
const hasAttr = (tag, name) => new RegExp(`\\s${name}(\\s|=|>|/)`, "i").test(tag);
const tags = (src, name) => src.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
const ids = (src) => new Set([...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

function pageFileFor(pathname) {
  if (pathname === "/") return "index.html";
  const clean = pathname.replace(/^\//, "").replace(/\/$/, "");
  if (html[`${clean}.html`] !== undefined) return `${clean}.html`;
  return null;
}

const external = new Set();
const noindexPages = new Set();
const descriptions = new Map();
const canonicalOf = new Map();
const ogImages = new Set();
const altTexts = new Map();
const placeholderPages = [];
const titles = new Map();

for (const [page, src] of Object.entries(html)) {
  // --- Temel SEO / yapı
  if (!/<html[^>]*\slang="[a-z]{2}/i.test(src)) err(page, "<html lang> eksik");
  if (!/<meta name="viewport"[^>]*width=device-width/i.test(src)) err(page, "viewport meta eksik");
  const metaTag = (key, val) => attr(tags(src, "meta").find((t) => attr(t, key) === val) || "", "content");
  const noindex = /<meta name="robots" content="noindex/.test(src);
  if (noindex) noindexPages.add(page);

  // 11 — meta başlık ve açıklama
  const title = (src.match(/<title>([^<]*)<\/title>/i) || [])[1]?.trim();
  if (!title) err(page, "<title> boş");
  else {
    if (titles.has(title)) err(page, `başlık "${title}" ${titles.get(title)} ile aynı`);
    titles.set(title, page);
    if (title.length > 60) err(page, `başlık ${title.length} karakter (≤60, arama sonucunda kesilir)`);
  }
  const desc = metaTag("name", "description");
  if (!desc) err(page, "meta description yok");
  else if (!noindex && (desc.length < 70 || desc.length > 160)) err(page, `meta description ${desc.length} karakter (70–160 olmalı)`);
  else if (!noindex) {
    if (descriptions.has(desc)) err(page, `meta description ${descriptions.get(desc)} ile aynı`);
    descriptions.set(desc, page);
  }

  // 14 — canonical: indekslenen sayfada tam bir tane, mutlak https; noindex sayfada hiç
  const canonicals = [...src.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]);
  if (noindex) {
    if (canonicals.length) err(page, "noindex sayfada canonical olmamalı");
  } else if (canonicals.length !== 1) {
    err(page, `${canonicals.length} canonical var (tam 1 olmalı)`);
  } else {
    const c = canonicals[0];
    if (!/^https:\/\/[^/]+\//.test(c)) err(page, `canonical mutlak https olmalı: ${c}`);
    if (/[?#]/.test(c)) err(page, `canonical sorgu/çapa içermemeli: ${c}`);
    const expectedPath = page === "index.html" ? "/" : `/${page.replace(/\.html$/, "")}`;
    if (new URL(c).pathname !== expectedPath) err(page, `canonical yanlış sayfayı gösteriyor: ${c}`);
    canonicalOf.set(page, c);
    if (metaTag("property", "og:url") !== c) err(page, "og:url canonical ile aynı değil");
  }

  // 18 — sosyal paylaşım (Open Graph + X/Twitter kartı)
  for (const [key, val] of [["property", "og:title"], ["property", "og:description"], ["property", "og:image"], ["property", "og:image:alt"], ["property", "og:url"], ["property", "og:type"], ["property", "og:site_name"], ["name", "twitter:card"], ["name", "twitter:image"]]) {
    if (!metaTag(key, val)) err(page, `${val} eksik`);
  }
  const ogImage = metaTag("property", "og:image");
  if (ogImage) {
    if (!/^https:\/\//.test(ogImage)) err(page, `og:image mutlak https olmalı: ${ogImage}`);
    else ogImages.add(new URL(ogImage).pathname);
    if (metaTag("property", "og:image:width") !== "1200" || metaTag("property", "og:image:height") !== "630") err(page, "og:image 1200×630 bildirilmeli");
  }

  // 19 — favicon bağlantıları
  if (!/<link rel="icon" href="\/favicon\.ico"/.test(src)) err(page, "favicon.ico bağlantısı eksik");
  if (!/<link rel="icon" href="[^"]+\.svg[^"]*" type="image\/svg\+xml"/.test(src)) err(page, "SVG favicon bağlantısı eksik");
  if (!/<link rel="apple-touch-icon"/.test(src)) err(page, "apple-touch-icon eksik");
  if (!/<link rel="manifest"/.test(src)) err(page, "manifest bağlantısı eksik");

  // Yapısal veri geçerli JSON olmalı
  for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      if (page === "index.html") {
        // 16 — SSS: sayfadaki her soru yapısal veride de olmalı
        const faqLd = (data["@graph"] || []).find((n) => n["@type"] === "FAQPage");
        const onPage = (src.match(/<details id="sss-/g) || []).length;
        if (!faqLd) err(page, "FAQPage yapısal verisi yok");
        else if (faqLd.mainEntity.length !== onPage) err(page, `SSS: sayfada ${onPage} soru, yapısal veride ${faqLd.mainEntity.length}`);
        if (onPage < 5) err(page, `SSS'de yalnızca ${onPage} soru var (en az 5)`);
      }
    } catch (e) {
      err(page, `JSON-LD bozuk: ${e.message}`);
    }
  }
  const h1s = tags(src, "h1").length;
  if (h1s !== 1) err(page, `${h1s} adet <h1> var (tam 1 olmalı)`);
  if (!/<main\b/.test(src)) err(page, "<main> eksik");
  if (!/class="skip-link"/.test(src)) err(page, "içeriğe geç bağlantısı eksik");

  // Başlık sırası atlanmasın (h2'den h4'e gibi)
  let prev = 0;
  for (const m of src.matchAll(/<h([1-6])\b/g)) {
    const lvl = Number(m[1]);
    if (prev && lvl > prev + 1) err(page, `başlık seviyesi h${prev} → h${lvl} atlıyor`);
    prev = lvl;
  }

  // --- Görseller
  for (const img of tags(src, "img")) {
    // 15 — alt metin: içerik görseli anlamlı alt taşır; dekoratifse alt="" + aria-hidden
    const alt = attr(img, "alt");
    const decorative = attr(img, "aria-hidden") === "true" || attr(img, "role") === "presentation";
    if (alt === null) err(page, `alt eksik: ${attr(img, "src")}`);
    else if (!alt.trim() && !decorative) err(page, `boş alt ama dekoratif işaretli değil: ${attr(img, "src")}`);
    else if (alt.trim()) {
      if (alt.length < 15) err(page, `alt çok kısa ("${alt}"): ne gösterdiğini anlat`);
      if (alt.length > 150) err(page, `alt ${alt.length} karakter (≤150)`);
      if (/^(resim|görsel|fotoğraf|ekran görüntüsü|image|picture|photo)\b/i.test(alt)) err(page, `alt "${alt.split(" ")[0]}" ile başlamasın; ekran okuyucu zaten "görsel" der`);
      if (/\.(png|jpe?g|webp|gif|svg)\b|[-_]\d{3,}/i.test(alt)) err(page, `alt dosya adına benziyor: "${alt}"`);
      if (altTexts.has(alt) && altTexts.get(alt) === page) warn(page, `aynı alt metni iki görsel kullanıyor: "${alt}"`);
      altTexts.set(alt, page);
    }
    if (!attr(img, "width") || !attr(img, "height")) err(page, `width/height eksik (CLS): ${attr(img, "src")}`);
  }

  // --- Form erişilebilirliği
  const labelFor = new Set([...src.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
  for (const name of ["input", "select", "textarea"]) {
    for (const t of tags(src, name)) {
      if (attr(t, "type") === "hidden") continue;
      const id = attr(t, "id");
      if (!id || !labelFor.has(id)) err(page, `etiketsiz form alanı: ${t.slice(0, 80)}`);
    }
  }
  for (const b of tags(src, "button")) if (!attr(b, "type")) err(page, `type'sız <button>: ${b.slice(0, 60)}`);
  for (const f of tags(src, "form")) {
    const action = attr(f, "action");
    if (!action) err(page, "action'sız <form>");
    else if (action.startsWith("/api/") && !existsSync(join(root, action.replace(/^\//, "") + ".js")))
      err(page, `form hedefi yok: ${action}`);
  }

  // --- Linkler ve kaynaklar
  const pageIds = ids(src);
  const refs = [];
  for (const m of src.matchAll(/\s(href|src)="([^"]+)"/g)) refs.push(m[2]);
  for (const m of src.matchAll(/\ssrcset="([^"]+)"/g)) for (const part of m[1].split(",")) refs.push(part.trim().split(/\s+/)[0]);

  let weight = Buffer.byteLength(src);
  const counted = new Set();
  for (const ref of refs) {
    if (/^(mailto:|tel:)/.test(ref)) {
      continue;
    }
    if (/^https?:\/\//.test(ref)) continue; // dış linkler aşağıda yalnızca <a> üzerinden toplanır
    if (ref.startsWith("#")) {
      if (ref.length > 1 && !pageIds.has(ref.slice(1))) err(page, `kırık çapa: ${ref}`);
      continue;
    }
    if (!ref.startsWith("/")) {
      err(page, `göreli link (mutlak yol kullan): ${ref}`);
      continue;
    }
    const url = new URL(ref, "https://x");
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_vercel/")) continue;
    if (url.pathname.startsWith("/assets/")) {
      if (!url.searchParams.has("v")) err(page, `önbellek özeti yok (/assets/ uzun önbellekli): ${ref}`);
      const file = join(out, url.pathname);
      if (!existsSync(file)) err(page, `kırık kaynak: ${ref}`);
      else if (!counted.has(url.pathname) && !/apple-touch|icon-|favicon|og\.jpg/.test(url.pathname)) {
        counted.add(url.pathname);
        weight += statSync(file).size;
      }
      continue;
    }
    if (/\.\w+$/.test(url.pathname)) {
      if (!existsSync(join(out, url.pathname))) err(page, `kırık dosya linki: ${ref}`);
      continue;
    }
    const target = pageFileFor(url.pathname);
    if (!target) {
      err(page, `kırık link: ${ref}`);
      continue;
    }
    if (url.hash && !ids(html[target]).has(decodeURIComponent(url.hash.slice(1)))) err(page, `kırık çapa: ${ref}`);
  }
  for (const a of tags(src, "a")) {
    if (/^https?:\/\//.test(attr(a, "href") || "")) external.add(attr(a, "href"));
    if (attr(a, "target") === "_blank" && !/noopener/.test(attr(a, "rel") || "")) err(page, `target=_blank rel=noopener'sız: ${attr(a, "href")}`);
  }
  // Srcset'teki tüm boyutlar sayılmasın diye kabaca: en büyük görsel çifti zaten eklendi; bütçe uyarısı yeterli.
  const kb = Math.round(weight / 1024);
  if (kb > PAGE_BUDGET_KB) err(page, `sayfa ağırlığı ${kb} KB > bütçe ${PAGE_BUDGET_KB} KB`);

  if (src.includes("DEGISTIR")) placeholderPages.push(page);
}

// --- Site geneli dosyalar
const siteUrl = canonicalOf.get("index.html")?.replace(/\/$/, "") || "";
const readOut = (f) => (existsSync(join(out, f)) ? readFileSync(join(out, f), "utf8") : null);
const today = new Date().toISOString().slice(0, 10);

// 12 — sitemap.xml: indekslenen sayfaların tamamı, yalnızca onlar, canonical adresleriyle
const sitemap = readOut("sitemap.xml");
if (sitemap) {
  if (!/^<\?xml[^>]+\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(sitemap)) err("sitemap.xml", "geçersiz başlık/ad alanı");
  const entries = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)];
  const locs = new Set(entries.map((e) => e[1]));
  for (const [page, c] of canonicalOf) if (!locs.has(c)) err("sitemap.xml", `${page} (${c}) eksik`);
  const canon = new Set(canonicalOf.values());
  for (const loc of locs) if (!canon.has(loc)) err("sitemap.xml", `canonical olmayan / noindex adres: ${loc}`);
  for (const [, loc, lastmod] of entries) {
    if (!lastmod) warn("sitemap.xml", `lastmod yok: ${loc}`);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod) || lastmod > today) err("sitemap.xml", `geçersiz/gelecek tarihli lastmod ${lastmod}: ${loc}`);
  }
}

// 13 — robots.txt: siteyi kapatmasın, sitemap'i göstersin
const robots = readOut("robots.txt");
if (robots) {
  if (/^Disallow:\s*\/\s*$/m.test(robots)) err("robots.txt", "Disallow: / tüm siteyi arama motorlarına kapatıyor");
  if (!robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`)) err("robots.txt", `Sitemap satırı ${siteUrl}/sitemap.xml olmalı`);
  if (!/^User-agent:\s*\*/m.test(robots)) err("robots.txt", "User-agent: * grubu yok");
}

// 17 — özel 404: noindex, canonical yok, ana sayfaya ve yardım sayfalarına yol gösterir
const notFound = html["404.html"];
if (notFound) {
  if (!noindexPages.has("404.html")) err("404.html", "noindex olmalı");
  if (!/href="\/"/.test(notFound)) err("404.html", "ana sayfa linki yok");
  if ((notFound.match(/<a [^>]*href="\/[a-z#]/g) || []).length < 3) err("404.html", "en az 3 yardımcı link olmalı");
}

// 18 — og:image dosyası gerçekten 1200×630 JPEG/PNG
for (const p of ogImages) {
  const file = join(out, p);
  if (!existsSync(file)) { err("og:image", `dosya yok: ${p}`); continue; }
  const dim = imageSize(readFileSync(file));
  if (!dim || dim.w !== 1200 || dim.h !== 630) err("og:image", `${p} boyutu ${dim ? `${dim.w}×${dim.h}` : "okunamadı"} (1200×630 olmalı)`);
  if (statSync(file).size > 300 * 1024) err("og:image", `${p} 300 KB'tan büyük`);
}

// 19 — favicon dosyaları
const ico = existsSync(join(out, "favicon.ico")) ? readFileSync(join(out, "favicon.ico")) : null;
if (!ico) err("favicon", "/favicon.ico yok");
else if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) err("favicon", "/favicon.ico gerçek bir ICO değil");
let manifest = {};
try {
  manifest = JSON.parse(readOut("site.webmanifest") || "{}");
} catch (e) {
  err("site.webmanifest", `bozuk JSON: ${e.message}`);
}
for (const icon of manifest.icons || []) if (!existsSync(join(out, icon.src.split("?")[0]))) err("site.webmanifest", `ikon yok: ${icon.src}`);
if (!(manifest.icons || []).some((i) => i.purpose === "maskable")) err("site.webmanifest", "maskable ikon yok");
for (const size of ["192x192", "512x512"]) if (!(manifest.icons || []).some((i) => i.sizes === size)) err("site.webmanifest", `${size} ikon yok`);

// 20 — llms.txt (llmstxt.org): H1 + özet, linkler gerçek sayfa/çapalara gider
const llms = readOut("llms.txt");
if (llms) {
  if (!/^# .+\n\n> .+/.test(llms)) err("llms.txt", "'# Ad' ve ardından '> özet' ile başlamalı");
  for (const m of llms.matchAll(/\]\((https?:\/\/[^)]+)\)/g)) {
    const url = new URL(m[1]);
    if (`${url.protocol}//${url.host}` !== siteUrl) continue;
    if (url.pathname === "/sitemap.xml") continue;
    const target = pageFileFor(url.pathname);
    if (!target || noindexPages.has(target)) err("llms.txt", `kırık/noindex link: ${m[1]}`);
    else if (url.hash && !ids(html[target]).has(url.hash.slice(1))) err("llms.txt", `kırık çapa: ${m[1]}`);
  }
  for (const [page, c] of canonicalOf) if (!llms.includes(`](${c})`)) err("llms.txt", `${page} listelenmemiş`);
}

function imageSize(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

// --- vercel.json yönlendirmeleri gerçek sayfalara gitmeli
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
for (const r of vercel.redirects || []) {
  if (!pageFileFor(r.destination)) err("vercel.json", `yönlendirme hedefi yok: ${r.source} → ${r.destination}`);
}
for (const f of ["robots.txt", "sitemap.xml", "site.webmanifest", "404.html", "llms.txt", "favicon.ico"]) {
  if (!existsSync(join(out, f))) err("public", `${f} eksik`);
}

// --- Dış linkler (isteğe bağlı)
if (process.argv.includes("--external")) {
  for (const url of external) {
    if (url.includes("play.google.com/store/apps/details")) continue; // uygulama yayınlanınca açılır
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10000) });
      if (res.status >= 400) err("dış link", `${res.status} ${url}`);
    } catch (e) {
      warn("dış link", `erişilemedi (${e.cause?.code || e.name}): ${url}`);
    }
  }
}

if (placeholderPages.length) warn("site.config.json", `DEGISTIR yer tutucuları ${placeholderPages.length} sayfada görünüyor — yayından önce doldur`);
for (const w of [...new Set(warnings)]) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
if (errors.length) {
  console.error(`\n${errors.length} hata — düzeltmeden yayına çıkma.`);
  process.exit(1);
}
console.log(`✓ ${pages.length} sayfa denetlendi: linkler, görseller, formlar, başlıklar ve boyut bütçesi tamam${external.size ? ` (${external.size} dış link${process.argv.includes("--external") ? " denendi" : " — denemek için --external"})` : ""}.`);
