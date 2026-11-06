"use client";
import {useState} from "react";
import {recordMeasurement} from "@/app/operasi/actions";
import {DatePicker} from "@/components/date-picker";
import {NumberInput} from "@/components/number-input";
import {SubmitButton} from "@/components/submit-button";
import {formatDecimal} from "@/lib/format";
export function MeasurementForm({id,today,doId}:{id:string;today:string;doId:string}){
 const [origin,setOrigin]=useState("");const [actual,setActual]=useState("");const diff=Number(actual)-Number(origin);
 return <form action={recordMeasurement} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="do_id" value={doId}/><input type="hidden" name="return_to" value="/penerimaan"/><DatePicker label="Tanggal timbang" name="date" today={today} defaultValue={today}/><label>Berat asal (kg) <span className="optional">opsional</span><NumberInput name="origin_weight" onValueChange={setOrigin}/></label><label>Netto aktual (kg)<NumberInput name="actual_weight" required onValueChange={setActual}/></label>{Number(origin)>0&&Number(actual)>0&&<p className="calculation">Selisih {formatDecimal(diff.toFixed(3))} kg ({formatDecimal((diff/Number(origin)*100).toFixed(2))}%)</p>}<label>Catatan <span className="optional">opsional</span><textarea name="note" maxLength={1000}/></label><p className="form-hint">Hasil timbang dikirim ke Pembelian. Stok dan hutang berubah setelah pengelola mengonfirmasi.</p><SubmitButton>Kirim hasil timbang</SubmitButton></form>;
}
