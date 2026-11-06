import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { getFormOptions } from "@/lib/form-options";
import { officeRoles } from "@/lib/operations";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { OperationForm } from "@/components/operation-form";
import { EmptyState, ListRow, SectionHeading } from "@/components/ui";
import { Feedback, Pagination, pageNumber } from "@/components/query-ui";

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  if (q.tab === "potong") {
    const params = new URLSearchParams();
    Object.entries(q).forEach(([key, value]) => { if (value && key !== "tab") params.set(key, value); });
    redirect(`/produksi${params.size ? `?${params}` : ""}`);
  }
  const { db, role, roles, user } = await requireAccess([...officeRoles, "production"]);
  const today = businessToday(), page = pageNumber(q), owner = roles.some(r => ["developer", "owner"].includes(r));
  let request = db.from("stock_balances").select("*").eq("unit", "kg").order("product_name").order("product_id").order("variant_id");
  if (q.q) request = request.ilike("product_name", `%${q.q.replace(/[%_]/g, "").slice(0, 100)}%`);
  const [stocks, adjustment] = await Promise.all([
    request.range((page - 1) * 40, page * 40),
    owner ? getFormOptions(db, user.id) : Promise.resolve(null),
  ]);
  return <AppShell title="Stok" active="stock" role={role} roles={roles}>
    <Feedback query={q} error={!!stocks.error || !!adjustment?.error}/>
    <PeriodFilter compact period={resolvePeriod({ period: "all" })} today={today} search showPeriod={false}/>
    <SectionHeading title="Stok tersedia"/>
    <div className="list-card">{stocks.data?.slice(0, 40).map(stock => <Link key={`${stock.product_id}:${stock.variant_id ?? ""}`} href={`/stok/${stock.product_id}${stock.variant_id ? `?variant=${stock.variant_id}` : ""}`}><ListRow title={stock.product_name} subtitle={stock.variant_name || undefined} trailing={<strong>{formatDecimal(stock.balance)} kg</strong>}/></Link>)}{!stocks.error && !stocks.data?.length && <EmptyState title="Belum ada stok pada pencarian ini"/>}</div>
    <Pagination query={q} path="/stok" hasNext={(stocks.data?.length ?? 0) > 40}/>
    {owner && adjustment && !adjustment.error && <details className="form-details"><summary>Penyesuaian stok</summary><p className="caption">Gunakan jika hasil hitung fisik berbeda dari catatan. Alasan wajib diisi.</p><OperationForm id={randomUUID()} kind="adjustment" today={today} options={adjustment} returnTo="/stok"/></details>}
  </AppShell>;
}
