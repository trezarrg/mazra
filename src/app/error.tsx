"use client";
export default function ErrorPage() {
  // Ambil ulang halaman dari server; reset boundary saja bisa mengulang hasil render yang gagal.
  return <main className="connection-message"><h1>Halaman belum dapat dimuat</h1><p>Terjadi gangguan saat memuat halaman. Coba kembali sebentar lagi. Anda tidak perlu keluar dari akun.</p><button type="button" className="button button-primary" onClick={() => window.location.reload()}>Coba lagi</button></main>;
}
