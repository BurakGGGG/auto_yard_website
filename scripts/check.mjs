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
const placeholderPages = [];
const titles = new Map();

for (const [page, src] of Object.entries(html)) {
  // --- Temel SEO / yapı
  if (!/<html[^>]*\slang="[a-z]{2}/i.test(src)) err(page, "<html lang> eksik");
  if (!/<meta name="viewport"[^>]*width=device-width/i.test(src)) err(page, "viewport meta eksik");
  const title = (src.match(/<title>([^<]*)<\/title>/i) || [])[1]?.trim();
  if (!title) err(page, "<title> boş");
  else if (titles.has(title)) err(page, `başlık "${title}" ${titles.get(title)} ile aynı`);
  else titles.set(title, page);
  const desc = attr(tags(src, "meta").find((t) => attr(t, "name") === "description") || "", "content");
  const noindex = /<meta name="robots" content="noindex/.test(src);
  if (!desc || (!noindex && desc.length < 50)) err(page, "meta description yok veya 50 karakterden kısa");
  if (desc && desc.length > 170) warn(page, `meta description ${desc.length} karakter (≤160 önerilir)`);
  if (!/<link rel="canonical"/.test(src)) err(page, "canonical link eksik");
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
    if (!hasAttr(img, "alt")) err(page, `alt eksik: ${img.slice(0, 80)}`);
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

// --- vercel.json yönlendirmeleri gerçek sayfalara gitmeli
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
for (const r of vercel.redirects || []) {
  if (!pageFileFor(r.destination)) err("vercel.json", `yönlendirme hedefi yok: ${r.source} → ${r.destination}`);
}
for (const f of ["robots.txt", "sitemap.xml", "site.webmanifest", "404.html"]) {
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
