// ARKADAŞ DAVETİ: /d/<jeton> (vercel.json yönlendirmesi → tarayıcı diline göre /davet, /en/invite, /es/invitacion, /de/einladung, /fr/invitation)
// oyunu autoyard://davet/<jeton> ile açar. Android'de Chrome "intent:" adresiyle uygulamayı açar; uygulama yüklü
// değilse bu sayfaya "?yok" ile geri döner ve indirme düğmesi öne çıkar. Jetonun geçerliliğini oyun denetler
// (1 saat; firebase/firestore.rules invites). Mesajlar sayfanın dilinde, #davet-not'un data-* özniteliklerinde.
(() => {
  const button = document.getElementById("davet-ac");
  const note = document.getElementById("davet-not");
  if (!button || !note) return;
  const match = location.pathname.match(/^\/d\/([A-HJ-NP-Z2-9]{12})\/?$/i);
  if (!match) {
    button.hidden = true;
    note.textContent = note.dataset.invalid;
    return;
  }
  if (!/Android/i.test(navigator.userAgent)) {
    button.hidden = true;
    note.textContent = note.dataset.desktop;
    return;
  }
  const token = match[1].toUpperCase();
  const back = `${location.origin}/d/${token}?yok`;
  const intent = `intent://davet/${token}#Intent;scheme=autoyard;package=${button.dataset.package};` +
    `S.browser_fallback_url=${encodeURIComponent(back)};end`;
  button.setAttribute("href", intent);
  if (new URLSearchParams(location.search).has("yok")) {
    note.textContent = note.dataset.missing;
    return;
  }
  // Bir kez kendiliğinden dene; tarayıcı dokunuşsuz açmayı engellerse düğme duruyor.
  setTimeout(() => { location.href = intent; }, 400);
})();
