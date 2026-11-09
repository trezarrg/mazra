"use client";
import { useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { Dropdown } from "@/components/dropdown";
import { NumberInput } from "@/components/number-input";
import { SubmitButton } from "@/components/submit-button";
import { PurchaseBillingFields } from "@/components/purchase-billing-fields";
import { formatDecimal } from "@/lib/format";
import { confirmReceipt, createDO } from "./actions";
import { managePurchase } from "@/app/operasi/actions";
import { ReceiptMeasurementFields } from "@/components/receipt-measurement-fields";
import type { Product } from "@/lib/operations";

type Option = { value: string; label: string };
export function DOForm({ id, today, suppliers, products, initial,catalog=[] }: { id:string; today:string; suppliers:Option[]; products:Option[]; initial?:Record<string,string>;catalog?:Product[] }) {
  const [method, setMethod] = useState(initial?.method??"kg");
  const [selectedProduct,setSelectedProduct]=useState(initial?.product??"");
  const variants=catalog.find(p=>p.id===selectedProduct)?.product_variants.filter(v=>v.active)??[];
  return <form action={initial?managePurchase:createDO} className="form"><input type="hidden" name="id" value={id}/>{initial&&<><input type="hidden" name="action" value="edit"/><input type="hidden" name="return_to" value="/pembelian"/></>}<DatePicker label="Tanggal DO" name="date" today={today} defaultValue={initial?.date??today}/><Dropdown label="Supplier" name="supplier" required defaultValue={initial?.supplier??""} options={[{value:"",label:"Pilih supplier"},...suppliers]}/><Dropdown label="Produk" name="product" required defaultValue={initial?.product??""} options={[{value:"",label:"Pilih produk ayam hidup"},...products]} onValueChange={setSelectedProduct}/>{variants.length>0&&<Dropdown key={selectedProduct} label="Ukuran / varian" name="variant" defaultValue={initial?.variant??""} options={[{value:"",label:"Tanpa varian / campuran"},...variants.map(v=>({value:v.id,label:v.name}))]}/>}<label>Asal kandang <span className="optional">opsional</span><input name="origin" maxLength={200} defaultValue={initial?.origin}/></label><label>Perkiraan berat (kg) <span className="optional">opsional</span><NumberInput name="weight" defaultValue={initial?.weight}/></label><label>Perkiraan jumlah ekor <span className="optional">opsional</span><NumberInput name="count" defaultValue={initial?.count}/></label><Dropdown label="Dasar harga" name="method" defaultValue={method} options={[{value:"kg",label:"Per kg"},{value:"ekor",label:"Per ekor"},{value:"borongan",label:"Borongan"}]} onValueChange={setMethod}/><label>{method === "borongan" ? "Total harga borongan (Rp)" : `Harga per ${method} (Rp)`}<NumberInput name="price" required defaultValue={initial?.price}/></label><label>Catatan <span className="optional">opsional</span><textarea name="note" maxLength={1000} defaultValue={initial?.note}/></label><SubmitButton>Simpan DO</SubmitButton></form>;
}
export function ReceiptForm({ id, doId, today, method, price,product,variant="",defaultWeight="" }: { id:string; doId:string; today:string; method:string; price:string;product?:Product;variant?:string;defaultWeight?:string }) {
  const [origin, setOrigin] = useState(""); const [actual, setActual] = useState(defaultWeight);
  const difference = origin && actual && Number(origin)>0 && Number(actual)>0 ? Number(actual)-Number(origin) : null;
  return <form action={confirmReceipt} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="do_id" value={doId}/><DatePicker label="Tanggal penerimaan" name="date" today={today} defaultValue={today}/><label>Berat asal (kg) <span className="optional">opsional</span><NumberInput name="origin_weight" onValueChange={setOrigin}/></label><ReceiptMeasurementFields product={product} variant={variant} defaultWeight={defaultWeight} onWeightChange={setActual}/>{difference !== null && <p className="caption">Selisih: {difference > 0 ? "+" : ""}{formatDecimal(difference.toFixed(3))} kg ({formatDecimal((difference/Number(origin)*100).toFixed(2))}%)</p>}<PurchaseBillingFields key={method === "kg" ? actual : method} method={method} price={price} actualWeight={actual}/><label>Catatan <span className="optional">opsional</span><textarea name="note" maxLength={1000}/></label><SubmitButton>Konfirmasi penerimaan</SubmitButton></form>;
}
