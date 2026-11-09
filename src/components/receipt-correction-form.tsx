"use client";
import { useState } from "react";
import { changeTransaction } from "@/app/operasi/actions";
import { formatDecimal } from "@/lib/format";
import { multiplyMoney } from "@/lib/money";
import type { Option,Product } from "@/lib/operations";
import { changeMeasurementReference,editMeasurement,measurementMetadata,type MeasuredItem,type Measurement } from "@/lib/measurement";
import { MeasurementFields } from "./measurement-fields";
import { DatePicker } from "./date-picker";
import { Dropdown } from "./dropdown";
import { NumberInput } from "./number-input";
import { SubmitButton } from "./submit-button";

export type ReceiptCorrectionData={date:string;supplier:string;product:string;method:string;price:string;actual_weight:string;origin_weight:string;billing_quantity:string;lump_amount:string;due:string;note:string;variant?:string;measurement?:(Measurement&{count?:string})|null};
export function ReceiptCorrectionForm({id,source,today,initial,suppliers,products,originalTotal,paid,catalog=[]}:{id:string;source:string;today:string;initial:ReceiptCorrectionData;suppliers:Option[];products:Option[];originalTotal:string;paid:string;catalog?:Product[]}) {
 const [data,setData]=useState(initial);const set=(key:keyof ReceiptCorrectionData,value:string)=>setData(current=>({...current,[key]:value}));
 const [measure,setMeasure]=useState<MeasuredItem>({...initial.measurement,unit:"kg",variant:initial.variant??"",quantity:initial.actual_weight,weight:"",count:initial.measurement?.count??""});
 const product=catalog.find(p=>p.id===data.product);
 const total=data.method==='borongan'?data.lump_amount||'0':multiplyMoney(data.price||'0',data.billing_quantity||'0');
 return <form action={changeTransaction} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="source_kind" value="receipt"/><input type="hidden" name="source" value={source}/><input type="hidden" name="action" value="replace"/><input type="hidden" name="return_to" value={`/dokumen/pembelian/${source}`}/><input type="hidden" name="data" value={JSON.stringify({...data,actual_weight:measure.quantity,measurement:{...measurementMetadata(measure),count:measure.count??""}})}/>
  <DatePicker label="Tanggal penerimaan" name="_date" today={today} defaultValue={data.date} onValueChange={value=>set('date',value)}/>
  <Dropdown label="Supplier" name="_supplier" required defaultValue={data.supplier} options={[{value:'',label:'Pilih supplier'},...suppliers]} onValueChange={value=>set('supplier',value)}/>
  <Dropdown label="Produk" name="_product" required defaultValue={data.product} options={[{value:'',label:'Pilih produk'},...products]} onValueChange={value=>{setData(current=>({...current,product:value,variant:""}));setMeasure({unit:"kg",quantity:"",weight:"",count:""});}}/>
  {!!product?.product_variants.length&&<Dropdown key={data.product} label="Ukuran / varian" name="_variant" defaultValue={data.variant??""} options={[{value:"",label:"Tanpa varian / campuran"},...product.product_variants.map(v=>({value:v.id,label:v.name}))]} onValueChange={value=>{set("variant",value);setMeasure(current=>changeMeasurementReference({...current,variant:value},"",product));}}/>}
  <label>Berat asal (kg)<span className="optional">opsional</span><NumberInput name="_origin" defaultValue={data.origin_weight} onValueChange={value=>set('origin_weight',value)}/></label>
  <label>Berat diterima (kg)<NumberInput name="_actual" required value={measure.quantity} onValueChange={value=>setMeasure(current=>editMeasurement(current,"weight",value,product))}/></label>
  <MeasurementFields key={`${data.product}-${data.variant??""}`} item={measure} product={product} prefix="_receipt_correction" reference={false} onChange={setMeasure}/>
  <Dropdown label="Dasar harga" name="_method" defaultValue={data.method} options={[{value:'kg',label:'Per kg'},{value:'ekor',label:'Per ekor'},{value:'borongan',label:'Borongan'}]} onValueChange={value=>set('method',value)}/>
  {data.method==='borongan'?<label>Total tagihan borongan (Rp)<NumberInput name="_lump" defaultValue={data.lump_amount} required onValueChange={value=>set('lump_amount',value)}/></label>:<><label>Harga per {data.method} (Rp)<NumberInput name="_price" defaultValue={data.price} required onValueChange={value=>set('price',value)}/></label><label>{data.method==='kg'?'Berat yang ditagihkan (kg)':'Jumlah yang ditagihkan (ekor)'}<NumberInput name="_billing" defaultValue={data.billing_quantity} required onValueChange={value=>set('billing_quantity',value)}/></label></>}
  <DatePicker label="Jatuh tempo" name="_due" today={today} optional defaultValue={data.due} onValueChange={value=>set('due',value)}/><label>Catatan<textarea value={data.note} maxLength={1000} onChange={e=>set('note',e.target.value)}/></label>
  <div className="transaction-impact"><p>Sebelumnya Rp{formatDecimal(originalTotal)}</p><strong>Tagihan baru Rp{formatDecimal(total)}</strong><p>Pembayaran tercatat Rp{formatDecimal(paid)}</p><p>Perubahan harga menghitung ulang modal dan HPP. Perubahan barang diperiksa terhadap stok dan transaksi berikutnya.</p></div>
  <label>Alasan perbaikan<textarea name="reason" required maxLength={1000}/></label><label className="checkbox"><input type="checkbox" required/>Saya sudah memeriksa berat, harga, dan tagihan baru.</label><SubmitButton>Simpan perbaikan</SubmitButton>
 </form>;
}
export function PaymentCorrectionForm({id,source,today,initial,accounts,returnTo}:{id:string;source:string;today:string;initial:{date:string;account:string;amount:string;note:string};accounts:Option[];returnTo:string}) {
 const [data,setData]=useState(initial);const set=(key:keyof typeof initial,value:string)=>setData(current=>({...current,[key]:value}));
 return <form action={changeTransaction} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="source_kind" value="payment"/><input type="hidden" name="source" value={source}/><input type="hidden" name="action" value="replace"/><input type="hidden" name="return_to" value={returnTo}/><input type="hidden" name="data" value={JSON.stringify(data)}/><DatePicker label="Tanggal pembayaran" name="_date" today={today} defaultValue={data.date} onValueChange={v=>set('date',v)}/><Dropdown label="Akun" name="_account" required defaultValue={data.account} options={[{value:'',label:'Pilih akun'},...accounts]} onValueChange={v=>set('account',v)}/><label>Nominal (Rp)<NumberInput name="_amount" required defaultValue={data.amount} onValueChange={v=>set('amount',v)}/></label><label>Keterangan<textarea value={data.note} maxLength={1000} onChange={e=>set('note',e.target.value)}/></label><div className="transaction-impact">Catatan sebelumnya dibatalkan dan diganti secara bersamaan. Tidak ada pemindahan uang nyata.</div><label>Alasan perbaikan<textarea name="reason" required maxLength={1000}/></label><label className="checkbox"><input type="checkbox" required/>Saya sudah mencocokkan dengan pembayaran yang sebenarnya.</label><SubmitButton>Simpan perbaikan pembayaran</SubmitButton></form>;
}
