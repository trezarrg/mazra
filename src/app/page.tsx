import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { officeRoles, kindLabels, statusLabels } from "@/lib/operations";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { formatDate, formatDecimal } from "@/lib/format";
import { cents, fromCents } from "@/lib/money";
import type { Summary } from "@/lib/summary";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { CashFlowChart } from "@/components/cash-flow-chart";
import { AnimatedNumber } from "@/components/animated-number";
import { EmptyState, ListRow, Notice } from "@/components/ui";
import { logout } from "./actions";

function Money({ value }: { value: string }) {
  return <><span className="currency">Rp</span> <AnimatedNumber value={value}/></>;
}

export default async function Home({ searchParams }: { searchParams: Promise<Query> }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect("/login?error=config");
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("role,active,full_name,profile_extra_roles(role)").eq("id", user.id).maybeSingle();
  if (!profile?.active) return <main className="access-page"><EmptyState icon="shield" title="Akses belum tersedia" description="Hubungi pengelola untuk mengaktifkan akun Anda."/><form action={logout}><button className="button button-primary">Keluar</button></form></main>;
  const roles = [profile.role, ...(profile.profile_extra_roles ?? []).map(r => r.role)];
  const office = roles.some(r => officeRoles.includes(r));
  const q = await searchParams, today = businessToday(), period = resolvePeriod(q);
  const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 6 + i, 1)).toISOString().slice(0, 7));
  const [summary, activity, chart] = await Promise.all([
    office ? db.rpc("business_summary", { p_start: period.start, p_end: period.end }) : Promise.resolve({ data: null, error: null }),
    db.from("operations").select("id,kind,document_no,operation_date,status").order("created_at", { ascending: false }).limit(5),
    office ? db.rpc("business_summary", { p_start: `${months[0]}-01`, p_end: today }) : Promise.resolve({ data: null, error: null }),
  ]);
  const s = summary.data as Summary | null;
  const trend = chart.data as Summary | null;
  const periodQuery = new URLSearchParams(Object.entries({ period: period.mode, date: period.date, month: period.month, start: period.start ?? "", end: period.end ?? "" })).toString();
  const periodLabel = period.start && period.end ? period.start === period.end ? formatDate(period.start) : `${formatDate(period.start)} – ${formatDate(period.end)}` : "Semua periode";
  const rawName = profile.full_name.trim();
  const name = /^(developer|admin|owner|pengelola)$/i.test(rawName) ? "" : rawName.split(/\s+/)[0];
  const quick = [
    { label: "Penjualan baru", href: "/penjualan", show: office },
    { label: "DO baru", href: "/pembelian", show: office },
    { label: "Hasil potong", href: "/produksi", show: office || roles.includes("production") },
    { label: "Catat kas", href: "/keuangan", show: office },
    { label: "Tagihan saya", href: "/tagihan", show: !office && roles.includes("collector") },
    { label: "Setoran", href: "/setoran", show: !office && roles.includes("collector") },
    { label: "Tugas pengiriman", href: "/penjualan", show: !office && roles.includes("driver") },
    { label: "Lihat stok", href: "/stok", show: !office && roles.includes("production") },
  ].filter(item => item.show);
  const attention = s ? [
    { n: s.attention.unreceived_dos, label: "DO belum diterima", detail: "Lanjutkan penerimaan barang", href: "/pembelian?period=all" },
    { n: s.attention.weight_discrepancies, label: "Selisih timbang", detail: "Periksa hasil timbang penerimaan", href: "/pembelian?period=all" },
    { n: s.attention.pending_deposits, label: "Setoran menunggu verifikasi", detail: "Konfirmasi uang yang diterima", href: "/setoran?period=all&status=pending" },
    { n: s.attention.overdue, label: "Tagihan lewat jatuh tempo", detail: "Tinjau penagihan dan pembayaran", href: "/tagihan?status=overdue" },
    { n: s.attention.negative_stock, label: "Stok minus", detail: "Periksa pergerakan stok", href: "/stok" },
  ].filter(item => item.n > 0) : [];
  const change = s?.previous_sales !== null && s?.previous_sales !== undefined ? cents(s.net_sales) - cents(s.previous_sales) : null;
  const officeCash = s ? fromCents(cents(s.cash) - cents(s.collector)) : "0";

  return <AppShell title="Beranda" active="home" role={profile.role} roles={roles}>
    <div className="dashboard">
      <div className="dashboard-intro"><div><p className="eyebrow">RINGKASAN USAHA</p><h2>{name ? `Halo, ${name}` : "Selamat datang"}</h2><p>Pantau usaha, tentukan langkah hari ini.</p></div><time dateTime={today}>{new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${today}T00:00:00Z`))}</time></div>
      {q.error && <Notice error>Akses untuk halaman tersebut tidak tersedia.</Notice>}
      {summary.error && <Notice error>Ringkasan usaha tidak dapat dimuat. Silakan muat ulang halaman.</Notice>}
      {quick.length > 0 && <nav className="quick-actions" aria-label="Akses cepat"><span>Akses cepat</span>{quick.map((item, i) => <Link key={item.label} className={`button ${i === 0 ? "button-primary" : "button-secondary"}`} href={item.href}>{item.label}</Link>)}</nav>}
      {office && <>
        <div className="dashboard-period"><div><h2>Kinerja usaha</h2><p>{periodLabel}</p></div><PeriodFilter period={period} today={today}/></div>
        {s && <div className="dashboard-kpis">
          <section className="kpi-card kpi-cash"><div className="kpi-label"><h3>Saldo kas & bank</h3><span>Saat ini</span></div><strong className="kpi-amount"><Money value={s.cash}/></strong><div className="kpi-footer"><span>Di penagih <b>Rp {formatDecimal(s.collector)}</b></span><Link href="/akuntansi">Rincian saldo</Link></div></section>
          <Link href={`/riwayat?${periodQuery}`} className="kpi-card"><div className="kpi-label"><h3>Penjualan bersih</h3><span>Periode terpilih</span></div><strong className="kpi-amount"><Money value={s.net_sales}/></strong><div className="kpi-footer"><span className={change !== null && change > BigInt(0) ? "amount-positive" : undefined}>{change === null ? "Semua transaksi final" : change === BigInt(0) ? "Sama dengan periode sebelumnya" : `${change > BigInt(0) ? "Naik" : "Turun"} Rp ${formatDecimal(fromCents(change < BigInt(0) ? -change : change))}`}</span></div>{change !== null && change !== BigInt(0) && <small className="kpi-context">Dibanding periode sebelumnya yang setara</small>}</Link>
          <Link href={`/riwayat?tab=pembelian&${periodQuery}`} className="kpi-card"><div className="kpi-label"><h3>Penerimaan pembelian</h3><span>Periode terpilih</span></div><strong className="kpi-amount"><Money value={s.purchases}/></strong><div className="kpi-footer"><span>Retur pembelian <b>Rp {formatDecimal(s.purchase_returns)}</b></span></div></Link>
        </div>}
        {s && <p className="dashboard-note">Penjualan final Rp {formatDecimal(s.sales)}, dikurangi retur Rp {formatDecimal(s.sales_returns)}. Termasuk transaksi tempo; bukan penerimaan kas.</p>}
        <div className="dashboard-middle">
          <CashFlowChart rows={trend?.cash_trend ?? []} months={months} error={!!chart.error || !trend}/>
          <section className="dashboard-panel position-panel"><div className="panel-heading"><div><h2>Posisi usaha</h2><p>Saldo saat ini, seluruh periode</p></div></div>
            {s ? <><div className="position-values"><Link href="/tagihan"><span>Piutang pelanggan</span><strong><Money value={s.receivable}/></strong></Link><Link href="/tagihan?tab=hutang"><span>Hutang supplier</span><strong><Money value={s.payable}/></strong></Link></div>
              <div className="due-summary"><span>Hutang jatuh tempo 7 hari</span><strong><Money value={s.due_next7}/></strong><p>Kas kantor & bank Rp {formatDecimal(officeCash)}</p>{cents(s.due_next7) > cents(officeCash) && <p className="due-warning">Siapkan penerimaan atau atur jadwal pembayaran.</p>}</div>
              <div className="stock-snapshot"><div><h3>Stok tersedia</h3><Link href="/stok" className="text-link">Lihat stok</Link></div>{s.stock.length > 0 ? <div className="stock-units">{s.stock.map(row => <span key={row.unit}><strong>{formatDecimal(row.quantity)}</strong> {row.unit}</span>)}</div> : <p>Belum ada stok tercatat</p>}</div></> : <p className="panel-footnote">Posisi usaha belum dapat dimuat.</p>}
          </section>
        </div>
      </>}
      <div className={`dashboard-bottom ${!office ? "field-dashboard" : ""}`}>
        {office && <section className="dashboard-panel"><div className="panel-heading"><div><h2>Perlu ditindaklanjuti</h2><p>Prioritas operasional saat ini</p></div>{s && attention.length > 0 && <span className="badge badge-amber">{attention.length} jenis</span>}</div><div className="dashboard-list">{attention.map(item => <Link key={item.label} href={item.href}><ListRow title={item.label} subtitle={item.detail} trailing={<span className="attention-count">{formatDecimal(item.n)}</span>}/></Link>)}{s && !attention.length && <EmptyState title="Semua sudah tertangani" description="Tidak ada tindak lanjut yang tertunda." icon="check"/>}{!s && <p className="panel-footnote">Daftar tindak lanjut belum dapat dimuat.</p>}</div></section>}
        <section className="dashboard-panel"><div className="panel-heading"><div><h2>Dokumen terbaru</h2><p>Aktivitas terakhir, seluruh periode</p></div><Link href="/dokumen" className="text-link">Lihat semua</Link></div><div className="dashboard-list">{activity.error ? <p className="panel-footnote">Dokumen terbaru belum dapat dimuat.</p> : activity.data?.length ? activity.data.map(a => <Link href={`/dokumen/${a.id}`} key={a.id}><ListRow title={`${kindLabels[a.kind]} #${a.document_no}`} subtitle={formatDate(a.operation_date)} trailing={<span className={`badge ${a.status === "final" || a.status === "verified" ? "badge-green" : ""}`}>{statusLabels[a.status]}</span>}/></Link>) : <EmptyState title="Belum ada aktivitas" description="Dokumen yang Anda catat akan muncul di sini." icon="file"/>}</div></section>
      </div>
      {office && <p className="dashboard-footer">Laporan laba/rugi tetap berstatus belum lengkap sampai metode HPP dan prasyarat akuntansi disahkan. <Link href="/analisis">Buka analisis usaha</Link></p>}
    </div>
  </AppShell>;
}
