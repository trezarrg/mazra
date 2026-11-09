"use client";
import { Dropdown } from "./dropdown";
import { NumberInput } from "./number-input";
import { formatDate, formatDecimal } from "@/lib/format";
import { changeMeasurementReference, editMeasurement, pairedRatio, type MeasuredItem, type MeasurementProduct } from "@/lib/measurement";

export function MeasurementFields<T extends MeasuredItem>({item,product,prefix,onChange,reference=true}:{item:T;product?:MeasurementProduct;prefix:string;onChange:(next:T)=>void;reference?:boolean}) {
  const countUnit=product?.count_unit??item.count_unit??(item.unit!=="kg"?item.unit:"pcs");
  const estimated=item.weight_source==="estimated"||item.count_source==="estimated";
  const ratio=item.measurement_ratio||pairedRatio(item.unit==="kg"?item.quantity:item.weight,item.unit==="kg"?(item.count??""):item.quantity);
  const groups=(product?.references??[]).filter(r=>(r.variant_id??"")===(item.variant??""));
  return <div className="measurement-fields">
    {item.unit==="kg" ? <label>Jumlah ({countUnit}) <span className="optional">opsional</span><NumberInput name={`${prefix}_count`} value={item.count??""} onValueChange={value=>onChange(editMeasurement(item,"count",value,product))}/></label>
      : <label>Berat (kg)<NumberInput name={`${prefix}_weight`} value={item.weight} required onValueChange={value=>onChange(editMeasurement(item,"weight",value,product))}/></label>}
    {!product?.count_unit && <Dropdown label="Satuan jumlah" name={`${prefix}_count_unit`} defaultValue={countUnit} options={[{value:"ekor",label:"Ekor"},{value:"pcs",label:"Pcs"},{value:"set",label:"Set"}]} onValueChange={value=>onChange({...item,count_unit:value})}/>}
    {reference && (groups.length>0||item.stock_reference) && <Dropdown key={`${item.variant??""}-${item.stock_reference??""}`} label="Referensi stok" name={`${prefix}_reference`} defaultValue={item.stock_reference??""} options={[{value:"",label:"Stok gabungan / tanpa referensi"},...(item.stock_reference&&!groups.some(g=>g.id===item.stock_reference)?[{value:item.stock_reference,label:`Referensi tersimpan · ${item.stock_reference.slice(0,8)}`}]:[]),...groups.map(r=>({value:r.id,label:`${formatDate(r.movement_date)} · ${formatDecimal(r.quantity)} kg · ${r.id.slice(0,8)}`}))]} onValueChange={value=>onChange(changeMeasurementReference(item,value,product))}/>}
    {ratio && <p className="caption">{estimated?"Perkiraan memakai rasio":"Rata-rata dari isian"} {formatDecimal(ratio)} kg/{countUnit}.{item.stock_reference&&" Referensi membantu konversi; persediaan tetap dihitung gabungan per produk dan ukuran."}</p>}
    {estimated && <label className="check measurement-confirm"><input type="checkbox" checked={item.estimate_confirmed==="true"} required onChange={event=>onChange({...item,estimate_confirmed:event.target.checked?"true":""})}/>Gunakan {item.weight_source==="estimated"?`${formatDecimal(item.unit==="kg"?item.quantity:item.weight)} kg`:`${formatDecimal(item.unit==="kg"?(item.count??""):item.quantity)} ${countUnit}`} sebagai perkiraan.</label>}
  </div>;
}
