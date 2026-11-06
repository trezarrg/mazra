import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { officeRoles, kindLabels } from "@/lib/operations";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { formatDate, formatDecimal } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { PeriodFilter } from "@/components/period-filter";
import { Feedback, Pagination, pageNumber } from "@/components/query-ui";
import { EmptyState, ListRow, Notice, SectionHeading } from "@/components/ui";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { id } = await params, q = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id) || (q.variant && !/^[0-9a-f-]{36}$/.test(q.variant))) notFound();
  const { db, role, roles } = await requireAccess([...officeRoles, "production"]);
  const period = resolvePeriod(q), page = pageNumber(q);
  let stock = db.from("stock_balances").select("*").eq("product_id", id).eq("unit", "kg");
  let history = db.from("stock_history").select("*").eq("product_id", id).eq("unit", "kg").order("movement_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
  stock = q.variant ? stock.eq("variant_id", q.variant) : stock.is("variant_id", null);
  history = q.variant ? history.eq("variant_id", q.variant) : history.is("variant_id", null);
  if (period.start) history = history.gte("movement_date", period.start);
  if (period.end) history = history.lte("movement_date", period.end);
  const [balance, movements] = await Promise.all([stock.maybeSingle(), history.range((page - 1) * 40, page * 40)]);
  if (!balance.error && !balance.data) notFound();
  const item = balance.data;
  return <AppShell title="Rincian stok" active="stock" role={role} roles={roles}>
    <Link className="text-link" href="/stok">Kembali ke stok</Link>
    <Feedback query={q} error={!!balance.error || !!movements.error}/>
    {item && <div className="document-summary"><strong>{item.product_name}{item.variant_name ? ` · ${item.variant_name}` : ""}</strong><span>Stok saat ini {formatDecimal(item.balance)} kg</span></div>}
    <PeriodFilter compact period={period} today={businessToday()}/>
    <SectionHeading title="Pergerakan stok"/>
    <div className="list-card">{movements.data?.slice(0, 40).map(movement => <div key={movement.id}><ListRow title={kindLabels[movement.source_type] ?? "Pergerakan stok"} subtitle={formatDate(movement.movement_date)} trailing={<strong className={Number(movement.quantity) < 0 ? "amount-negative" : "amount-positive"}>{Number(movement.quantity) > 0 ? "+" : ""}{formatDecimal(movement.quantity)} kg</strong>}/></div>)}{!movements.error && !movements.data?.length && <EmptyState title="Belum ada pergerakan pada periode ini"/>}</div>
    {balance.error && <Notice error>Saldo stok tidak dapat dimuat.</Notice>}
    <Pagination query={q} path={`/stok/${id}`} hasNext={(movements.data?.length ?? 0) > 40}/>
  </AppShell>;
}
