import { randomUUID } from "node:crypto";
import { Sheet } from "@/components/sheet";
import { ReceiptCorrectionForm } from "@/components/receipt-correction-form";
import { MetadataForm,TransactionHistory,type ChangeRecord } from "@/components/transaction-tools";
import { CorrectionForm } from "@/components/correction-form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { businessToday, type Query } from "@/lib/period";
import { officeRoles, type Obligation } from "@/lib/operations";
import { cents, fromCents } from "@/lib/money";
import { purchaseDocumentNumber, type PurchaseDocumentData, type DocumentPayment } from "@/lib/purchase-document";
import { AppShell } from "@/components/app-shell";
import { PurchaseDocumentView } from "@/components/purchase-document-view";
import { PurchaseDocumentManagement } from "@/components/purchase-document-management";
import { Feedback } from "@/components/query-ui";
import { Notice } from "@/components/ui";

export default async function PurchaseDocument({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { db, role, roles } = await requireAccess(officeRoles);
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const receipt = await db.from("purchase_receipt_list").select("*").eq("id", id).maybeSingle();
  if (receipt.error) return <AppShell title="Dokumen pembelian" active="more" role={role} roles={roles}><Notice error>Dokumen tidak dapat dimuat.</Notice></AppShell>;
  if (!receipt.data) notFound();
  const r = receipt.data;
  const [order, billResult, payments, returns, settings, accounts] = await Promise.all([
    db.from("purchase_list").select("*").eq("id", r.do_id).maybeSingle(),
    db.from("obligations").select("*").eq("source_id", id).eq("kind", "payable").maybeSingle(),
    db.from("payment_records").select("*").eq("source_id", id).eq("kind", "payable").order("created_at"),
    db.from("operation_details").select("id,document_no,operation_date,amount,refund_amount,account_id,note,payload,status").eq("kind", "purchase_return").eq("source_id", id).order("created_at"),
    db.from("business_settings").select("name,address,phone").eq("id", true).single(),
    db.from("cash_accounts").select("id,name,account_type,active").order("name"),
  ]);
  const reversals = returns.data?.length ? await db.from("operations").select("id,reversed_by").in("id", returns.data.map(rt => rt.id)) : { data: [], error: null };
  if ([order, billResult, payments, returns, settings, accounts, reversals].some(result => result.error) || !order.data || (!billResult.data && !r.reversed_by) || !settings.data) return <AppShell title="Dokumen pembelian" active="more" role={role} roles={roles}><Notice error>Rincian dokumen belum dapat dimuat lengkap. Muat ulang halaman sebelum mencetak atau membagikan.</Notice></AppShell>;
  const d = order.data, bill = (billResult.data??{kind:"payable",source_id:id,partner_id:order.data.supplier_id,partner_name:order.data.supplier_name,reference:"",document_date:r.receipt_date,total:r.bill_amount,paid:"0",credited:"0",balance:"0",due_date:r.due_date}) as Obligation;
  const method=r.price_method??d.price_method,price=String(r.unit_price??d.price);
  const supplier = await db.from("partners").select("name,address,phone").eq("id", d.supplier_id).single();
  if (supplier.error || !supplier.data) return <AppShell title="Dokumen pembelian" active="more" role={role} roles={roles}><Notice error>Identitas supplier belum dapat dimuat. Silakan muat ulang halaman.</Notice></AppShell>;
  const accountNames = new Map((accounts.data ?? []).map(a => [a.id, a.name]));
  const returnRecords = (returns.data ?? []).map(rt => ({ ...rt, reversed_by: reversals.data?.find(v => v.id === rt.id)?.reversed_by ?? null }));
  const activeReturns = returnRecords.filter(rt => rt.status === "final" && !rt.reversed_by);
  const documentPayments: DocumentPayment[] = [
    ...(payments.data ?? []).filter(p => !p.reversed_by).map(p => ({ id: p.id, date: p.payment_date, account: p.account_name, amount: p.amount, note: p.note, kind: "payment" as const })),
    ...activeReturns.filter(rt => Number(rt.refund_amount) > 0).map(rt => ({ id: rt.id, date: rt.operation_date, account: accountNames.get(rt.account_id) ?? "Akun pengembalian dana", amount: rt.refund_amount, note: rt.note, kind: "refund" as const })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const document: PurchaseDocumentData = {
    id, number: purchaseDocumentNumber(d.document_no, id), doNumber: d.document_no,
    orderDate: d.purchase_date, receiptDate: r.receipt_date, business: settings.data, supplier: supplier.data,
    product: d.product_name, origin: d.origin, originWeight: r.origin_weight, actualWeight: r.actual_weight,
    billingQuantity: r.billing_quantity, priceMethod: method, unitPrice: price,
    total: bill.total, credited: bill.credited, paid: bill.paid, balance: bill.balance, dueDate: bill.due_date,
    note: r.note ?? d.note, payments: documentPayments,cancelled:!!r.reversed_by,
  };
  const returnedWeight = activeReturns.reduce((sum, rt) => sum + Number(rt.payload?.quantity ?? 0), 0);
  const remainingWeight = Math.max(0, Number(r.actual_weight) - returnedWeight).toFixed(3);
  const [changeHistory,suppliers,products]=await Promise.all([db.from("transaction_changes").select("*").or(`source_id.in.(${[id,...(payments.data??[]).map(p=>p.id)].join(",")}),replacement_id.eq.${id}`).order("created_at",{ascending:false}),db.from("partners").select("id,name").eq("is_supplier",true).order("name"),db.from("products").select("id,name,product_units(unit)").order("name")]);
  return <AppShell title="Dokumen pembelian" active="more" role={role} roles={roles}>
    <div className="purchase-document">
      <div className="purchase-document-back"><Link className="text-link" href={`/pembelian?period=all&receipt=${id}`}>Kembali ke pembelian</Link></div>
      <Feedback query={query} error={!!changeHistory.error||!!suppliers.error||!!products.error}/>
      {r.reversed_by&&<Notice>Penerimaan ini sudah dibatalkan. Stok dan tagihan tidak lagi aktif.</Notice>}

      <TransactionHistory rows={(changeHistory.data??[]) as ChangeRecord[]}/>
      <PurchaseDocumentView key={JSON.stringify(document)} data={document} actions={!r.reversed_by&&!suppliers.error&&!products.error&&<details className="transaction-menu"><summary aria-label="Kelola penerimaan">Kelola</summary><div className="transaction-menu-actions">
        <Sheet title="Edit keterangan" trigger="Edit keterangan" className="button button-secondary"><MetadataForm kind="receipt" source={id} today={businessToday()} note={r.note} due={r.due_date} returnTo={`/dokumen/pembelian/${id}`}/></Sheet>
        <Sheet title="Perbaiki penerimaan" trigger="Perbaiki penerimaan" className="button button-secondary"><ReceiptCorrectionForm id={randomUUID()} source={id} today={businessToday()} originalTotal={bill.total} paid={bill.paid} initial={{date:r.receipt_date,supplier:d.supplier_id,product:d.product_id,method,price,actual_weight:r.actual_weight,origin_weight:r.origin_weight??"",billing_quantity:r.billing_quantity??"",lump_amount:r.bill_amount,due:r.due_date??"",note:r.note??""}} suppliers={(suppliers.data??[]).map(p=>({value:p.id,label:p.name}))} products={(products.data??[]).filter(p=>p.product_units.some(u=>u.unit==="kg")).map(p=>({value:p.id,label:p.name}))}/></Sheet>
        <Sheet title="Batalkan penerimaan" trigger="Batalkan penerimaan" className="button button-secondary"><CorrectionForm source={id} kind="receipt" today={businessToday()} sourceDate={r.receipt_date} returnTo={`/dokumen/pembelian/${id}`}/></Sheet>
      </div></details>}/>
      <PurchaseDocumentManagement source={id} today={businessToday()} payments={payments.data ?? []} returns={returnRecords} remainingWeight={remainingWeight} remainingAmount={fromCents(cents(bill.total) - cents(bill.credited))} balance={bill.balance} price={price} method={method} cancelled={!!r.reversed_by} accounts={(accounts.data ?? []).filter(a => a.active && ["cash", "bank"].includes(a.account_type)).map(a => ({ value: a.id, label: a.name }))} manage={query.manage} error={query.error}/>
    </div>
  </AppShell>;
}
