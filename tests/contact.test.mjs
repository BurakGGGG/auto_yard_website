import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, validate } from "../api/contact.js";

const ENV = { RESEND_API_KEY: "re_test", CONTACT_TO_EMAIL: "dev@example.com", CONTACT_FROM_EMAIL: "Auto Yard <onboarding@resend.dev>" };
let ipCounter = 0;

function req(body, { json = true, accept = "application/json" } = {}) {
  return new Request("https://site.test/api/contact", {
    method: "POST",
    headers: {
      "content-type": json ? "application/json" : "application/x-www-form-urlencoded",
      accept,
      "x-forwarded-for": `10.0.0.${++ipCounter}`,
    },
    body: json ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  });
}

function fakeSend(status = 200) {
  const calls = [];
  const send = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return new Response("{}", { status });
  };
  return { calls, send };
}

const contact = { type: "iletisim", name: "Ayşe", email: "ayse@example.com", topic: "hata", message: "Garajda araba kayboldu.", consent: "yes" };
const deletion = { type: "hesap-silme", email: "oyuncu@gmail.com", scope: "hesap", consent: "yes" };

test("geçerli iletişim formu Resend'e gider", async () => {
  const { calls, send } = fakeSend();
  const res = await handle(req(contact), { env: ENV, send });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].auth, "Bearer re_test");
  assert.deepEqual(calls[0].body.to, ["dev@example.com"]);
  assert.equal(calls[0].body.reply_to, "ayse@example.com");
  assert.match(calls[0].body.subject, /Hata bildirimi/);
  assert.match(calls[0].body.text, /Garajda araba kayboldu/);
});

test("hesap silme formu kapsamı konuya yazar", async () => {
  const { calls, send } = fakeSend();
  const res = await handle(req(deletion), { env: ENV, send });
  assert.equal(res.status, 200);
  assert.match(calls[0].body.subject, /Hesap silme talebi — Hesap ve tüm veriler/);
  assert.match((await res.json()).message, /30 gün/);
});

test("eksik alanlar 422 ve alan hataları döner, e-posta gitmez", async () => {
  const { calls, send } = fakeSend();
  const res = await handle(req({ type: "iletisim", email: "kotu", message: "kısa" }), { env: ENV, send });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.deepEqual(Object.keys(body.errors).sort(), ["consent", "email", "message", "name", "topic"]);
  assert.equal(calls.length, 0);
});

test("bal tuzağı dolu → başarı gibi görünür ama gönderilmez", async () => {
  const { calls, send } = fakeSend();
  const res = await handle(req({ ...contact, website: "http://spam" }), { env: ENV, send });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test("ortam değişkeni yoksa 503", async () => {
  const { send } = fakeSend();
  const res = await handle(req(contact), { env: {}, send });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).ok, false);
});

test("Resend hatası 502 olur", async () => {
  const { send } = fakeSend(500);
  const res = await handle(req(contact), { env: ENV, send });
  assert.equal(res.status, 502);
});

test("JS kapalı form gönderimi teşekkür sayfasına yönlenir", async () => {
  const { send } = fakeSend();
  const res = await handle(req(contact, { json: false, accept: "text/html" }), { env: ENV, send });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/tesekkurler");
});

test("JS kapalı hatalı gönderim HTML hata sayfası verir", async () => {
  const { send } = fakeSend();
  const res = await handle(req({ type: "iletisim" }, { json: false, accept: "text/html" }), { env: ENV, send });
  assert.equal(res.status, 422);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(await res.text(), /Gönderilemedi/);
});

test("aynı IP'den 5'ten fazla istek 429 alır", async () => {
  const { send } = fakeSend();
  const make = () =>
    new Request("https://site.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify(contact),
    });
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await handle(make(), { env: ENV, send })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

test("validate: alanları kırpar ve uzunluğu sınırlar", () => {
  const { data, errors } = validate({ ...contact, name: "  Ali  ", message: "x".repeat(6000) });
  assert.equal(data.name, "Ali");
  assert.equal(data.message.length, 5000);
  assert.deepEqual(errors, {});
});

test("bozuk JSON 400 döner", async () => {
  const r = new Request("https://site.test/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: "{bozuk",
  });
  const res = await handle(r, { env: ENV, send: fakeSend().send });
  assert.equal(res.status, 400);
});
