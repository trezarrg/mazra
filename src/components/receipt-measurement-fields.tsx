"use client";
import {useState} from "react";
import {Dropdown} from "./dropdown";
import {NumberInput} from "./number-input";
import {MeasurementFields} from "./measurement-fields";
import {editMeasurement,measurementMetadata,type MeasurementProduct,type MeasuredItem,type WeightSource} from "@/lib/measurement";

export function ReceiptMeasurementFields({product,variant="",defaultWeight="",defaultSource="supplier",onWeightChange}:{product?:MeasurementProduct;variant?:string;defaultWeight?:string;defaultSource?:"supplier"|"measured";onWeightChange?:(weight:string)=>void}) {
  const [basis,setBasis]=useState<"supplier"|"measured">(defaultSource);
  const [item,setItem]=useState<MeasuredItem>({unit:"kg",variant,quantity:defaultWeight,weight:"",count:"",weight_source:defaultSource});
  const update=(next:MeasuredItem)=>{setItem({...next,count_source:next.count_source==="counted"&&basis==="supplier"?"supplier":next.count_source});onWeightChange?.(next.quantity);};
  return <>
    <input type="hidden" name="actual_weight" value={item.quantity}/><input type="hidden" name="measurement" value={JSON.stringify({...measurementMetadata(item),count:item.count??""})}/>
    {item.weight_source!=="estimated"&&<Dropdown label="Sumber berat" name="_weight_basis" defaultValue={basis} options={[{value:"supplier",label:"Angka supplier, tanpa timbang ulang"},{value:"measured",label:"Hasil timbang sendiri"}]} onValueChange={value=>{setBasis(value as "supplier"|"measured");setItem({...item,weight_source:value as WeightSource,count_source:item.count_source&&item.count_source!=="estimated"?(value==="supplier"?"supplier":"counted"):item.count_source});}}/>}
    <label>Berat diterima (kg)<NumberInput name="_receipt_weight" value={item.quantity} required onValueChange={value=>{const next=editMeasurement(item,"weight",value,product);update({...next,weight_source:basis});}}/></label>
    <MeasurementFields item={item} product={product} prefix="_receipt" reference={false} onChange={update}/>
    <p className="caption">Jumlah ekor/pcs boleh kosong. Ayam mati dicatat melalui kehilangan stok, tanpa mengurangi tagihan supplier.</p>
  </>;
}
