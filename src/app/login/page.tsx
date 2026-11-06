import { getBusinessBranding } from "@/lib/business-branding";
import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import { ClearNavigation } from "@/components/app-navigation";
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const branding = await getBusinessBranding();
  const { error } = await searchParams;
  const initialError = error === "config" ? "config" : error === "missing" ? "missing" : error ? "invalid" : null;
  return (
    <main className="login-layout">
      <ClearNavigation/>
      <section className="login-art" aria-label={branding.name}>
        <Image className="login-logo" src={branding.logo} alt={branding.name} width={180} height={120} preload unoptimized/>
        <div className="login-art-copy">
          <h2>Usaha rapi.<br/>Kerja lebih<br/><em>ringan.</em></h2>
          <p>Pembelian, produksi, dan penjualan.<br/>Tercatat dalam satu tempat.</p>
        </div>
        <p className="login-art-footer">Pencatatan usaha ayam potong</p>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <Image className="login-logo" src={branding.logo} alt={branding.name} width={180} height={120} preload unoptimized/>
          </div>
          <header className="login-heading">
            <h1 id="login-title">Selamat datang.</h1>
            <p className="login-intro">Masuk untuk melanjutkan pekerjaan.</p>
          </header>
          <LoginForm initialError={initialError}/>
          <p className="login-security">Akses khusus tim usaha</p>
        </div>
        <footer className="login-credit">© 2026 <strong>TrezarRG</strong></footer>
      </section>
    </main>
  );
}
