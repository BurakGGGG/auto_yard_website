// Statik site derleyicisi (bağımlılık yok).
// src/pages/*.html → public/<ad>.html, src/layout.html ile sarılır.
//
// Sayfa başı meta yorumu:   <!--meta {"updated": "YYYY-AA-GG", "title": "...", "description": "..."} -->
//   updated: sayfa içeriği anlamlı değiştiğinde elle güncelle → sitemap lastmod ve "Son güncelleme" buradan.
//   noindex: true → sitemap/llms.txt dışında kalır, canonical ve yapısal veri basılmaz.
// Şablon etiketleri:
//   {{anahtar}}              site.config.json değeri (ör. {{contactEmail}})
//   {{> parca}}              src/partials/parca.html
//   {{asset:/assets/x.css}}  içerik özetli adres (/assets/x.css?v=ab12cd34) → uzun önbellek güvenli
//   {{current:/yol}}         bu sayfa /yol ise aria-current="page"
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const out = join(root, "public");

const config = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
config.siteUrl = resolveSiteUrl();
config.year = String(new Date().getFullYear());
config.playUrl = `https://play.google.com/store/apps/details?id=${config.androidPackage}`;
config.shareUrlEncoded = encodeURIComponent(`${config.siteUrl}/`);
config.shareTitleEncoded = encodeURIComponent(`${config.name} — ${config.tagline}`);
config.shareTextEncoded = encodeURIComponent(`${config.name} — ${config.tagline} ${config.siteUrl}/`);

function resolveSiteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return config.siteUrl.replace(/\/$/, "");
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(src, "assets"), join(out, "assets"), { recursive: true });
if (existsSync(join(src, "static"))) for (const f of readdirSync(join(src, "static"))) cpSync(join(src, "static", f), join(out, f));

const hashCache = new Map();
function assetUrl(path) {
  if (!hashCache.has(path)) {
    const buf = readFileSync(join(out, path));
    hashCache.set(path, createHash("sha256").update(buf).digest("hex").slice(0, 10));
  }
  return `${path}?v=${hashCache.get(path)}`;
}

const partials = Object.fromEntries(
  readdirSync(join(src, "partials")).map((f) => [f.replace(/\.html$/, ""), readFileSync(join(src, "partials", f), "utf8")]),
);
partials.cta = config.playStoreLive ? partials["cta-live"] : partials["cta-soon"];
if (!config.playStoreLive) {
  partials["cta-small"] = `<a class="btn btn-primary btn-small" href="/iletisim?konu=haber" data-cta="header">Çıkınca haber al</a>\n`;
}

function render(text, ctx, depth = 0) {
  if (depth > 5) throw new Error("Parça iç içeliği çok derin");
  return text
    .replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
      if (!(name in partials)) throw new Error(`Bilinmeyen parça: ${name}`);
      return render(partials[name], ctx, depth + 1);
    })
    .replace(/\{\{asset:([^}]+)\}\}/g, (_, p) => assetUrl(p.trim()))
    .replace(/\{\{current:([^}]+)\}\}/g, (_, p) => (p.trim() === ctx.path ? 'aria-current="page"' : ""))
    .replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (!(key in ctx)) throw new Error(`Bilinmeyen anahtar {{${key}}} (${ctx.path})`);
      return escapeHtml(String(ctx[key]));
    });
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const layout = readFileSync(join(src, "layout.html"), "utf8");
const pages = []; // {path, file, title, description, lastmod} — yalnızca indekslenebilir sayfalar
let built = 0;
let faq = [];
for (const file of readdirSync(join(src, "pages")).sort()) {
  const raw = readFileSync(join(src, "pages", file), "utf8");
  const m = raw.match(/^<!--meta\s+(\{[\s\S]*?\})\s*-->\s*/);
  if (!m) throw new Error(`${file}: meta yorumu eksik`);
  const meta = JSON.parse(m[1]);
  const slug = file.replace(/\.html$/, "");
  const path = slug === "index" ? "/" : `/${slug}`;
  const ctx = {
    ...config,
    path,
    title: meta.title,
    fullTitle: meta.title === config.name ? `${config.name} — ${config.tagline}` : `${meta.title} | ${config.name}`,
    description: meta.description,
    canonical: config.siteUrl + (path === "/" ? "/" : path),
    robots: meta.noindex ? "noindex, follow" : "index, follow",
    updated: meta.updated || "",
    updatedText: meta.updated ? new Date(`${meta.updated}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "",
  };
  if (!meta.noindex && !/^\d{4}-\d{2}-\d{2}$/.test(meta.updated || "")) throw new Error(`${file}: meta "updated" (YYYY-AA-GG) eksik`);
  const body = render(raw.slice(m[0].length), ctx);
  if (path === "/") faq = extractFaq(body);

  // Canonical ve yapısal veri yalnızca indekslenen sayfalarda (404/teşekkür sayfası kendini canonical göstermesin).
  const head = meta.noindex
    ? ""
    : `  <link rel="canonical" href="${ctx.canonical}">\n` +
      `  <script type="application/ld+json">${jsonLd(structuredData(ctx, path === "/" ? faq : null))}</script>\n`;
  const html = render(layout, ctx)
    .replace("<!--HEAD-->\n", () => head)
    .replace("<!--CONTENT-->", () => body);
  writeFileSync(join(out, `${slug}.html`), html);
  built++;
  if (!meta.noindex) {
    pages.push({ path, url: ctx.canonical, title: meta.title, description: meta.description, lastmod: meta.updated });
  }
}

function extractFaq(body) {
  const items = [];
  for (const d of body.matchAll(/<details id="([^"]+)">\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) {
    items.push({ id: d[1], q: textOf(d[2]), a: textOf(d[3]) });
  }
  return items;
}

function textOf(fragment) {
  return fragment
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLd(obj) {
  // </script> kaçışı: < karakteri JSON içinde \u003c olarak yazılır.
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function structuredData(ctx, faqItems) {
  const site = `${config.siteUrl}/`;
  const website = { "@type": "WebSite", "@id": `${site}#website`, url: site, name: config.name, inLanguage: config.lang };
  if (!faqItems) {
    return {
      "@context": "https://schema.org",
      "@graph": [
        website,
        { "@type": "WebPage", "@id": ctx.canonical, url: ctx.canonical, name: ctx.title, description: ctx.description, inLanguage: config.lang, isPartOf: { "@id": `${site}#website` } },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: config.name, item: site },
            { "@type": "ListItem", position: 2, name: ctx.title, item: ctx.canonical },
          ],
        },
      ],
    };
  }
  const game = {
    "@type": ["VideoGame", "MobileApplication"],
    "@id": `${site}#game`,
    name: config.name,
    description: ctx.description,
    url: site,
    image: `${config.siteUrl}${assetUrl("/assets/img/og.jpg")}`,
    inLanguage: config.lang,
    operatingSystem: "Android",
    applicationCategory: "GameApplication",
    genre: ["Simülasyon", "Yarış"],
    gamePlatform: "Android",
    author: { "@type": "Person", name: config.developerName },
    offers: { "@type": "Offer", price: "0", priceCurrency: "TRY" },
  };
  if (config.playStoreLive) {
    game.installUrl = config.playUrl;
    game.downloadUrl = config.playUrl;
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      website,
      game,
      {
        "@type": "FAQPage",
        "@id": `${site}#sss`,
        mainEntity: faqItems.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...pages].sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : 0)).map((p) => `  <url><loc>${p.url}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`,
);
writeFileSync(
  join(out, "robots.txt"),
  `# ${config.name}\n# Tüm arama motorları ve yapay zekâ tarayıcıları sitenin herkese açık sayfalarını tarayabilir.\n` +
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`,
);
writeFileSync(join(out, "llms.txt"), llmsTxt());

// https://llmstxt.org — yapay zekâ asistanlarının site hakkında doğru bilgi vermesi için özet.
function llmsTxt() {
  const byPath = Object.fromEntries(pages.map((p) => [p.path, p]));
  const link = (path) => `- [${byPath[path].title}](${byPath[path].url}): ${byPath[path].description}`;
  const legal = ["/gizlilik", "/kullanim-sartlari", "/cerez-politikasi", "/hesap-silme"];
  const status = config.playStoreLive
    ? `Google Play: ${config.playUrl}`
    : `Durum: henüz yayınlanmadı, yakında Google Play'de (paket adı ${config.androidPackage}).`;
  return [
    `# ${config.name}`,
    "",
    `> ${config.name}, Android için ücretsiz bir garaj, araba tamiri ve drag yarışı oyunudur. ${config.tagline}`,
    "",
    `- Platform: Android. Dil: Türkçe. ${status}`,
    "- Fiyat: ücretsiz. Reklam yok, gerçek parayla satın alma yok.",
    "- Hesap: misafir olarak oynanabilir; Google ile giriş yapılırsa ilerleme buluta (Firebase) yedeklenir.",
    `- Geliştirici: ${config.developerName}. İletişim: ${config.contactEmail}`,
    "",
    "## Sayfalar",
    "",
    link("/"),
    link("/iletisim"),
    "",
    "## Yasal",
    "",
    ...legal.map(link),
    "",
    "## Sık sorulan sorular",
    "",
    ...faq.map((f) => `- [${f.q}](${config.siteUrl}/#${f.id}): ${f.a}`),
    "",
    "## Optional",
    "",
    `- [Site haritası](${config.siteUrl}/sitemap.xml): tüm herkese açık sayfaların listesi`,
    "",
  ].join("\n");
}
writeFileSync(
  join(out, "site.webmanifest"),
  JSON.stringify(
    {
      name: config.name,
      short_name: config.name,
      lang: config.lang,
      start_url: "/",
      display: "browser",
      background_color: "#f6efe2",
      theme_color: "#f0a92b",
      icons: [
        { src: assetUrl("/assets/icon-192.png"), sizes: "192x192", type: "image/png" },
        { src: assetUrl("/assets/icon-512.png"), sizes: "512x512", type: "image/png" },
        { src: assetUrl("/assets/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  ),
);

const placeholders = Object.entries(config).filter(([, v]) => typeof v === "string" && v.includes("DEGISTIR"));
for (const [k] of placeholders) console.warn(`⚠ site.config.json → "${k}" hâlâ DEGISTIR yer tutucusu içeriyor`);
console.log(`✓ ${built} sayfa derlendi → public/ (siteUrl: ${config.siteUrl})`);
