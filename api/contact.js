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

// Ziyaretçiye dönen metinler formun dilinde (gizli "lang" alanı); geliştiriciye giden e-posta Türkçe kalır.
const LANGS = ["tr", "en", "es", "de", "fr"];
const THANKS = { tr: "/tesekkurler", en: "/en/thanks", es: "/es/gracias", de: "/de/danke", fr: "/fr/merci" };
const HOME = { tr: "/", en: "/en", es: "/es", de: "/de", fr: "/fr" };
const M = {
  tr: {
    email: "Geçerli bir e-posta adresi yaz.", consent: "Onay kutusu işaretlenmeli.", name: "Adını yaz.", topic: "Bir konu seç.",
    message: "Mesaj en az 10 karakter olmalı.", scope: "Ne silineceğini seç.", unreadable: "İstek okunamadı.",
    received: "Mesajın alındı. Teşekkürler!", rate: "Çok fazla deneme yaptın. Lütfen 10 dakika sonra tekrar dene.",
    invalid: "Formda eksik veya hatalı alanlar var:", down: "Form şu anda geçici olarak çalışmıyor.",
    failed: "Mesaj şu anda iletilemedi. Lütfen biraz sonra tekrar dene.",
    deletion: "Talebin alındı. Doğrulama için e-posta adresine yazacağız; işlem en geç 30 gün içinde tamamlanır.",
    contact: "Mesajın alındı. Genellikle 3 iş günü içinde yanıt veririz.",
    errorTitle: "Gönderilemedi", errorBack: "Tarayıcının geri tuşuyla forma dönüp tekrar deneyebilirsin.", home: "Ana sayfa",
  },
  en: {
    email: "Enter a valid email address.", consent: "Please tick the confirmation box.", name: "Enter your name.", topic: "Choose a topic.",
    message: "The message must be at least 10 characters.", scope: "Choose what should be deleted.", unreadable: "The request couldn't be read.",
    received: "Message received. Thank you!", rate: "Too many attempts. Please try again in 10 minutes.",
    invalid: "Some fields are missing or invalid:", down: "The form is temporarily unavailable.",
    failed: "Your message couldn't be delivered right now. Please try again in a moment.",
    deletion: "Request received. We'll write to your email address to confirm; it will be completed within 30 days at the latest.",
    contact: "Message received. We usually reply within 3 working days.",
    errorTitle: "Couldn't send", errorBack: "Use your browser's back button to return to the form and try again.", home: "Home page",
  },
  es: {
    email: "Escribe un correo válido.", consent: "Marca la casilla de confirmación.", name: "Escribe tu nombre.", topic: "Elige un asunto.",
    message: "El mensaje debe tener al menos 10 caracteres.", scope: "Elige qué quieres borrar.", unreadable: "No se pudo leer la solicitud.",
    received: "Mensaje recibido. ¡Gracias!", rate: "Demasiados intentos. Vuelve a intentarlo dentro de 10 minutos.",
    invalid: "Faltan campos o no son válidos:", down: "El formulario no está disponible en este momento.",
    failed: "No se pudo enviar el mensaje ahora. Inténtalo de nuevo en un momento.",
    deletion: "Solicitud recibida. Te escribiremos al correo para confirmarla; se completará en un plazo máximo de 30 días.",
    contact: "Mensaje recibido. Normalmente respondemos en un plazo de 3 días laborables.",
    errorTitle: "No se pudo enviar", errorBack: "Usa el botón Atrás del navegador para volver al formulario e inténtalo de nuevo.", home: "Inicio",
  },
  de: {
    email: "Gib eine gültige E-Mail-Adresse ein.", consent: "Bitte setze das Bestätigungshäkchen.", name: "Gib deinen Namen ein.", topic: "Wähle ein Thema.",
    message: "Die Nachricht muss mindestens 10 Zeichen lang sein.", scope: "Wähle aus, was gelöscht werden soll.", unreadable: "Die Anfrage konnte nicht gelesen werden.",
    received: "Nachricht erhalten. Danke!", rate: "Zu viele Versuche. Bitte versuch es in 10 Minuten erneut.",
    invalid: "Einige Felder fehlen oder sind ungültig:", down: "Das Formular ist vorübergehend nicht verfügbar.",
    failed: "Deine Nachricht konnte gerade nicht zugestellt werden. Bitte versuch es gleich noch einmal.",
    deletion: "Anfrage erhalten. Wir schreiben dir zur Bestätigung an deine E-Mail-Adresse; die Löschung ist spätestens nach 30 Tagen abgeschlossen.",
    contact: "Nachricht erhalten. Wir antworten in der Regel innerhalb von 3 Werktagen.",
    errorTitle: "Senden fehlgeschlagen", errorBack: "Geh mit der Zurück-Taste deines Browsers zum Formular zurück und versuch es erneut.", home: "Startseite",
  },
  fr: {
    email: "Saisissez une adresse e-mail valide.", consent: "Veuillez cocher la case de confirmation.", name: "Saisissez votre nom.", topic: "Choisissez un sujet.",
    message: "Le message doit contenir au moins 10 caractères.", scope: "Choisissez ce qui doit être supprimé.", unreadable: "La demande n’a pas pu être lue.",
    received: "Message reçu. Merci\u00a0!", rate: "Trop de tentatives. Veuillez réessayer dans 10 minutes.",
    invalid: "Certains champs sont manquants ou invalides\u00a0:", down: "Le formulaire est temporairement indisponible.",
    failed: "Votre message n’a pas pu être envoyé pour le moment. Veuillez réessayer dans un instant.",
    deletion: "Demande reçue. Nous vous écrirons à votre adresse e-mail pour confirmer\u00a0; la suppression sera effectuée sous 30 jours au plus tard.",
    contact: "Message reçu. Nous répondons généralement sous 3 jours ouvrés.",
    errorTitle: "Envoi impossible", errorBack: "Utilisez le bouton Retour de votre navigateur pour revenir au formulaire et réessayer.", home: "Accueil",
  },
};
const langOf = (input) => (LANGS.includes(input?.lang) ? input.lang : "tr");
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
  const t = M[langOf(input)];
  const type = input.type === "hesap-silme" ? "hesap-silme" : "iletisim";
  const data = {
    type,
    name: str(input.name, 100),
    email: str(input.email, 200),
    message: str(input.message, 5000),
    lang: langOf(input),
    topic: str(input.topic, 20),
    scope: str(input.scope, 20),
    consent: input.consent === "yes" || input.consent === true,
  };

  if (!EMAIL_RE.test(data.email)) errors.email = t.email;
  if (!data.consent) errors.consent = t.consent;
  if (type === "iletisim") {
    if (!data.name) errors.name = t.name;
    if (!(data.topic in TOPICS)) errors.topic = t.topic;
    if (data.message.length < 10) errors.message = t.message;
  } else if (!(data.scope in SCOPES)) {
    errors.scope = t.scope;
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
        `Site dili: ${d.lang}`,
        "",
        "Yapılacaklar: 1) Bu adrese doğrulama e-postası gönder. 2) Yanıt gelince Firebase konsolunda e-postadan uid'i bul.",
        "3) Yalnızca bulut kaydı: players/{uid} sil. Hesap ve tüm veriler: ayrıca garages/g_{uid}, avatars/a_{uid},",
        "   codes/{kodu}, push/p_{uid}, users/{uid}/(friends|inbox|outbox|races|gifts)/* ve karşı taraftaki eşleri",
        "   (users/{x}/friends/f_{uid}, users/{x}/inbox/r_{uid}, users/{x}/outbox/o_{uid}, users/{x}/races/e_{uid}),",
        "   uid'li invites/* ve Firebase Auth kullanıcısı. 4) Tamamlandığını bildir (30 gün sınırı).",
        `Talep zamanı: ${new Date().toISOString()}`,
      ].join("\n"),
    };
  }
  return {
    subject: `[Auto Yard] ${TOPICS[d.topic]} — ${d.name}`,
    text: [`Ad: ${d.name}`, `E-posta: ${d.email}`, `Konu: ${TOPICS[d.topic]}`, `Site dili: ${d.lang}`, "", d.message].join("\n"),
  };
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error("too-large");
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return JSON.parse(raw || "{}");
  return Object.fromEntries(new URLSearchParams(raw));
}

function reply(request, status, payload, lang = "tr") {
  const wantsJson = (request.headers.get("accept") || "").includes("application/json");
  if (wantsJson) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  // JS kapalı tarayıcı: başarıda teşekkür sayfasına, hatada basit bir sayfaya.
  if (payload.ok) return new Response(null, { status: 303, headers: { location: THANKS[lang] } });
  const t = M[lang];
  const html = `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.errorTitle}</title><body style="font-family:system-ui;max-width:640px;margin:3rem auto;padding:0 16px"><h1>${t.errorTitle}</h1><p>${escapeHtml(payload.message)}</p><p>${t.errorBack} <a href="${HOME[lang]}">${t.home}</a></p></body></html>`;
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
    return reply(request, 400, { ok: false, message: M.tr.unreadable });
  }
  const lang = langOf(input);
  const t = M[lang];

  // Bal tuzağı dolu → bot. Başarılı gibi yanıt ver, hiçbir şey gönderme.
  if (str(input.website, 200)) return reply(request, 200, { ok: true, message: t.received }, lang);

  if (rateLimited(ip)) {
    return reply(request, 429, { ok: false, message: t.rate }, lang);
  }

  const { data, errors } = validate(input);
  if (Object.keys(errors).length) {
    return reply(request, 422, { ok: false, message: `${t.invalid} ` + Object.values(errors).join(" "), errors }, lang);
  }

  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL) {
    console.error("contact: RESEND_API_KEY / CONTACT_TO_EMAIL tanımlı değil");
    return reply(request, 503, { ok: false, message: t.down }, lang);
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
      return reply(request, 502, { ok: false, message: t.failed }, lang);
    }
  } catch (err) {
    console.error("contact: Resend erişilemedi", err);
    return reply(request, 502, { ok: false, message: t.failed }, lang);
  }

  const message = data.type === "hesap-silme" ? t.deletion : t.contact;
  return reply(request, 200, { ok: true, message }, lang);
}
