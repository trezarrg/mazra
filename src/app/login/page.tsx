import Image from "next/image";
import { login } from "./actions";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/ui";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error === "config" ? "Koneksi belum dikonfigurasi. Hubungi pengelola." : error === "missing" ? "Isi email dan kata sandi." : error ? "Email atau kata sandi tidak sesuai." : null;
  return (
    <main className="login-layout">
      <section className="login-art" aria-label="Rizki Berkah Abadi Farm">
        <Image className="login-logo" src="/Logo.png" alt="Rizki Berkah Abadi Farm" width={180} height={120} preload/>
        <div className="login-art-copy">
          <h2>Usaha rapi.<br/>Kerja lebih<br/><em>ringan.</em></h2>
          <p>Pembelian, produksi, dan penjualan.<br/>Tercatat dalam satu tempat.</p>
        </div>
        <p className="login-art-footer">Pencatatan usaha ayam potong</p>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <Image className="login-logo" src="/Logo.png" alt="Rizki Berkah Abadi Farm" width={180} height={120} preload/>
          </div>
          <header className="login-heading">
            <h1 id="login-title">Selamat datang.</h1>
            <p className="login-intro">Masuk untuk melanjutkan pekerjaan.</p>
          </header>
          <form action={login} className="form login-form">
            <label htmlFor="login-email">Email
              <input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="nama@email.com" required/>
            </label>
            <div className="login-password-field">
              <label htmlFor="login-password">Kata sandi</label>
              <PasswordInput/>
            </div>
            {message && <Notice error>{message}</Notice>}
            <SubmitButton>Masuk</SubmitButton>
          </form>
          <p className="login-security">Akses khusus tim usaha</p>
        </div>
        <footer className="login-credit">© 2026 <strong>TrezarRG</strong></footer>
      </section>
    </main>
  );
}
