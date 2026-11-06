// Pages mempertahankan URL, metode, body, cookie, dan respons aplikasi pada origin yang sama.
const gateway = {
  fetch(request, env) {
    if (!env.APP) return new Response("Aplikasi belum tersedia. Coba kembali sebentar lagi.", {status:503});
    return env.APP.fetch(request);
  },
};
export default gateway;
