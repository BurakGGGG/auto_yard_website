// Auto Yard — çerez onayı, onaya bağlı analytics, form gönderimi, paylaşım, tanıtım videosu.
// Metinler sayfadaki <script type="application/json" id="site-i18n"> bloğundan gelir (her dil kendi metniyle).
(() => {
  "use strict";

  let T = {};
  try {
    T = JSON.parse(document.getElementById("site-i18n")?.textContent || "{}");
  } catch {
    T = {};
  }
  const t = (key, vars = {}) => (T[key] || key).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

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
  const wanted = params.get("konu") || params.get("topic");
  if (topic && wanted) {
    const opt = Array.from(topic.options).find((o) => o.value === wanted);
    if (opt) topic.value = opt.value;
  }

  function messageFor(el) {
    const v = el.validity;
    if (v.valueMissing) return el.type === "checkbox" ? t("required_check") : t("required");
    if (v.typeMismatch && el.type === "email") return t("email");
    if (v.tooShort) return t("too_short", { n: el.minLength });
    if (v.tooLong) return t("too_long", { n: el.maxLength });
    return t("invalid");
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
    const mailHint = form.dataset.fallbackEmail ? t("mail_hint", { email: form.dataset.fallbackEmail }) : "";
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
        setStatus("error", count === 1 ? t("errors_one") : t("errors_many", { n: count }));
        firstInvalid.focus();
        return;
      }

      const data = Object.fromEntries(new FormData(form).entries());
      button.disabled = true;
      setStatus("pending", t("sending"));
      try {
        const res = await fetch(form.action, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          form.reset();
          setStatus("ok", body.message || t("sent"));
        } else {
          setStatus("error", (body.message || t("failed")) + mailHint);
        }
      } catch {
        setStatus("error", t("offline") + mailHint);
      } finally {
        button.disabled = false;
      }
    });
  }
  // ---------- Paylaşım ----------
  for (const box of document.querySelectorAll("[data-share]")) {
    const data = { title: box.dataset.shareTitle, text: box.dataset.shareText, url: box.dataset.shareUrl };
    const status = box.querySelector("[data-share-status]");
    const native = box.querySelector("[data-share-native]");
    if (native && navigator.share) {
      native.hidden = false;
      native.addEventListener("click", () => navigator.share(data).catch(() => {}));
    }
    const copy = box.querySelector("[data-share-copy]");
    if (copy) {
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(data.url);
          status.textContent = t("copied");
        } catch {
          status.textContent = t("copy_failed", { url: data.url });
        }
      });
    }
  }

  // ---------- Tanıtım videosu: sayfa yüklendikten sonra, görünür olunca iner ve oynar; durdur/oynat düğmesi ----------
  // Hareket azaltma tercihi ya da veri tasarrufu açıksa video hiç inmez, kapak görseli kalır. Dar ekranda 480p sürüm.
  for (const box of document.querySelectorAll("[data-video]")) {
    const video = box.querySelector("video");
    const toggle = box.querySelector(".video-toggle");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.connection?.saveData;
    if (!video || still) continue;
    let started = false;
    let userPaused = false;
    const setPlaying = (playing) => {
      toggle.setAttribute("aria-pressed", String(playing));
      toggle.setAttribute("aria-label", playing ? t("video_pause") : t("video_play"));
    };
    const start = () => {
      if (started) return;
      started = true;
      video.src = innerWidth < 900 && video.dataset.srcSmall ? video.dataset.srcSmall : video.dataset.src;
      video.hidden = false;
      toggle.hidden = false;
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };
    toggle.addEventListener("click", () => {
      if (video.paused) {
        userPaused = false;
        video.play().then(() => setPlaying(true)).catch(() => {});
      } else {
        userPaused = true;
        video.pause();
        setPlaying(false);
      }
    });
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          start();
          if (!userPaused && video.paused && started) video.play().then(() => setPlaying(true)).catch(() => {});
        } else if (started && !video.paused) {
          video.pause();
        }
      }
    }, { threshold: 0.25 });
    // Sayfanın kendi görselleri ve yazı tipleri önce insin: video yüklemesi "load" olayından sonra başlar
    const watch = () => setTimeout(() => io.observe(box), 300);
    if (document.readyState === "complete") watch();
    else addEventListener("load", watch, { once: true });
  }

  // ---------- SSS: #sss-... ile gelinirse ilgili soruyu aç ----------
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (el && el.tagName === "DETAILS") el.open = true;
  }
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
})();
