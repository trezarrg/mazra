"use client";
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <main className="connection-message"><h1>Halaman belum dapat dimuat</h1><p>Periksa koneksi internet lalu coba kembali. Anda tidak perlu keluar dari akun.</p><button type="button" className="button button-primary" onClick={reset}>Coba lagi</button></main>;
}
