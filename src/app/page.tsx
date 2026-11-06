import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { officeRoles, kindLabels, statusLabels } from "@/lib/operations";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { formatDate, formatDecimal } from "@/lib/format";
import { documentStatus } from "@/lib/purchase";
import type { Summary } from "@/lib/summary";
import { AppShell } from "@/components/app-shell";
import { FinancialDashboard } from "@/components/financial-dashboard";
import { DashboardRefresh } from "@/components/dashboard-refresh";
import { Feedback } from "@/components/query-ui";
import type { Reminders } from "@/lib/reminders";
import { EmptyState, ListRow, Notice } from "@/components/ui";
import { logout } from "./actions";

export default async function Home({ searchParams }: { searchParams: Promise<Query> }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect("/login?error=config");
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("role,active,full_name,profile_extra_roles(role)").eq("id", user.id).maybeSingle();
  if (!profile?.active) return <main className="access-page"><EmptyState icon="shield" title="Akses belum tersedia" description="Hubungi pengelola untuk mengaktifkan akun Anda."/><form action={logout}><button className="button button-primary">Keluar</button></form></main>;
  const roles = [profile.role, ...(profile.profile_extra_roles ?? []).map(r => r.role)];
  const office = roles.some(r => officeRoles.includes(r));
  const q = await searchParams, today = businessToday(), period = resolvePeriod(q,today,true);
  const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 6 + i, 1)).toISOString().slice(0, 7));
  const [summary, activity, chart, reminders, accounts] = await Promise.all([
    office ? db.rpc("business_summary", { p_start: period.start, p_end: period.end }) : Promise.resolve({ data: null, error: null }),
    db.from("workflow_documents").select("id,kind,document_no,operation_date,status,payment_state,reversed_by,href").is("reversed_by",null).neq("status","cancelled").neq("kind","reversal").order("created_at", { ascending: false }).order("id").limit(5),
    office ? db.rpc("business_summary", { p_start: `${months[0]}-01`, p_end: today }) : Promise.resolve({ data: null, error: null }),
    office ? db.rpc("dashboard_reminders") : Promise.resolve({data:null,error:null}),
    office ? db.from("cash_accounts").select("id,name").eq("active",true).in("account_type",["cash","bank"]).order("name") : Promise.resolve({data:[],error:null}),
  ]);
  const s = summary.data as Summary | null;
  const trend = chart.data as Summary | null;
  const rawName = profile.full_name.trim();
  const name = /^(developer|admin|owner|pengelola)$/i.test(rawName) ? "" : rawName.split(/\s+/)[0];
  const quick = [
    { label: "Penjualan baru", href: "/penjualan", show: office },
    { label: "DO baru", href: "/pembelian", show: office },
    { label: "Hasil potong", href: "/produksi", show: office || roles.includes("production") },
    { label: "Catat kas", href: "/keuangan", show: office },
    { label: "Tugas pengiriman", href: "/penjualan", show: !office && roles.includes("driver") },
    { label: "Lihat stok", href: "/stok", show: !office && roles.includes("production") },
  ].filter(item => item.show);
  const attention = s ? [
    { n: s.attention.unreceived_dos, label: "DO belum diterima", detail: "Lanjutkan penerimaan barang", href: "/pembelian?period=all" },
    { n: s.attention.weight_discrepancies, label: "Selisih timbang", detail: "Periksa hasil timbang penerimaan", href: "/pembelian?period=all" },
    { n: s.attention.negative_stock, label: "Stok minus", detail: "Periksa pergerakan stok", href: "/stok" },
  ].filter(item => item.n > 0) : [];

  return <AppShell title="Beranda" active="home" role={profile.role} roles={roles}>
    <div className="dashboard">
      <div className="dashboard-intro"><div><p className="eyebrow">RINGKASAN USAHA</p><h2>{name ? `Halo, ${name}` : "Selamat datang"}</h2><p>Pantau usaha, tentukan langkah hari ini.</p></div><time dateTime={today}>{new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${today}T00:00:00Z`))}</time></div>
      <Feedback query={{...q,error:q.error==="access"?"Akses untuk halaman tersebut tidak tersedia.":q.error}}/>
      {summary.error && <Notice error>Ringkasan usaha tidak dapat dimuat. Silakan muat ulang halaman.</Notice>}
      {quick.length > 0 && <nav className="quick-actions" aria-label="Akses cepat"><span>Akses cepat</span>{quick.map((item, i) => <Link key={item.label} className={`button ${i === 0 ? "button-primary" : "button-secondary"}`} href={item.href}>{item.label}</Link>)}</nav>}
      {office && <><DashboardRefresh/><FinancialDashboard summary={s} reminders={reminders.data as Reminders|null} accounts={(accounts.data??[]).map(a=>({value:a.id,label:a.name}))} period={period} today={today} trend={trend} months={months} remindersError={!!reminders.error} accountsError={!!accounts.error} chartError={!!chart.error}/></>}
      <div className={`dashboard-bottom ${!office ? "field-dashboard" : ""}`}>
        {office && <section className="dashboard-panel"><div className="panel-heading"><div><h2>Perlu ditindaklanjuti</h2><p>Prioritas operasional saat ini</p></div>{s && attention.length > 0 && <span className="badge badge-amber">{attention.length} jenis</span>}</div><div className="dashboard-list">{attention.map(item => <Link key={item.label} href={item.href}><ListRow title={item.label} subtitle={item.detail} trailing={<span className="attention-count">{formatDecimal(item.n)}</span>}/></Link>)}{s && !attention.length && <EmptyState title="Semua sudah tertangani" description="Tidak ada tindak lanjut yang tertunda." icon="check"/>}{!s && <p className="panel-footnote">Daftar tindak lanjut belum dapat dimuat.</p>}</div></section>}
        <section className="dashboard-panel"><div className="panel-heading"><div><h2>Dokumen terbaru</h2><p>Aktivitas terakhir, seluruh periode</p></div><Link href="/dokumen" className="text-link">Lihat semua</Link></div><div className="dashboard-list">{activity.error ? <p className="panel-footnote">Dokumen terbaru belum dapat dimuat.</p> : activity.data?.length ? activity.data.map(a => <Link href={a.href} key={a.id}><ListRow title={`${kindLabels[a.kind]} #${a.document_no}`} subtitle={formatDate(a.operation_date)} trailing={<span className={`badge ${a.payment_state === "paid" || !a.payment_state && ["final", "verified"].includes(a.status) ? "badge-green" : ["unpaid", "partial"].includes(a.payment_state) ? "badge-amber" : ""}`}>{documentStatus(a, statusLabels)}</span>}/></Link>) : <EmptyState title="Belum ada aktivitas" description="Dokumen yang Anda catat akan muncul di sini." icon="file"/>}</div></section>
      </div>
      {office && <p className="dashboard-footer">HPP memakai rata-rata modal stok. Profit usaha sebelum pajak dan penyusutan. <Link href="/analisis">Buka analisis usaha</Link></p>}
    </div>
  </AppShell>;
}
