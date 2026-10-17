// Statik site derleyicisi (bağımlılık yok). Üç dil: Türkçe kökte, İngilizce /en, İspanyolca /es altında.
//   src/pages/<dil>/<anahtar>.html → src/i18n/<dil>.json "paths"[anahtar] adresi (ör. tr/privacy → /gizlilik,
//   en/privacy → /en/privacy). src/pages/404.html dilsizdir (üç dilde kısa metin).
//   Çıktı: "/" → public/index.html, "/en" → public/en/index.html, "/en/privacy" → public/en/privacy.html.
//
// Sayfa başı meta yorumu:   <!--meta {"updated": "YYYY-AA-GG", "title": "...", "description": "..."} -->
//   updated: sayfa içeriği anlamlı değiştiğinde elle güncelle → sitemap lastmod ve "Son güncelleme" buradan.
//   noindex: true → sitemap/llms.txt dışında kalır, canonical, hreflang ve yapısal veri basılmaz.
// Şablon etiketleri:
//   {{anahtar}} / {{t.anahtar}}  site.config.json değeri / o dilin metni (src/i18n/<dil>.json "t")
//   {{> parca}}              src/partials/parca.html
//   {{asset:/assets/x.css}}  içerik özetli adres (/assets/x.css?v=ab12cd34) → uzun önbellek güvenli
//   {{link:anahtar}}         bu dilde o sayfanın adresi (ör. {{link:privacy}} → /en/privacy)
//   {{current:anahtar}}      bu sayfa o anahtarsa aria-current="page"
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

const LANGS = config.languages; // ["tr", "en", "es"] — ilki varsayılan (kök, x-default)
const i18n = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(join(src, "i18n", `${l}.json`), "utf8"))]));

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

// site.css içindeki /assets/ adresleri de özetli olsun (yazı tipleri sayfada aynı adresle önceden yüklenir)
{
  const cssPath = join(out, "assets", "site.css");
  const css = readFileSync(cssPath, "utf8").replace(/url\("(\/assets\/[^"?]+)"\)/g, (_, p) => `url("${assetUrl(p)}")`);
  writeFileSync(cssPath, css);
}

const partials = Object.fromEntries(
  readdirSync(join(src, "partials")).map((f) => [f.replace(/\.html$/, ""), readFileSync(join(src, "partials", f), "utf8")]),
);
partials.cta = config.playStoreLive ? partials["cta-live"] : partials["cta-soon"];
partials["cta-small"] = config.playStoreLive ? partials["cta-small-live"] : partials["cta-small-soon"];

function lookup(ctx, key) {
  let v = ctx;
  for (const part of key.split(".")) {
    if (v === null || typeof v !== "object" || !(part in v)) throw new Error(`Bilinmeyen anahtar {{${key}}} (${ctx.lang}:${ctx.key})`);
    v = v[part];
  }
  return v;
}

function render(text, ctx, depth = 0) {
  if (depth > 5) throw new Error("Parça iç içeliği çok derin");
  return text
    .replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
      if (!(name in partials)) throw new Error(`Bilinmeyen parça: ${name}`);
      return render(partials[name], ctx, depth + 1);
    })
    .replace(/\{\{asset:([^}]+)\}\}/g, (_, p) => assetUrl(p.trim()))
    .replace(/\{\{link:([\w-]+)\}\}/g, (_, key) => {
      const p = i18n[ctx.lang].paths[key];
      if (!p) throw new Error(`Bilinmeyen sayfa {{link:${key}}} (${ctx.lang})`);
      return p;
    })
    .replace(/\{\{current:([\w-]+)\}\}/g, (_, key) => (key === ctx.key ? 'aria-current="page"' : ""))
    .replace(/\{\{([\w.]+)\}\}/g, (_, key) => escapeHtml(String(lookup(ctx, key))));
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// "/" → index.html, "/en" → en/index.html, "/en/privacy" → en/privacy.html, "/gizlilik" → gizlilik.html
function outFileFor(path) {
  if (path === "/") return "index.html";
  const clean = path.replace(/^\//, "");
  return LANGS.includes(clean) ? `${clean}/index.html` : `${clean}.html`;
}

const urlOf = (path) => config.siteUrl + (path === "/" ? "/" : path);

// --- Sayfaları topla (önce hepsini oku: hreflang için hangi dilde hangi sayfa var bilinmeli)
const sources = [];
for (const lang of LANGS) {
  for (const file of readdirSync(join(src, "pages", lang)).sort()) {
    const key = file.replace(/\.html$/, "");
    const path = i18n[lang].paths[key];
    if (!path) throw new Error(`${lang}/${file}: i18n/${lang}.json "paths" içinde "${key}" yok`);
    sources.push({ lang, key, path, file: join(src, "pages", lang, file), name: `${lang}/${file}` });
  }
}
sources.push({ lang: LANGS[0], key: "404", path: "/404", file: join(src, "pages", "404.html"), name: "404.html", outFile: "404.html" });

const sourceOf = new Map();
for (const s of sources) {
  const raw = readFileSync(s.file, "utf8");
  const m = raw.match(/^<!--meta\s+(\{[\s\S]*?\})\s*-->\s*/);
  if (!m) throw new Error(`${s.name}: meta yorumu eksik`);
  s.meta = JSON.parse(m[1]);
  s.body = raw.slice(m[0].length);
  if (!s.meta.noindex && !/^\d{4}-\d{2}-\d{2}$/.test(s.meta.updated || "")) throw new Error(`${s.name}: meta "updated" (YYYY-AA-GG) eksik`);
  sourceOf.set(`${s.lang}:${s.key}`, s);
}

const layout = readFileSync(join(src, "layout.html"), "utf8");
const pages = []; // indekslenen sayfalar: {lang, key, path, url, title, description, lastmod}
const faqs = {}; // dil → [{id, q, a}]
let built = 0;

for (const s of sources) {
  const { lang, key, path, meta } = s;
  const L = i18n[lang];
  const indexed = (l) => sourceOf.has(`${l}:${key}`) && !sourceOf.get(`${l}:${key}`).meta.noindex;
  const alternates = meta.noindex ? [] : LANGS.filter(indexed).map((l) => ({ lang: l, path: i18n[l].paths[key] }));
  const home = urlOf(L.paths.home);
  const ctx = {
    ...config,
    t: L.t,
    lang,
    locale: L.locale,
    key,
    path,
    title: meta.title,
    fullTitle: meta.title === config.name ? `${config.name} — ${L.t.tagline}` : `${meta.title} | ${config.name}`,
    description: meta.description,
    canonical: urlOf(path),
    robots: meta.noindex ? "noindex, follow" : "index, follow",
    updated: meta.updated || "",
    updatedText: meta.updated ? new Date(`${meta.updated}T12:00:00Z`).toLocaleDateString(L.dateLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "",
    homeUrl: home,
    ogImage: `${config.siteUrl}${assetUrl(`/assets/img/og-${lang}.jpg`)}`,
    shareUrlEncoded: encodeURIComponent(home),
    shareTitleEncoded: encodeURIComponent(`${config.name} — ${L.t.tagline}`),
    shareTextEncoded: encodeURIComponent(`${config.name} — ${L.t.tagline} ${home}`),
  };
  const body = render(s.body, ctx);
  if (key === "home") faqs[lang] = extractFaq(body);

  // Dil seçici: bu sayfanın diğer dillerdeki karşılığı (yoksa o dilin ana sayfası). Başlıkta kısa (TR/EN/ES),
  // alt bilgide tam adla (Türkçe/English/Español).
  const langLinks = (full) => LANGS.map((l) => {
    const target = sourceOf.has(`${l}:${key}`) && i18n[l].paths[key] ? i18n[l].paths[key] : i18n[l].paths.home;
    const current = l === lang ? ' aria-current="true"' : "";
    const text = full ? escapeHtml(i18n[l].label) : `<span aria-hidden="true">${i18n[l].short}</span><span class="visually-hidden">${escapeHtml(i18n[l].label)}</span>`;
    return `<li><a href="${target}" hreflang="${l}" lang="${l}"${current}>${text}</a></li>`;
  }).join("");

  // Canonical, hreflang ve yapısal veri yalnızca indekslenen sayfalarda (404/teşekkür sayfası kendini canonical göstermesin).
  const head = meta.noindex
    ? ""
    : `  <link rel="canonical" href="${ctx.canonical}">\n` +
      alternates.map((a) => `  <link rel="alternate" hreflang="${a.lang}" href="${urlOf(a.path)}">\n`).join("") +
      (alternates.length > 1 ? `  <link rel="alternate" hreflang="x-default" href="${urlOf(i18n[LANGS[0]].paths[key])}">\n` : "") +
      alternates.filter((a) => a.lang !== lang).map((a) => `  <meta property="og:locale:alternate" content="${i18n[a.lang].locale}">\n`).join("") +
      `  <script type="application/ld+json">${jsonLd(structuredData(ctx, key === "home" ? faqs[lang] : null))}</script>\n`;
  // site.js metinleri (çalıştırılmayan veri bloğu; CSP script-src 'self' ile uyumlu)
  const strings = `  <script type="application/json" id="site-i18n">${jsonLd(L.script)}</script>\n`;
  const html = render(layout, ctx)
    .replace("<!--HEAD-->\n", () => head + strings)
    .replaceAll("<!--LANGS-->", () => langLinks(false))
    .replaceAll("<!--LANGS_FULL-->", () => langLinks(true))
    .replace("<!--CONTENT-->", () => body);
  const file = s.outFile || outFileFor(path);
  mkdirSync(dirname(join(out, file)), { recursive: true });
  writeFileSync(join(out, file), html);
  built++;
  if (!meta.noindex) pages.push({ lang, key, path, url: ctx.canonical, title: meta.title, description: meta.description, lastmod: meta.updated });
}

function extractFaq(body) {
  const items = [];
  for (const d of body.matchAll(/<details id="([^"]+)"[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) {
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
  // </script> kaçışı: < karakteri JSON içinde < olarak yazılır.
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function structuredData(ctx, faqItems) {
  const site = `${config.siteUrl}/`;
  const website = { "@type": "WebSite", "@id": `${site}#website`, url: site, name: config.name, inLanguage: LANGS };
  if (!faqItems) {
    return {
      "@context": "https://schema.org",
      "@graph": [
        website,
        { "@type": "WebPage", "@id": ctx.canonical, url: ctx.canonical, name: ctx.title, description: ctx.description, inLanguage: ctx.lang, isPartOf: { "@id": `${site}#website` } },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: config.name, item: ctx.homeUrl },
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
    url: ctx.homeUrl,
    image: ctx.ogImage,
    inLanguage: LANGS,
    operatingSystem: "Android",
    applicationCategory: "GameApplication",
    genre: ctx.t.ld_genres.split(", "),
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
        "@id": `${ctx.homeUrl}#${ctx.t.faq_id}`,
        inLanguage: ctx.lang,
        mainEntity: faqItems.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

const order = (p) => LANGS.indexOf(p.lang) * 100 + (p.key === "home" ? 0 : 1);
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...pages].sort((a, b) => order(a) - order(b)).map((p) => `  <url><loc>${p.url}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`,
);
writeFileSync(
  join(out, "robots.txt"),
  `# ${config.name}\n# Tüm arama motorları ve yapay zekâ tarayıcıları sitenin herkese açık sayfalarını tarayabilir.\n` +
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`,
);
writeFileSync(join(out, "llms.txt"), llmsTxt());

// https://llmstxt.org — yapay zekâ asistanlarının site hakkında doğru bilgi vermesi için özet (İngilizce + her dilin sayfaları).
function llmsTxt() {
  const en = i18n.en.llms;
  const status = config.playStoreLive ? `${en.status_live} ${config.playUrl}` : `${en.status_soon} (${config.androidPackage}).`;
  const lines = [`# ${config.name}`, "", `> ${en.summary}`, "", ...en.facts.map((f) => `- ${f}`), `- ${status}`, `- Developer: ${config.developerName}. Contact: ${config.contactEmail}`, ""];
  for (const lang of LANGS) {
    const L = i18n[lang];
    lines.push(`## ${L.llms.heading}`, "");
    for (const p of pages.filter((x) => x.lang === lang)) lines.push(`- [${p.title}](${p.url}): ${p.description}`);
    lines.push("");
    if (faqs[lang]?.length) {
      lines.push(`### ${L.llms.faq}`, "");
      for (const f of faqs[lang]) lines.push(`- [${f.q}](${urlOf(L.paths.home)}#${f.id}): ${f.a}`);
      lines.push("");
    }
  }
  lines.push("## Optional", "", `- [Sitemap](${config.siteUrl}/sitemap.xml): all public pages`, "");
  return lines.join("\n");
}

writeFileSync(
  join(out, "site.webmanifest"),
  JSON.stringify(
    {
      name: config.name,
      short_name: config.name,
      lang: LANGS[0],
      start_url: "/",
      display: "browser",
      background_color: "#0e215e",
      theme_color: "#142e7a",
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
console.log(`✓ ${built} sayfa derlendi (${LANGS.join(", ")}) → public/ (siteUrl: ${config.siteUrl})`);
