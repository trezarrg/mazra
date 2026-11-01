import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions";
import { Icon, type IconName } from "./icon";

type Destination = "home" | "stock" | "data" | "purchase" | "sale" | "finance" | "more";
export function AppShell({ title, active, role, roles = [role], children, action }: { title: string; active: Destination; role: string; roles?: string[]; children: React.ReactNode; action?: React.ReactNode }) {
  const office = roles.some(r => ["developer", "owner", "admin"].includes(r));
  const selected = active === "stock" || active === "data" ? "more" : active;
  const navigation: { id: Destination; href: string; label: string; icon: IconName }[] = [
    { id: "home", href: "/", label: "Beranda", icon: "home" },
    ...(office || roles.some(r => ["driver", "collector"].includes(r)) ? [{ id: "sale" as const, href: "/penjualan", label: "Penjualan", icon: "file" as const }] : []),
    ...(office ? [{ id: "purchase" as const, href: "/pembelian", label: "Pembelian", icon: "file" as const }] : []),
    ...(office || roles.includes("collector") ? [{ id: "finance" as const, href: office ? "/keuangan" : "/tagihan", label: "Keuangan", icon: "wallet" as const }] : []),
    { id: "more", href: "/lainnya", label: "Lainnya", icon: "grid" },
  ];
  return <div className="app-layout">
    <a className="skip-link" href="#main-content">Lewati ke konten</a>
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand" aria-label="Beranda"><Image src="/Logo.png" alt="Rizki Berkah Abadi Farm" width={150} height={100}/></Link>
      <span className="nav-label">RUANG KERJA</span>
      <nav aria-label="Navigasi desktop">{navigation.map(item => <Link key={item.id} href={item.href} className={`side-link ${selected === item.id ? "is-active" : ""}`} aria-current={selected === item.id ? "page" : undefined}>{item.label}</Link>)}</nav>
      <div className="sidebar-footer"><div><strong>Rizki Berkah Abadi</strong><small>Operasional usaha</small></div><form action={logout}><button className="icon-button" aria-label="Keluar dari akun"><Icon name="logout" size={18}/></button></form></div>
    </aside>
    <div className="app-main">
      <header className="app-header"><div className="header-title"><h1>{title}</h1></div><div className="header-actions">{action}<span className="workspace-label">Rizki Berkah Abadi Farm</span><form action={logout} className="mobile-logout"><button className="icon-button" aria-label="Keluar dari akun"><Icon name="logout" size={18}/></button></form></div></header>
      <main id="main-content" className="page-content">{children}</main>
    </div>
    <nav className="bottom-nav" aria-label="Navigasi utama">{navigation.map(item => <Link key={item.id} href={item.href} className={selected === item.id ? "is-active" : ""} aria-current={selected === item.id ? "page" : undefined}><span className="bottom-icon"><Icon name={item.icon} size={20}/></span><span>{item.label}</span></Link>)}</nav>
  </div>;
}
