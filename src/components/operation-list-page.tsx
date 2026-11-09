import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { getFormOptions } from "@/lib/form-options";
import { officeRoles } from "@/lib/operations";
import { formatDate, formatDecimal } from "@/lib/format";
import { AppShell } from "./app-shell";
import { PeriodFilter } from "./period-filter";
import { OperationForm } from "./operation-form";
import { Sheet } from "./sheet";
import { EmptyState, ListRow, SectionHeading } from "./ui";
import { Feedback, Pagination, pageNumber } from "./query-ui";

export async function SalesListPage({ query }: { query: Query }) {
  const { db, role, roles, user } = await requireAccess([...officeRoles, "driver"]);
  const office = roles.some(role => officeRoles.includes(role)), today = businessToday(), period = resolvePeriod(query), page = pageNumber(query);
  let request = db.from("sales_list").select("*").in("status", ["draft", "final", "cancelled"]).order("operation_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
  if(query.status==="cancelled")request=request.eq("payment_state","cancelled");else request=request.is("reversed_by",null).neq("status","cancelled");
  if (period.start) request = request.gte("operation_date", period.start);
  if (period.end) request = request.lte("operation_date", period.end);
  if (["paid", "unpaid", "draft"].includes(query.status ?? "")) request = request.eq("payment_state", query.status!);
  if (query.partner) request = request.eq("partner_id", query.partner);
  if (query.q) request = request.ilike("search_text", `%${query.q.replace(/[%_]/g, "").slice(0, 100)}%`);
  const [result, options] = await Promise.all([request.range((page - 1) * 30, page * 30), getFormOptions(db, user.id, office, office)]);
  return <AppShell title="Penjualan" active="sale" role={role} roles={roles}>
    <Feedback query={query} error={!!result.error || options.error}/>
    <PeriodFilter compact period={period} today={today} search filters={[
      { name: "status", label: "Status", options: [{ value: "", label: "Semua status" }, { value: "draft", label: "Draft" }, { value: "unpaid", label: "Belum lunas" }, { value: "paid", label: "Lunas" },{value:"cancelled",label:"Dibatalkan"}] },
      ...(office ? [{ name: "partner", label: "Pelanggan", options: [{ value: "", label: "Semua pelanggan" }, ...options.partners] }] : []),
    ]}/>
    <SectionHeading title="Transaksi penjualan" action={office && <Sheet wide title="Penjualan baru" trigger="Tambah"><OperationForm id={randomUUID()} kind="sale" today={today} options={options} returnTo="/penjualan"/></Sheet>}/>
    <div className="list-card">{result.data?.slice(0, 30).map(sale => <Link key={sale.id} href={`/dokumen/${sale.id}`}><ListRow title={`${sale.partner_name ?? "Penjualan"} · #${sale.document_no}`} subtitle={`${formatDate(sale.operation_date)}${sale.due_date && sale.payment_state === "unpaid" ? ` · Jatuh tempo ${formatDate(sale.due_date)}` : ""}`} trailing={<span className="purchase-row-status"><span className={`badge ${sale.payment_state === "paid" ? "badge-green" : "badge-amber"}`}>{sale.payment_state === "cancelled" ? "Dibatalkan" : sale.payment_state === "draft" ? "Draft" : sale.payment_state === "paid" ? "Lunas" : sale.payment_state === "unpaid" ? "Belum lunas" : "Status belum tersedia"}</span><strong>Rp{formatDecimal(sale.amount)}</strong></span>}/></Link>)}{!result.error && !result.data?.length && <EmptyState title="Belum ada penjualan pada filter ini"/>}</div>
    <Pagination query={query} path="/penjualan" hasNext={(result.data?.length ?? 0) > 30}/>
  </AppShell>;
}
