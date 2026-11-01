import { randomUUID } from "node:crypto";
import { DatePicker } from "./date-picker";
import { SubmitButton } from "./submit-button";
import { reverseDocument } from "@/app/operasi/actions";
export function CorrectionForm({source,kind,today,returnTo}:{source:string;kind:"operation"|"payment";today:string;returnTo:string}) {
 return <details className="form-details"><summary>Koreksi melalui pembalikan</summary><form action={reverseDocument} className="form"><input type="hidden" name="id" value={randomUUID()}/><input type="hidden" name="source" value={source}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="return_to" value={returnTo}/><p className="form-hint">Pembalikan membatalkan dampak dokumen dan menyimpan riwayat asal. Setelah itu catat dokumen pengganti bila diperlukan.</p><DatePicker label="Tanggal koreksi" name="date" today={today} defaultValue={today}/><label>Alasan koreksi<textarea name="note" required maxLength={1000}/></label><SubmitButton>Catat pembalikan</SubmitButton></form></details>;
}
