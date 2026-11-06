import { randomUUID } from "node:crypto";
import { DatePicker } from "./date-picker";
import { SubmitButton } from "./submit-button";
import { reverseDocument } from "@/app/operasi/actions";
export function CorrectionForm({source,kind,today,returnTo,sourceDate}:{source:string;kind:"operation"|"payment"|"receipt";today:string;returnTo:string;sourceDate?:string}) {
 const label=kind==="payment"?"Batalkan pembayaran":kind==="receipt"?"Batalkan penerimaan":"Batalkan transaksi";
 return <details className="form-details"><summary>{label}</summary><form action={reverseDocument} className="form"><input type="hidden" name="id" value={randomUUID()}/><input type="hidden" name="source" value={source}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="return_to" value={returnTo}/><p className="form-hint">{kind==="payment"?"Untuk catatan pembayaran yang salah. Saldo kas dan tagihan dikoreksi; ini tidak memindahkan atau mengembalikan uang nyata.":"Stok dan tagihan diperiksa lalu dibatalkan. Jika barang benar-benar dikembalikan, gunakan retur. Riwayat transaksi tetap tersimpan."}</p><DatePicker label="Tanggal pembatalan" name="date" today={today} defaultValue={sourceDate&&sourceDate>today?sourceDate:today}/><label>Alasan pembatalan<textarea name="note" required maxLength={1000}/></label><label className="checkbox"><input type="checkbox" required/>Saya memastikan catatan ini salah atau transaksi tidak terjadi.</label><SubmitButton>{label}</SubmitButton></form></details>;
}
