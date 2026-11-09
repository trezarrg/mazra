import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../deployments/pages-gateway.mjs";

const url = "https://app.example/lainnya";

test("gateway mempertahankan respons, cookie, URL dan body transaksi", async () => {
  const request = new Request(url, {method:"POST", headers:{Cookie:"session=example"}, body:"amount=100"});
  const response = new Response("tersimpan", {status:201, headers:{"Set-Cookie":"session=renewed; HttpOnly"}});
  const result = await gateway.fetch(request, {APP:{async fetch(incoming) {
    assert.equal(incoming.url, url);
    assert.equal(incoming.headers.get("Cookie"), "session=example");
    assert.equal(await incoming.text(), "amount=100");
    return response;
  }}});
  assert.equal(result, response);
});

test("exception sementara saat membuka halaman pulih setelah satu percobaan ulang", async t => {
  t.mock.method(console, "error", () => {});
  let attempts = 0;
  const request = new Request(url, {headers:{Cookie:"session=example"}});
  const response = new Response("halaman");
  assert.equal(await gateway.fetch(request, {APP:{fetch(incoming) {
    assert.equal(incoming, request);
    if (++attempts === 1) return Promise.reject(new Error("temporary failure"));
    return response;
  }}}), response);
  assert.equal(attempts, 2);
  assert.equal(console.error.mock.callCount(), 1);
});

test("gangguan menetap dibatasi, tidak di-cache, dan menyediakan pemulihan manual", async t => {
  t.mock.method(console, "error", () => {});
  let attempts = 0;
  const result = await gateway.fetch(new Request(url, {headers:{Accept:"text/html"}}), {APP:{fetch() {
    attempts++;
    throw new Error("internal details");
  }}});
  assert.equal(attempts, 2);
  assert.equal(result.status, 503);
  assert.match(result.headers.get("Cache-Control"), /no-store/);
  const html = await result.text();
  assert.match(html, /Coba lagi/);
  assert.ok(!html.includes("internal details"));
});

test("transaksi dan Server Actions tidak dikirim ulang setelah exception", async t => {
  t.mock.method(console, "error", () => {});
  for (const options of [{method:"POST",body:"amount=100"}, {method:"DELETE"}, {headers:{"Next-Action":"action"}}, {headers:{"X-RSC-Action":"action"}}]) {
    let attempts = 0;
    const result = await gateway.fetch(new Request(url, options), {APP:{async fetch(request) {
      attempts++;
      if (request.body) await request.text();
      throw new Error("failed after write");
    }}});
    assert.equal(result.status, 503);
    assert.equal(attempts, 1);
  }
});

test("error non-retryable tidak diulang dan respons HTTP aplikasi tetap utuh", async t => {
  t.mock.method(console, "error", () => {});
  let attempts = 0;
  await gateway.fetch(new Request(url), {APP:{fetch() {
    attempts++;
    throw Object.assign(new Error("do not retry"), {retryable:false});
  }}});
  assert.equal(attempts, 1);
  for (const status of [302, 401, 403, 500, 503]) {
    const response = new Response(null, {status});
    assert.equal(await gateway.fetch(new Request(url), {APP:{fetch:() => response}}), response);
  }
});

test("binding hilang, HEAD dan RSC ditangani tanpa HTML yang salah", async t => {
  t.mock.method(console, "error", () => {});
  for (const options of [{}, {method:"HEAD",headers:{Accept:"text/html"}}, {headers:{Accept:"text/html",RSC:"1"}}]) {
    const response = await gateway.fetch(new Request(url, options), {});
    assert.equal(response.status, 503);
    if (options.method === "HEAD") assert.equal(await response.text(), "");
    else assert.match(response.headers.get("Content-Type"), /text\/plain/);
  }
});
