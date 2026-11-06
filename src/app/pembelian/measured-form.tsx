import {confirmMeasurement} from "@/app/operasi/actions";
import {PurchaseBillingFields} from "@/components/purchase-billing-fields";
import {SubmitButton} from "@/components/submit-button";
import {formatDate,formatDecimal} from "@/lib/format";
export function MeasuredReceiptForm({id,measurement,method,price,returnTo}:{id:string;measurement:{id:string;measurement_date:string;actual_weight:string;origin_weight:string|null;note:string|null};method:string;price:string;returnTo:string}){
 return <form action={confirmMeasurement} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="measurement_id" value={measurement.id}/><input type="hidden" name="return_to" value={returnTo}/><p className="calculation">{formatDate(measurement.measurement_date)} · Netto {formatDecimal(measurement.actual_weight)} kg{measurement.origin_weight?` · Asal ${formatDecimal(measurement.origin_weight)} kg`:""}</p>{measurement.note&&<p className="caption">{measurement.note}</p>}<PurchaseBillingFields method={method} price={price} actualWeight={measurement.actual_weight}/><label>Catatan konfirmasi<textarea name="note" maxLength={1000}/></label><SubmitButton>Konfirmasi penerimaan</SubmitButton></form>;
}
