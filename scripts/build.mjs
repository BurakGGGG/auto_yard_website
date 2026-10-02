// Statik site derleyicisi (bağımlılık yok).
// src/pages/*.html → public/<ad>.html, src/layout.html ile sarılır.
//
// Sayfa başı meta yorumu:   <!--meta {"title": "...", "description": "..."} -->
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
const pages = [];
let built = 0;
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
    robots: meta.noindex ? "noindex" : "index, follow",
  };
  const body = render(raw.slice(m[0].length), ctx);
  writeFileSync(join(out, `${slug}.html`), render(layout, ctx).replace("<!--CONTENT-->", () => body));
  built++;
  if (!meta.noindex) pages.push(path);
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map((p) => `  <url><loc>${config.siteUrl}${p === "/" ? "/" : p}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`,
);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
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
      ],
    },
    null,
    2,
  ),
);

const placeholders = Object.entries(config).filter(([, v]) => typeof v === "string" && v.includes("DEGISTIR"));
for (const [k] of placeholders) console.warn(`⚠ site.config.json → "${k}" hâlâ DEGISTIR yer tutucusu içeriyor`);
console.log(`✓ ${built} sayfa derlendi → public/ (siteUrl: ${config.siteUrl})`);
