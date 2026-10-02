// Yerel önizleme: public/ + /api/contact, vercel.json başlıkları ve cleanUrls ile.
//   npm run dev                       → http://localhost:3000
//   FORM_DRY_RUN=1 npm run dev        → formlar e-posta göndermeden konsola yazılır
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../api/contact.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");
const port = Number(process.env.PORT) || 3000;
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".xml": "application/xml",
  ".txt": "text/plain", ".webmanifest": "application/manifest+json",
};

function headersFor(pathname) {
  const h = {};
  for (const rule of vercel.headers) {
    const re = new RegExp("^" + rule.source.replace("(.*)", ".*") + "$");
    if (re.test(pathname)) for (const { key, value } of rule.headers) h[key] = value;
  }
  delete h["Strict-Transport-Security"];
  h["Content-Security-Policy"] = (h["Content-Security-Policy"] || "").replace("; upgrade-insecure-requests", "");
  return h;
}

const dryRunSend = async (_url, init) => {
  console.log("[FORM_DRY_RUN] e-posta:", JSON.parse(init.body));
  return new Response("{}", { status: 200 });
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/api/contact") {
    if (req.method !== "POST") return res.writeHead(405).end();
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: "POST", headers: req.headers, body: Buffer.concat(chunks) });
    const dry = process.env.FORM_DRY_RUN === "1";
    const env = dry ? { RESEND_API_KEY: "dry", CONTACT_TO_EMAIL: "dry@local" } : process.env;
    const response = await handle(request, { env, send: dry ? dryRunSend : fetch });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return res.end(Buffer.from(await response.arrayBuffer()));
  }

  const redirect = vercel.redirects.find((r) => r.source === url.pathname);
  if (redirect) return res.writeHead(308, { location: redirect.destination }).end();

  let file = normalize(join(out, decodeURIComponent(url.pathname)));
  if (!file.startsWith(out)) return res.writeHead(403).end();
  if (url.pathname === "/") file = join(out, "index.html");
  else if (!extname(file) && existsSync(file + ".html")) file += ".html";

  let status = 200;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    status = 404;
    file = join(out, "404.html");
  }
  res.writeHead(status, { "content-type": TYPES[extname(file)] || "application/octet-stream", ...headersFor(url.pathname) });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`→ http://localhost:${port}`));
