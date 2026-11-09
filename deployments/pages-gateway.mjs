// Pages mempertahankan URL, metode, body, cookie, dan respons aplikasi pada origin yang sama.
const unavailableMessage = "Aplikasi sedang mengalami gangguan. Coba kembali sebentar lagi. Anda tidak perlu keluar dari akun.";

function unavailable(request) {
  const navigation = (request.method === "GET" || request.method === "HEAD") &&
    request.headers.get("Accept")?.includes("text/html") &&
    request.headers.get("RSC") !== "1";
  const body = navigation
    ? `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aplikasi belum tersedia</title><style>body{margin:0;background:#f5f6f4;color:#243c30;font:16px/1.6 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{max-width:28rem;padding:24px;text-align:center}h1{font-size:24px}a{display:inline-block;padding:10px 20px;border-radius:10px;background:#243c30;color:white;text-decoration:none}a:focus-visible{outline:3px solid #638b71;outline-offset:4px}</style></head><body><main><h1>Halaman belum dapat dimuat</h1><p>${unavailableMessage}</p><a href="">Coba lagi</a></main></body></html>`
    : unavailableMessage;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 503,
    headers: {
      "Content-Type": navigation ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "Retry-After": "5",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}

const gateway = {
  async fetch(request, env) {
    if (!env.APP) {
      console.error(JSON.stringify({event:"app_binding_missing"}));
      return unavailable(request);
    }
    // Jangan ulangi transaksi atau Server Actions: penyimpanan mungkin sudah berhasil.
    const canRetry = (request.method === "GET" || request.method === "HEAD") &&
      !request.headers.has("Next-Action") && !request.headers.has("X-RSC-Action");
    for (let attempt = 1; attempt <= (canRetry ? 2 : 1); attempt++) {
      try {
        return await env.APP.fetch(request);
      } catch (error) {
        console.error(JSON.stringify({
          event:"app_fetch_exception", method:request.method,
          path:new URL(request.url).pathname, ray:request.headers.get("CF-Ray"), attempt,
          error:error instanceof Error ? error.message : "Unknown error",
        }));
        if (error?.retryable === false) break;
      }
    }
    return unavailable(request);
  },
};
export default gateway;
