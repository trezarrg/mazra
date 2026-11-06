// Keep a failed submission on its originating page so the open form survives.
export function failureReturnPath(form: FormData, fallback: string) {
  const raw = String(form.get("_form_origin") ?? "");
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.length > 4000) return fallback;
  const url = new URL(raw, "http://localhost");
  if (url.origin !== "http://localhost" || !/^\/(data|pembelian|penjualan|penerimaan|produksi|stok(?:\/[0-9a-f-]{36})?|keuangan|tagihan|akuntansi|sdm|aset|dokumen\/(?:pembelian\/)?[0-9a-f-]{36})?$/.test(url.pathname)) return fallback;
  for (const key of ["ok", "error", "r"]) url.searchParams.delete(key);
  return url.pathname + url.search;
}
