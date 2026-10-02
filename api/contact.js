// POST /api/contact — iletişim ve hesap silme formları.
// JSON (fetch) ya da form-urlencoded (JS kapalıyken) kabul eder; Resend ile e-posta gönderir.
// Ortam değişkenleri: RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL (bkz. .env.example)

const TOPICS = {
  destek: "Destek / soru",
  hata: "Hata bildirimi",
  oneri: "Öneri",
  haber: "Oyun çıkınca haber ver",
  veri: "Kişisel veri talebi (KVKK)",
  diger: "Diğer",
};
const SCOPES = { hesap: "Hesap ve tüm veriler", "bulut-kaydi": "Yalnızca bulut kaydı" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY_BYTES = 20_000;

// Örnek başına basit hız sınırı (sunucusuz örnekler arasında paylaşılmaz; kötüye kullanıma karşı ilk set).
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const hits = new Map();

export function rateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_MAX;
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function validate(input) {
  const errors = {};
  const type = input.type === "hesap-silme" ? "hesap-silme" : "iletisim";
  const data = {
    type,
    name: str(input.name, 100),
    email: str(input.email, 200),
    message: str(input.message, 5000),
    topic: str(input.topic, 20),
    scope: str(input.scope, 20),
    consent: input.consent === "yes" || input.consent === true,
  };

  if (!EMAIL_RE.test(data.email)) errors.email = "Geçerli bir e-posta adresi yaz.";
  if (!data.consent) errors.consent = "Onay kutusu işaretlenmeli.";
  if (type === "iletisim") {
    if (!data.name) errors.name = "Adını yaz.";
    if (!(data.topic in TOPICS)) errors.topic = "Bir konu seç.";
    if (data.message.length < 10) errors.message = "Mesaj en az 10 karakter olmalı.";
  } else if (!(data.scope in SCOPES)) {
    errors.scope = "Ne silineceğini seç.";
  }
  return { data, errors };
}

export function buildEmail(d) {
  if (d.type === "hesap-silme") {
    return {
      subject: `[Auto Yard] Hesap silme talebi — ${SCOPES[d.scope]}`,
      text: [
        `Talep: ${SCOPES[d.scope]}`,
        `Google e-postası: ${d.email}`,
        `Oyundaki ad: ${d.name || "-"}`,
        `Not: ${d.message || "-"}`,
        "",
        "Yapılacaklar: 1) Bu adrese doğrulama e-postası gönder. 2) Yanıt gelince Firebase Auth kullanıcısını",
        "ve Firestore players/{uid} dokümanını sil. 3) Tamamlandığını bildir (30 gün sınırı).",
        `Talep zamanı: ${new Date().toISOString()}`,
      ].join("\n"),
    };
  }
  return {
    subject: `[Auto Yard] ${TOPICS[d.topic]} — ${d.name}`,
    text: [`Ad: ${d.name}`, `E-posta: ${d.email}`, `Konu: ${TOPICS[d.topic]}`, "", d.message].join("\n"),
  };
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error("too-large");
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return JSON.parse(raw || "{}");
  return Object.fromEntries(new URLSearchParams(raw));
}

function reply(request, status, payload) {
  const wantsJson = (request.headers.get("accept") || "").includes("application/json");
  if (wantsJson) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  // JS kapalı tarayıcı: başarıda teşekkür sayfasına, hatada basit bir sayfaya.
  if (payload.ok) return new Response(null, { status: 303, headers: { location: "/tesekkurler" } });
  const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gönderilemedi</title><body style="font-family:system-ui;max-width:640px;margin:3rem auto;padding:0 16px"><h1>Gönderilemedi</h1><p>${escapeHtml(payload.message)}</p><p>Tarayıcının geri tuşuyla forma dönüp tekrar deneyebilirsin. <a href="/">Ana sayfa</a></p></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Vercel yalnızca isteği verir; testler ortamı ve fetch'i handle() ile enjekte eder.
export function POST(request) {
  return handle(request, { env: process.env, send: fetch });
}

export async function handle(request, { env, send }) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";

  let input;
  try {
    input = await readBody(request);
  } catch {
    return reply(request, 400, { ok: false, message: "İstek okunamadı." });
  }

  // Bal tuzağı dolu → bot. Başarılı gibi yanıt ver, hiçbir şey gönderme.
  if (str(input.website, 200)) return reply(request, 200, { ok: true, message: "Mesajın alındı. Teşekkürler!" });

  if (rateLimited(ip)) {
    return reply(request, 429, { ok: false, message: "Çok fazla deneme yaptın. Lütfen 10 dakika sonra tekrar dene." });
  }

  const { data, errors } = validate(input);
  if (Object.keys(errors).length) {
    return reply(request, 422, { ok: false, message: "Formda eksik veya hatalı alanlar var: " + Object.values(errors).join(" "), errors });
  }

  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL) {
    console.error("contact: RESEND_API_KEY / CONTACT_TO_EMAIL tanımlı değil");
    return reply(request, 503, { ok: false, message: "Form şu anda geçici olarak çalışmıyor." });
  }

  const { subject, text } = buildEmail(data);
  try {
    const res = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL || "Auto Yard <onboarding@resend.dev>",
        to: [env.CONTACT_TO_EMAIL],
        reply_to: data.email,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      console.error("contact: Resend hata", res.status, await res.text().catch(() => ""));
      return reply(request, 502, { ok: false, message: "Mesaj şu anda iletilemedi. Lütfen biraz sonra tekrar dene." });
    }
  } catch (err) {
    console.error("contact: Resend erişilemedi", err);
    return reply(request, 502, { ok: false, message: "Mesaj şu anda iletilemedi. Lütfen biraz sonra tekrar dene." });
  }

  const message =
    data.type === "hesap-silme"
      ? "Talebin alındı. Doğrulama için e-posta adresine yazacağız; işlem en geç 30 gün içinde tamamlanır."
      : "Mesajın alındı. Genellikle 3 iş günü içinde yanıt veririz.";
  return reply(request, 200, { ok: true, message });
}
