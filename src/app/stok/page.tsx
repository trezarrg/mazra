import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { getFormOptions } from "@/lib/form-options";
import { officeRoles } from "@/lib/operations";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { formatDecimal,formatDate } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { OperationForm } from "@/components/operation-form";
import { EmptyState, ListRow, SectionHeading } from "@/components/ui";
import { Feedback, Pagination, pageNumber } from "@/components/query-ui";
import { Sheet } from "@/components/sheet";

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  if (q.tab === "potong") {
    const params = new URLSearchParams();
    Object.entries(q).forEach(([key, value]) => { if (value && key !== "tab") params.set(key, value); });
    redirect(`/produksi${params.size ? `?${params}` : ""}`);
  }
  const { db, role, roles, user } = await requireAccess([...officeRoles, "production"]);
  const today = businessToday(), page = pageNumber(q), owner = roles.some(r => ["developer", "owner"].includes(r)),office=roles.some(r=>officeRoles.includes(r));
  let request = db.from("stock_measured_balances").select("*").eq("unit", "kg").order("product_name").order("product_id").order("variant_id");
  if (q.q) request = request.ilike("product_name", `%${q.q.replace(/[%_]/g, "").slice(0, 100)}%`);
  const [stocks, adjustment,storedGroups] = await Promise.all([
    request.range((page - 1) * 40, page * 40),
    office ? getFormOptions(db, user.id) : Promise.resolve(null),
    db.from("stock_reference_options").select("*").eq("source_type","production").not("shelf_life_days","is",null).order("movement_date").order("id").limit(50),
  ]);
  const reviewGroups=(storedGroups.data??[]).filter(group=>group.shelf_life_days!=null&&(Date.parse(`${today}T00:00:00Z`)-Date.parse(`${group.movement_date}T00:00:00Z`))/86400000>=group.shelf_life_days&&(group.reference_balance==null||Number(group.reference_balance)>0));
  return <AppShell title="Stok" active="stock" role={role} roles={roles}>
    <Feedback query={q} error={!!stocks.error || !!adjustment?.error||!!storedGroups.error}/>
    {reviewGroups.length>0&&<details className="form-details"><summary>Periksa umur stok olahan ({reviewGroups.length})</summary><p className="caption">Kelompok berikut melewati batas simpan internal. Periksa kondisi dan sisa fisiknya; tidak ada pembuangan otomatis.</p><div className="list-card">{reviewGroups.map(group=><div key={group.id}><ListRow title={group.product_name} subtitle={`Diproduksi ${formatDate(group.movement_date)} · batas internal ${group.shelf_life_days} hari`} trailing={<span>{group.reference_balance==null?"Periksa sisa fisik":`${formatDecimal(group.reference_balance)} kg tercatat`}</span>}/></div>)}</div></details>}
    <PeriodFilter compact period={resolvePeriod({ period: "all" })} today={today} search showPeriod={false}/>
    <SectionHeading title="Stok tersedia" action={office&&adjustment&&!adjustment.error&&<Sheet title="Catat kehilangan stok" trigger="Mati / dibuang"><OperationForm id={randomUUID()} kind="adjustment" today={today} options={adjustment} initial={{stock_event:"loss",loss_reason:"housing_death",location:"Kandang"}} returnTo="/stok"/></Sheet>}/>
    <div className="list-card">{stocks.data?.slice(0, 40).map(stock => <Link key={`${stock.product_id}:${stock.variant_id ?? ""}`} href={`/stok/${stock.product_id}${stock.variant_id ? `?variant=${stock.variant_id}` : ""}`}><ListRow title={stock.product_name} subtitle={[stock.variant_name,stock.count_balance==null?"Jumlah belum lengkap":`${stock.count_status==="estimated"?"± ":""}${formatDecimal(stock.count_balance)} ${stock.count_unit??"pcs"}`].filter(Boolean).join(" · ")} trailing={<strong>{stock.weight_estimated?"± ":""}{formatDecimal(stock.balance)} kg</strong>}/></Link>)}{!stocks.error && !stocks.data?.length && <EmptyState title="Belum ada stok pada pencarian ini"/>}</div>
    {office&&<p className="caption"><Link className="text-link" href="/stok/kehilangan?period=all">Riwayat kehilangan stok</Link> · <a className="text-link" href="/api/ekspor?export=stock&period=all">Unduh CSV pergerakan stok</a></p>}
    <Pagination query={q} path="/stok" hasNext={(stocks.data?.length ?? 0) > 40}/>
    {owner && adjustment && !adjustment.error && <details className="form-details"><summary>Penyesuaian stok</summary><p className="caption">Gunakan jika hasil hitung fisik berbeda dari catatan. Alasan wajib diisi.</p><OperationForm id={randomUUID()} kind="adjustment" today={today} options={adjustment} returnTo="/stok"/></details>}
  </AppShell>;
}
