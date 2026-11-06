import Link from "next/link";
import { randomUUID } from "node:crypto";
import { PaymentCorrectionForm } from "./receipt-correction-form";
import { reverseDocument } from "@/app/operasi/actions";
import { formatDate, formatDecimal } from "@/lib/format";
import type { Option } from "@/lib/operations";
import { DatePicker } from "./date-picker";
import { Sheet } from "./sheet";
import { SubmitButton } from "./submit-button";
import { PurchaseReturnForm } from "./purchase-return-form";

export type ManagedPayment = { id: string; payment_date: string; amount: string; account_name: string; note: string | null; reversed_by: string | null; account_id?:string };
export type ManagedReturn = { id: string; document_no: number; operation_date: string; amount: string; status: string; reversed_by: string | null };

export function PurchaseDocumentManagement({ source, today, payments, returns, remainingWeight, remainingAmount, balance, price, method, accounts, manage, error,cancelled=false }: { source: string; today: string; payments: ManagedPayment[]; returns: ManagedReturn[]; remainingWeight: string; remainingAmount: string; balance: string; price: string; method: string; accounts: Option[]; manage?: string; error?: string;cancelled?:boolean }) {
  const path = `/dokumen/pembelian/${source}`;
  const activePayments = payments.filter(p => !p.reversed_by);
  return <details className="document-management" open={!!manage && !!error}>
    <summary>Kelola transaksi<span>Pembatalan pembayaran dan retur barang</span></summary>
    {!cancelled&&<div className="document-management-grid">
      <section className="document-management-card"><h3>Pembayaran yang salah</h3><p>Batalkan pembayaran yang keliru, lalu catat ulang dari halaman pembelian. Riwayat lama tetap tersimpan.</p>
        {activePayments.map(p => <div className="management-payment" key={p.id}><div><strong>Rp{formatDecimal(p.amount)}</strong><span>{formatDate(p.payment_date)} · {p.account_name}</span></div>{p.account_id&&<Sheet title="Perbaiki pembayaran" trigger="Perbaiki" className="button button-secondary"><PaymentCorrectionForm id={randomUUID()} source={p.id} today={today} initial={{date:p.payment_date,account:p.account_id,amount:p.amount,note:p.note??""}} accounts={accounts} returnTo={path}/></Sheet>}<Sheet title="Batalkan pembayaran" trigger="Batalkan" className="button button-secondary" initialOpen={manage === `cancel-${p.id}` && !!error}>
          {manage === `cancel-${p.id}` && error && <p className="notice is-error" role="alert">{error}</p>}
          <div className="transaction-impact"><strong>Pembayaran Rp{formatDecimal(p.amount)}</strong><p>{formatDate(p.payment_date)} · {p.account_name}</p><p>Pembatalan memperbaiki saldo catatan kas dan tagihan. Ini tidak memindahkan atau mengembalikan uang nyata.</p></div>
          <form action={reverseDocument} className="form"><input type="hidden" name="id" value={randomUUID()}/><input type="hidden" name="source" value={p.id}/><input type="hidden" name="kind" value="payment"/><input type="hidden" name="return_to" value={`${path}?manage=cancel-${p.id}`}/><DatePicker label="Tanggal pembatalan" name="date" today={today} defaultValue={today}/><label>Alasan pembatalan<textarea name="note" required maxLength={1000} placeholder="Jelaskan pembayaran yang keliru"/></label><label className="checkbox"><input type="checkbox" required/>Saya sudah memeriksa pembayaran ini dan ingin membatalkannya.</label><SubmitButton secondary>Konfirmasi pembatalan pembayaran</SubmitButton></form>
        </Sheet></div>)}
        {!activePayments.length && <p>Belum ada pembayaran aktif untuk dibatalkan.</p>}
      </section>
      <section className="document-management-card"><h3>Barang dikembalikan</h3><p>Untuk barang yang benar-benar dikembalikan ke supplier. Stok dan nilai tagihan akan disesuaikan.</p>
        {Number(remainingWeight) > 0 ? <Sheet title="Retur barang ke supplier" trigger="Catat retur barang" className="button button-secondary" initialOpen={manage === "return" && !!error}>
          {manage === "return" && error && <p className="notice is-error" role="alert">{error}</p>}
          <PurchaseReturnForm id={randomUUID()} source={source} today={today} remainingWeight={remainingWeight} remainingAmount={remainingAmount} balance={balance} price={price} method={method} accounts={accounts} returnTo={`${path}?manage=return`}/>
        </Sheet> : <p>Seluruh barang dari penerimaan ini sudah diretur.</p>}
      </section>
    </div>}
    {(payments.some(p => p.reversed_by) || returns.length > 0) && <section className="document-change-history"><h3>Riwayat perubahan</h3>{payments.filter(p => p.reversed_by).map(p => <p key={p.id}>Pembayaran {formatDate(p.payment_date)} · Rp{formatDecimal(p.amount)} · Dibatalkan</p>)}{returns.map(r => <Link key={r.id} href={`/dokumen/${r.id}`}>Retur #{r.document_no} · {formatDate(r.operation_date)} · Rp{formatDecimal(r.amount)}{r.reversed_by ? " · Dibatalkan" : r.status === "draft" ? " · Draft" : ""}</Link>)}</section>}
  </details>;
}
