import { formatDecimal } from "@/lib/format";
export type CorrectionContext={source:string;originalAmount?:string;existingPaid?:string};
export function TransactionChangeFields({correction}:{correction:CorrectionContext}) {
 return <><input type="hidden" name="correction_source" value={correction.source}/>
  <div className="transaction-impact">{correction.originalAmount!==undefined&&<p>Nilai sebelumnya Rp{formatDecimal(correction.originalAmount)}</p>}<p>Perubahan harga yang aman mempertahankan invoice dan pembayaran. Perubahan stok diperiksa terlebih dahulu dan dibuatkan transaksi pengganti. Riwayat lama tetap tersimpan.</p></div>
  <label>Alasan perbaikan<textarea name="correction_reason" required maxLength={1000}/></label>
  <label className="checkbox"><input type="checkbox" required/>Saya sudah memeriksa data dan dampak perbaikan ini.</label>
 </>;
}
