import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { formatDate, formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { Feedback, Pagination, pageNumber } from "@/components/query-ui";
import { EmptyState, ListRow } from "@/components/ui";

const documentKinds: Record<string, string> = { sale: "Penjualan", purchase_receipt: "Pembelian" };
const paymentStatuses: Record<string, string> = { paid: "Lunas", unpaid: "Belum lunas",cancelled:"Dibatalkan" };

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const { db, role, roles } = await requireAccess();
  const q = await searchParams, period = resolvePeriod({ ...q, period: q.period ?? "all" }), page = pageNumber(q);
  if ((q.kind && !Object.hasOwn(documentKinds, q.kind)) || (q.status && !Object.hasOwn(paymentStatuses, q.status))) {
    const params = new URLSearchParams();
    Object.entries(q).forEach(([key, value]) => { if (value) params.set(key, value); });
    if (q.kind && !Object.hasOwn(documentKinds, q.kind)) params.delete("kind");
    if (q.status && !Object.hasOwn(paymentStatuses, q.status)) params.delete("status");
    params.delete("page");
    redirect(`/dokumen?${params}`);
  }
  let request = db.from("sales_purchase_documents").select("*").order("operation_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
  if(!q.status)request=request.neq("payment_state","cancelled");
  if (period.start) request = request.gte("operation_date", period.start);
  if (period.end) request = request.lte("operation_date", period.end);
  if (q.kind) request = request.eq("kind", q.kind);
  if (q.status) request = request.eq("payment_state", q.status);
  if (q.q) request = request.ilike("search_text", `%${q.q.replace(/[%_]/g, "").slice(0, 100)}%`);
  const result = await request.range((page - 1) * 30, page * 30), list = result.data ?? [];
  return <AppShell title="Dokumen" active="more" role={role} roles={roles}>
    <Feedback query={q} error={!!result.error}/>
    <PeriodFilter compact period={period} today={businessToday()} search filters={[
      { name: "kind", label: "Jenis dokumen", options: [{ value: "", label: "Semua jenis" }, ...Object.entries(documentKinds).map(([value, label]) => ({ value, label }))] },
      { name: "status", label: "Status", options: [{ value: "", label: "Semua status" }, ...Object.entries(paymentStatuses).map(([value, label]) => ({ value, label }))] },
    ]}/>
    <div className="list-card">{list.slice(0, 30).map(d => <Link key={d.id} href={d.href}><ListRow title={`${documentKinds[d.kind] ?? "Dokumen"} #${d.document_no}`} subtitle={`${formatDate(d.operation_date)}${d.partner_name ? ` · ${d.partner_name}` : ""}`} trailing={<span className="purchase-row-status"><span className={`badge ${d.payment_state === "paid" ? "badge-green" : d.payment_state === "unpaid" ? "badge-amber" : ""}`}>{paymentStatuses[d.payment_state]}</span><strong>{`Rp${formatDecimal(d.amount)}`}</strong></span>}/></Link>)}{!result.error && !list.length && <EmptyState title="Belum ada dokumen pada filter ini"/>}</div>
    <Pagination query={q} path="/dokumen" hasNext={list.length > 30}/>
  </AppShell>;
}
