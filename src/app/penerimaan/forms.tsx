"use client";
import {useState} from "react";
import {recordMeasurement} from "@/app/operasi/actions";
import {DatePicker} from "@/components/date-picker";
import {Dropdown} from "@/components/dropdown";
import {NumberInput} from "@/components/number-input";
import {SubmitButton} from "@/components/submit-button";
import {formatDecimal} from "@/lib/format";
import type {Option} from "@/lib/operations";
export function MeasurementForm({id,today,orders}:{id:string;today:string;orders:Option[]}){
 const [origin,setOrigin]=useState("");const [actual,setActual]=useState("");const diff=Number(actual)-Number(origin);
 return <form action={recordMeasurement} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="return_to" value="/penerimaan"/><Dropdown label="DO diterima" name="do_id" required options={[{value:"",label:"Pilih DO"},...orders]}/><DatePicker label="Tanggal timbang" name="date" today={today} defaultValue={today}/><label>Berat asal (kg), opsional<NumberInput name="origin_weight" onValueChange={setOrigin}/></label><label>Netto aktual (kg)<NumberInput name="actual_weight" required onValueChange={setActual}/></label>{Number(origin)>0&&Number(actual)>0&&<p className="calculation">Selisih {formatDecimal(diff.toFixed(3))} kg ({formatDecimal((diff/Number(origin)*100).toFixed(2))}%)</p>}<label>Catatan<textarea name="note" maxLength={1000}/></label><p className="form-hint">Stok dan hutang berubah setelah pengelola mengonfirmasi penerimaan.</p><SubmitButton>Kirim hasil timbang</SubmitButton></form>;
}
