import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireAccess } from "@/lib/access";
import { getFormOptions } from "@/lib/form-options";
import { businessToday, resolvePeriod, type Query } from "@/lib/period";
import { officeRoles, type Obligation } from "@/lib/operations";
import { formatDate, formatDecimal } from "@/lib/format";
import { purchaseDueReminder, purchasePaymentLabels } from "@/lib/purchase";
import { nextBusinessDate } from "@/lib/reminders";
import { AppShell } from "@/components/app-shell";
import { DatePicker } from "@/components/date-picker";
import { PeriodFilter } from "@/components/period-filter";
import { Sheet } from "@/components/sheet";
import { PaymentForm } from "@/components/transaction-forms";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, ListRow, SectionHeading } from "@/components/ui";
import { Feedback, Pagination, pageNumber } from "@/components/query-ui";
import { cancelMeasurement, managePurchase, uploadEvidence } from "@/app/operasi/actions";
import { DOForm, ReceiptForm } from "./forms";
import { MeasuredReceiptForm } from "./measured-form";

type DO = { id: string; document_no: number; purchase_date: string; supplier_id: string; product_id: string; supplier_name: string; product_name: string; origin: string | null; estimated_weight: string | null; estimated_count: number | null; variant_id?:string|null; price_method: string; price: string; note: string | null; status: string; close_reason: string | null; actual_weight: string; bill_amount: string; payment_state: string; balance: string };
type Receipt = { id: string; do_id: string; receipt_date: string; origin_weight: string | null; actual_weight: string; billing_quantity: string | null; bill_amount: string; note: string | null; due_date: string | null;reversed_by:string|null;unit_price:string|null;price_method:string|null };

export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  const { db, role, roles, user } = await requireAccess(officeRoles);
  const q = await searchParams, today = businessToday(), period = resolvePeriod(q), page = pageNumber(q);
  const target = q.receipt ? await db.from("purchase_receipts").select("do_id").eq("id", q.receipt).maybeSingle() : null;
  let request = db.from("purchase_workflow").select("*").order("purchase_date", { ascending: false }).order("created_at", { ascending: false }).order("id");
  if (target?.data) request = request.eq("id", target.data.do_id);
  else if (q.do && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.do)) request = request.eq("id", q.do);
  else {
    if(q.payment!=="cancelled"&&q.status!=="cancelled")request=request.neq("status","cancelled");
    if (period.start) request = request.gte("purchase_date", period.start);
    if (period.end) request = request.lte("purchase_date", period.end);
    if (q.q) request = request.ilike("search_text", `%${q.q.replace(/[%_]/g, "").slice(0, 100)}%`);
    if (q.status) request = request.eq("status", q.status);
    if (q.payment === "unpaid") request = request.in("payment_state", ["unpaid", "partial"]);
    else if (["paid", "pending_receipt", "cancelled"].includes(q.payment ?? "")) request = request.eq("payment_state", q.payment!);
  }
  const [orders, suppliers, options, reminders, pendingMeasurements] = await Promise.all([
    request.range((page - 1) * 20, page * 20),
    db.from("partners").select("id,name").eq("active", true).eq("is_supplier", true).order("name"),
    getFormOptions(db, user.id),
    db.from("obligations").select("*").eq("kind", "payable").gt("balance_amount", 0).lte("due_date", nextBusinessDate(today)).order("due_date").order("source_id").limit(6),
    db.from("receipt_measurements").select("id,do_id,measurement_date,actual_weight").eq("status", "pending").order("created_at", { ascending: false }).limit(6),
  ]);
  const list = (orders.data ?? []) as DO[], ids = list.slice(0, 20).map(d => d.id);
  const pendingDoIds = [...new Set((pendingMeasurements.data ?? []).map(m => m.do_id))];
  const [receipts, measurements, attachments, pendingOrders,orderVariants] = await Promise.all([
    ids.length ? db.from("purchase_receipt_measured_list").select("*").in("do_id", ids).order("created_at") : { data: [], error: null },
    ids.length ? db.from("receipt_measurements").select("*").in("do_id", ids).eq("status", "pending") : { data: [], error: null },
    ids.length ? db.from("document_attachments").select("id,source_id,file_name,storage_path").in("source_id", ids) : { data: [], error: null },
    pendingDoIds.length ? db.from("purchase_list").select("id,document_no,supplier_name").in("id", pendingDoIds) : { data: [], error: null },
    ids.length ? db.from("purchase_dos").select("id,variant_id").in("id",ids) : {data:[],error:null},
  ]);
  const receiptList = (receipts.data ?? []) as Receipt[], rids = receiptList.map(r => r.id);
  const [bills, payments, returns] = await Promise.all([
    rids.length ? db.from("obligations").select("*").in("source_id", rids).eq("kind", "payable") : { data: [], error: null },
    rids.length ? db.from("payment_records").select("id,source_id,payment_date,amount,note,reversed_by").eq("kind", "payable").in("source_id", rids).order("created_at") : { data: [], error: null },
    rids.length ? db.from("operations").select("id,source_id,document_no,amount,status").in("source_id", rids).eq("kind", "purchase_return") : { data: [], error: null },
  ]);
  const evidence = await Promise.all((attachments.data ?? []).map(async a => {
    const { data } = await db.storage.from("transaction-evidence").createSignedUrl(a.storage_path, 300);
    return { ...a, url: data?.signedUrl };
  }));
  const suppliersOptions = (suppliers.data ?? []).map(p => ({ value: p.id, label: p.name }));
  const products = options.products.filter(p => p.product_units.some(u => u.unit === "kg")).map(p => ({ value: p.id, label: p.name }));
  return <AppShell title="Pembelian" active="purchase" role={role} roles={roles}>
    <Feedback query={q} error={[orders, suppliers, receipts, bills, payments, returns, attachments, measurements, reminders, pendingMeasurements, pendingOrders].some(r => !!r.error) || options.error || !!target?.error}/>
    {!!pendingMeasurements.data?.length && !pendingOrders.error && <section className="purchase-reminders" aria-label="Hasil timbang menunggu konfirmasi">
      <SectionHeading title="Hasil timbang menunggu konfirmasi" action={<Link className="text-link" href="/penerimaan?period=all&status=done">Lihat semua</Link>}/>
      <div className="list-card">{pendingMeasurements.data.map(m => { const order = pendingOrders.data?.find(o => o.id === m.do_id); return order && <Link key={m.id} href={`/pembelian?do=${m.do_id}&period=all`}><ListRow title={`${order.supplier_name} · DO #${order.document_no}`} subtitle={`${formatDate(m.measurement_date)} · Menunggu konfirmasi`} trailing={<strong>{formatDecimal(m.actual_weight)} kg</strong>}/></Link>; })}</div>
    </section>}
    {!!reminders.data?.length && <section className="purchase-reminders" aria-label="Pengingat pembayaran supplier">
      <SectionHeading title="Pengingat pembayaran" action={<Link className="text-link" href="/tagihan?tab=hutang&status=open">Semua tagihan</Link>}/>
      <div className="list-card">{(reminders.data as Obligation[]).map(b => <Link key={b.source_id} href={`/pembelian?period=all&receipt=${b.source_id}`}><ListRow title={b.partner_name} subtitle={`${b.reference} · ${purchaseDueReminder(b, today)}`} trailing={<strong>Rp{formatDecimal(b.balance)}</strong>}/></Link>)}</div>
    </section>}
    <PeriodFilter compact period={period} today={today} search filters={[{ name: "payment", label: "Pembayaran", options: [{ value: "", label: "Semua" }, { value: "pending_receipt", label: "Belum diterima" }, { value: "unpaid", label: "Belum lunas" }, { value: "paid", label: "Lunas" }, { value: "cancelled", label: "Dibatalkan" }] }]}/>
    <SectionHeading title="Daftar DO" action={<Sheet title="DO baru" trigger="Tambah DO"><DOForm id={randomUUID()} today={today} suppliers={suppliersOptions} products={products} catalog={options.products}/></Sheet>}/>
    <div className="list-card">{list.slice(0, 20).map(order => {
      const rs = receiptList.filter(r => r.do_id === order.id);
      const pendingForOrder = (measurements.data ?? []).filter(m => m.do_id === order.id);
      return <Sheet key={`${order.id}:${q.do ?? ""}:${q.receipt ?? ""}`} title={`DO #${order.document_no}`} className="row-button" initialOpen={target?.data?.do_id === order.id || q.do === order.id} trigger={<ListRow title={`${order.supplier_name} · DO #${order.document_no}`} subtitle={`${formatDate(order.purchase_date)} · ${formatDecimal(order.actual_weight)} kg diterima`} trailing={<span className="purchase-row-status"><span className={`badge ${pendingForOrder.length ? "badge-amber" : order.payment_state === "paid" ? "badge-green" : ["unpaid", "partial"].includes(order.payment_state) ? "badge-amber" : ""}`}>{pendingForOrder.length ? "Timbang menunggu konfirmasi" : purchasePaymentLabels[order.payment_state]}</span><strong>Rp{formatDecimal(order.bill_amount)}</strong></span>}/> }>
        <div className="purchase-progress" aria-label="Tahap pembelian"><span className="is-complete">DO dibuat</span><span className={rs.length ? "is-complete" : ""}>Barang diterima</span><span className={order.payment_state === "paid" ? "is-complete" : ""}>{order.payment_state === "paid" ? "Lunas" : "Pembayaran"}</span></div>
        <div className="document-summary"><strong>{order.supplier_name}</strong><p>{order.product_name} · {order.price_method === "borongan" ? "Borongan" : `Harga / ${order.price_method}`} Rp{formatDecimal(order.price)}</p>{order.origin && <p>Asal {order.origin}</p>}{order.estimated_weight && <p>Perkiraan {formatDecimal(order.estimated_weight)} kg</p>}{order.estimated_count && <p>Perkiraan {formatDecimal(order.estimated_count)} ekor</p>}{order.note && <p>{order.note}</p>}</div>
        {order.status === "open" && !rs.length && <details className="form-details"><summary>Ubah DO</summary><DOForm id={order.id} today={today} suppliers={suppliersOptions} products={products} initial={{ date: order.purchase_date, supplier: order.supplier_id, product: order.product_id, variant:orderVariants.data?.find(v=>v.id===order.id)?.variant_id??"", origin: order.origin ?? "", weight: order.estimated_weight ?? "", count: String(order.estimated_count ?? ""), method: order.price_method, price: String(order.price), note: order.note ?? "" }}/></details>}
        {order.status==="open"&&!rs.length&&!pendingForOrder.length&&<details className="form-details"><summary>Batalkan DO</summary><form action={managePurchase} className="form"><input type="hidden" name="id" value={order.id}/><input type="hidden" name="action" value="cancel"/><input type="hidden" name="return_to" value={`/pembelian?do=${order.id}&period=all`}/><label>Alasan pembatalan<textarea name="note" required maxLength={1000}/></label><SubmitButton secondary>Batalkan DO</SubmitButton></form></details>}
        {pendingForOrder.map(m => <details className="form-details" key={m.id} open><summary>Konfirmasi hasil timbang {formatDecimal(m.actual_weight)} kg</summary><MeasuredReceiptForm id={randomUUID()} measurement={m} method={order.price_method} price={String(order.price)} returnTo={`/pembelian?do=${order.id}&period=all`}/><details className="form-details"><summary>Batalkan hasil timbang</summary><form action={cancelMeasurement} className="form"><input type="hidden" name="id" value={m.id}/><input type="hidden" name="return_to" value={`/pembelian?do=${order.id}&period=all`}/><label>Alasan<textarea name="note" required maxLength={1000}/></label><SubmitButton secondary>Batalkan hasil timbang</SubmitButton></form></details></details>)}
        {!!rs.length && <SectionHeading title="Penerimaan & pembayaran"/>}
        {rs.map(r => {
          const bill = (bills.data ?? []).find(b => b.source_id === r.id) as Obligation | undefined;
          const paid = !!bill && Number(bill.balance) <= 0;
          const reminder = bill ? purchaseDueReminder(bill, today) : null;
          const returnTo = `/pembelian?receipt=${r.id}&period=all`;
          if(r.reversed_by)return <article className="receipt-card" key={r.id}><strong>Penerimaan dibatalkan</strong><p>{formatDate(r.receipt_date)}</p><Link className="text-link" href={`/dokumen/pembelian/${r.id}`}>Lihat riwayat penerimaan</Link></article>;
          return <article className="receipt-card" key={r.id}>
            <div className="receipt-heading"><strong>{formatDate(r.receipt_date)} · {formatDecimal(r.actual_weight)} kg</strong><span className={`badge ${paid ? "badge-green" : "badge-amber"}`}>{bill ? paid ? "Lunas" : "Belum lunas" : "Status belum dapat dimuat"}</span></div>
            {r.origin_weight && <p>Berat asal {formatDecimal(r.origin_weight)} kg · Netto {formatDecimal(r.actual_weight)} kg</p>}
            <p>{r.billing_quantity ? `${formatDecimal(r.billing_quantity)} ${r.price_method??order.price_method} × Rp${formatDecimal(r.unit_price??order.price)}` : "Tagihan borongan"} = Rp{formatDecimal(r.bill_amount)}</p>
            {r.note && <p>{r.note}</p>}
            {bill && <><p>Sudah dibayar Rp{formatDecimal(bill.paid)}{Number(bill.credited) > 0 ? ` · Pengurangan tagihan Rp${formatDecimal(bill.credited)}` : ""}</p>{!paid && <strong>Sisa Rp{formatDecimal(bill.balance)}</strong>}</>}
            {reminder && <p className="notice" role="status">{reminder} · Sisa Rp{formatDecimal(bill!.balance)}</p>}
            {bill && !paid && <>
              <details className="form-details"><summary>Bayar supplier</summary><PaymentForm id={randomUUID()} bill={bill} today={today} accounts={options.accounts} returnTo={returnTo}/></details>
              <details className="form-details"><summary>{r.due_date ? "Ubah pengingat jatuh tempo" : "Tambah pengingat jatuh tempo"}</summary><form action={managePurchase} className="form"><input type="hidden" name="id" value={r.id}/><input type="hidden" name="action" value="due"/><input type="hidden" name="return_to" value={returnTo}/><DatePicker label="Tanggal jatuh tempo" name="due" today={today} optional defaultValue={r.due_date ?? ""}/><p className="form-hint">Pengingat tampil sehari sebelumnya, pada hari jatuh tempo, dan selama terlambat.</p><SubmitButton>Simpan pengingat</SubmitButton></form></details>
            </>}
            {(payments.data ?? []).filter(p => p.source_id === r.id).map(p => <p className="caption" key={p.id}>{formatDate(p.payment_date)} · {p.reversed_by ? "Pembayaran dibatalkan" : "Dibayar"} Rp{formatDecimal(p.amount)}{p.note ? ` · ${p.note}` : ""}</p>)}
            <Link className="text-link" href={`/dokumen/pembelian/${r.id}`}>Lihat / kelola penerimaan</Link>
            {(returns.data ?? []).filter(rt => rt.source_id === r.id).map(rt => <Link className="text-link" href={`/dokumen/${rt.id}`} key={rt.id}>Lihat riwayat pengembalian barang #{rt.document_no}</Link>)}
          </article>;
        })}
        {order.status === "open" && !measurements.error && !pendingForOrder.length && <details className="form-details" open={!rs.length}><summary>{rs.length ? "Tambah penerimaan" : "Terima barang"}</summary><ReceiptForm id={randomUUID()} doId={order.id} today={today} method={order.price_method} price={String(order.price)} product={options.products.find(p=>p.id===order.product_id)} variant={orderVariants.data?.find(v=>v.id===order.id)?.variant_id??""} defaultWeight={order.estimated_weight??""}/></details>}
        <details className="form-details"><summary>Lampiran nota supplier (opsional)</summary>{evidence.filter(a => a.source_id === order.id).map(a => a.url && <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="text-link">{a.file_name}</a>)}<form action={uploadEvidence} className="form"><input type="hidden" name="source" value={order.id}/><input type="hidden" name="return_to" value="/pembelian"/><label>Nota / bukti transfer (PDF/JPG/PNG, maks. 10 MB)<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required/></label><SubmitButton secondary>Unggah lampiran</SubmitButton></form></details>
      </Sheet>;
    })}{!orders.error && !list.length && <EmptyState title="Belum ada DO pada filter ini"/>}</div>
    <Pagination query={q} path="/pembelian" hasNext={list.length > 20}/>
  </AppShell>;
}
