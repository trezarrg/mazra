import Link from "next/link";
import { randomUUID } from "node:crypto";
import { formatDate, formatDecimal } from "@/lib/format";
import { paymentStatus, type Obligation, type Option } from "@/lib/operations";
import { setBillDue } from "@/app/operasi/actions";
import { DatePicker } from "./date-picker";
import { SubmitButton } from "./submit-button";
import { PaymentForm } from "./transaction-forms";

export function BillDetails({bill,today,accounts,returnTo,accountsError=false}:{bill:Obligation;today:string;accounts:Option[];returnTo:string;accountsError?:boolean}) {
  return <>
    <div className="document-summary"><strong>{bill.partner_name}</strong><span className={`badge ${Number(bill.balance)>0?"badge-amber":"badge-green"}`}>{paymentStatus(bill,today)}</span><p>{bill.reference} · {formatDate(bill.document_date)}</p><p>{bill.due_date ? `Jatuh tempo ${formatDate(bill.due_date)}` : "Jatuh tempo belum dijadwalkan"}</p><p>Total Rp{formatDecimal(bill.total)} · Terbayar Rp{formatDecimal(bill.paid)}</p><strong>Sisa Rp{formatDecimal(bill.balance)}</strong></div>
    <Link className="text-link" href={bill.kind==="payable"?`/dokumen/pembelian/${bill.source_id}`:`/dokumen/${bill.source_id}`}>Lihat invoice</Link>
    {Number(bill.balance)>0 && <>
      <details className="form-details"><summary>Catat pembayaran</summary>{accountsError ? <p className="notice is-error">Akun pembayaran belum dapat dimuat. Muat ulang halaman.</p> : <PaymentForm id={randomUUID()} bill={bill} today={today} accounts={accounts} returnTo={returnTo}/>}</details>
      <details className="form-details"><summary>{bill.due_date ? "Ubah jatuh tempo" : "Atur jatuh tempo"}</summary><form action={setBillDue} className="form"><input type="hidden" name="kind" value={bill.kind}/><input type="hidden" name="source" value={bill.source_id}/><input type="hidden" name="return_to" value={returnTo}/><DatePicker label="Tanggal jatuh tempo" name="due" today={today} defaultValue={bill.due_date??""} optional/><SubmitButton>Simpan jatuh tempo</SubmitButton></form></details>
    </>}
  </>;
}
