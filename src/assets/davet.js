// ARKADAŞ DAVETİ: /d/<jeton>[?r=<KOD>] ve /r/<KOD> (vercel.json yönlendirmesi → tarayıcı diline göre /davet, /en/invite,
// /es/invitacion, /de/einladung, /fr/invitation). <jeton> 1 saatlik arkadaş ekleme davetidir; <KOD> davet edenin kalıcı
// arkadaş kodudur (davet ödülü, oyun docs/ARKADAS_DAVET.md). Sayfa kodu gösterir ve oyunu autoyard://davet/<jeton>?r=<KOD>
// (jetonsuzsa autoyard://davet/r/<KOD>) ile açar. Android'de Chrome "intent:" adresiyle uygulamayı açar; uygulama yüklü
// değilse: Play yayındaysa ve kod varsa doğrudan Play'e gider, kod yükleme kaynağı (referrer) olarak taşınır (oyun ilk
// açılışta okur); değilse bu sayfaya "?yok" ile döner ve indirme düğmesi öne çıkar. Jetonun ve kodun geçerliliğini oyun
// ve sunucu denetler. Mesajlar sayfanın dilinde, #davet-not'un data-* özniteliklerinde.
(() => {
  const button = document.getElementById("davet-ac");
  const note = document.getElementById("davet-not");
  if (!button || !note) return;
  const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
  // Oyundaki SocialNames.normalize_code ile aynı: büyük harf, boşluk / tire / "AY" öneki atılır
  const cleanCode = (raw) => {
    let code = String(raw || "").trim().toUpperCase().replace(/[\s-]/g, "");
    if (code.startsWith("AY") && code.length === 8) code = code.slice(2);
    return CODE_RE.test(code) ? code : "";
  };
  const params = new URLSearchParams(location.search);
  const tokenMatch = location.pathname.match(/^\/d\/([A-HJ-NP-Z2-9]{12})\/?$/i);
  const codeMatch = location.pathname.match(/^\/r\/([A-Za-z0-9-]{6,9})\/?$/);
  const token = tokenMatch ? tokenMatch[1].toUpperCase() : "";
  const code = cleanCode(codeMatch ? codeMatch[1] : params.get("r"));
  if (!token && !code) {
    button.hidden = true;
    note.textContent = note.dataset.invalid;
    return;
  }
  const codeBox = document.getElementById("davet-kod");
  if (code && codeBox) {
    codeBox.querySelector("[data-code]").textContent = `AY-${code}`;
    codeBox.hidden = false;
  }
  // Play adresi + yükleme kaynağı: sayfadaki Play düğmeleri de kodu taşısın
  const live = button.dataset.live === "true";
  const playBase = button.dataset.play || "";
  const referrer = code ? `ref=${code}${token ? `&inv=${token}` : ""}` : "";
  const play = playBase && referrer ? `${playBase}&referrer=${encodeURIComponent(referrer)}` : playBase;
  if (playBase && referrer) {
    for (const link of document.querySelectorAll("a[href]")) {
      if (link.getAttribute("href") === playBase) link.setAttribute("href", play);
    }
  }
  if (!/Android/i.test(navigator.userAgent)) {
    button.hidden = true;
    note.textContent = note.dataset.desktop;
    return;
  }
  const appPath = token ? `davet/${token}${code ? `?r=${code}` : ""}` : `davet/r/${code}`;
  const back = `${location.origin}${location.pathname}?yok${tokenMatch && code ? `&r=${code}` : ""}`;
  const fallback = live && code && playBase ? play : back;
  const intent = `intent://${appPath}#Intent;scheme=autoyard;package=${button.dataset.package};` +
    `S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  button.setAttribute("href", intent);
  if (params.has("yok")) {
    note.textContent = note.dataset.missing;
    return;
  }
  // Bir kez kendiliğinden dene; tarayıcı dokunuşsuz açmayı engellerse düğme duruyor.
  setTimeout(() => { location.href = intent; }, 400);
})();
