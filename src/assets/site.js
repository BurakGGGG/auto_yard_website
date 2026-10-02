// Auto Yard — çerez onayı, onaya bağlı analytics, form gönderimi.
(() => {
  "use strict";

  // ---------- Çerez / analiz onayı ----------
  const CONSENT_KEY = "ay-consent";
  const CONSENT_VERSION = 1;
  const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

  function readConsent() {
    try {
      const c = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
      if (!c || c.v !== CONSENT_VERSION || Date.now() - c.ts > CONSENT_MAX_AGE_MS) return null;
      return c;
    } catch {
      return null;
    }
  }

  function writeConsent(analytics) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, analytics, ts: Date.now() }));
    } catch {
      /* gizli pencere vb.: tercih yalnızca bu sayfa için geçerli */
    }
  }

  let analyticsLoaded = false;
  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    const wanted = (document.documentElement.dataset.analytics || "").split(",");
    if (wanted.includes("web")) {
      window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
      addScript("/_vercel/insights/script.js");
    }
    if (wanted.includes("speed")) {
      window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
      addScript("/_vercel/speed-insights/script.js");
    }
  }

  function addScript(src) {
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    document.head.appendChild(s);
  }

  const banner = document.getElementById("consent");
  let returnFocusTo = null;

  function showBanner(fromUser) {
    if (!banner) return;
    banner.hidden = false;
    if (fromUser) {
      returnFocusTo = document.activeElement;
      const first = banner.querySelector("[data-consent]");
      if (first) first.focus();
    }
  }

  function hideBanner() {
    if (!banner) return;
    banner.hidden = true;
    if (returnFocusTo && document.contains(returnFocusTo)) returnFocusTo.focus();
    returnFocusTo = null;
  }

  const stored = readConsent();
  if (stored) {
    if (stored.analytics) loadAnalytics();
  } else if (navigator.globalPrivacyControl) {
    // GPC sinyali = ret; banner gösterilmez, alt bilgideki düğmeden yine onay verilebilir.
  } else {
    showBanner(false);
  }

  document.addEventListener("click", (e) => {
    const choice = e.target.closest("[data-consent]");
    if (choice) {
      const accepted = choice.dataset.consent === "accept";
      writeConsent(accepted);
      if (accepted) loadAnalytics();
      hideBanner();
      return;
    }
    if (e.target.closest("[data-consent-open]")) showBanner(true);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && banner && !banner.hidden && returnFocusTo) hideBanner();
  });

  // ---------- Formlar ----------
  const params = new URLSearchParams(location.search);
  const topic = document.getElementById("c-topic");
  if (topic && params.has("konu")) {
    const opt = Array.from(topic.options).find((o) => o.value === params.get("konu"));
    if (opt) topic.value = opt.value;
  }

  function messageFor(el) {
    const v = el.validity;
    if (v.valueMissing) return el.type === "checkbox" ? "Devam etmek için bu kutuyu işaretlemelisin." : "Bu alan zorunlu.";
    if (v.typeMismatch && el.type === "email") return "Geçerli bir e-posta adresi yaz (ör. ad@ornek.com).";
    if (v.tooShort) return `En az ${el.minLength} karakter yaz.`;
    if (v.tooLong) return `En fazla ${el.maxLength} karakter yazabilirsin.`;
    return "Bu alanı kontrol et.";
  }

  function setFieldError(el, msg) {
    const id = `${el.id}-error`;
    let err = document.getElementById(id);
    const describedBy = (el.getAttribute("aria-describedby") || "").split(" ").filter((x) => x && x !== id);
    if (!msg) {
      if (err) err.remove();
      el.removeAttribute("aria-invalid");
      if (describedBy.length) el.setAttribute("aria-describedby", describedBy.join(" "));
      else el.removeAttribute("aria-describedby");
      return;
    }
    if (!err) {
      err = document.createElement("p");
      err.id = id;
      err.className = "field-error";
      (el.closest(".field") || el.parentElement).appendChild(err);
    }
    err.textContent = msg;
    el.setAttribute("aria-invalid", "true");
    el.setAttribute("aria-describedby", [...describedBy, id].join(" "));
  }

  function validate(form) {
    let firstInvalid = null;
    let count = 0;
    for (const el of form.querySelectorAll("input, select, textarea")) {
      if (el.type === "hidden" || el.closest(".hp")) continue;
      if (el.type === "radio") continue; // bir seçenek her zaman işaretli
      if (el.checkValidity()) {
        setFieldError(el, "");
      } else {
        setFieldError(el, messageFor(el));
        count++;
        firstInvalid = firstInvalid || el;
      }
    }
    return { firstInvalid, count };
  }

  for (const form of document.querySelectorAll("form[data-form]")) {
    form.noValidate = true;
    const status = form.querySelector("[data-form-status]");
    const button = form.querySelector('button[type="submit"]');
    const mailHint = form.dataset.fallbackEmail ? ` ${form.dataset.fallbackEmail} adresine e-posta da gönderebilirsin.` : "";
    const setStatus = (state, text) => {
      status.dataset.state = state;
      status.textContent = text;
    };

    form.addEventListener("input", (e) => {
      if (e.target.getAttribute("aria-invalid") === "true" && e.target.checkValidity()) setFieldError(e.target, "");
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { firstInvalid, count } = validate(form);
      if (firstInvalid) {
        setStatus("error", count === 1 ? "Formda 1 alan eksik veya hatalı." : `Formda ${count} alan eksik veya hatalı.`);
        firstInvalid.focus();
        return;
      }

      const data = Object.fromEntries(new FormData(form).entries());
      button.disabled = true;
      setStatus("pending", "Gönderiliyor…");
      try {
        const res = await fetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          form.reset();
          setStatus("ok", body.message || "Mesajın alındı. Teşekkürler!");
        } else {
          setStatus("error", (body.message || "Gönderilemedi. Lütfen biraz sonra tekrar dene.") + mailHint);
        }
      } catch {
        setStatus("error", "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene." + mailHint);
      } finally {
        button.disabled = false;
      }
    });
  }
})();
