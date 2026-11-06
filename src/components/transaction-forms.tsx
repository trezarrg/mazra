"use client";
import { useState } from "react";
import { DatePicker } from "./date-picker";
import { Dropdown } from "./dropdown";
import { NumberInput } from "./number-input";
import { SubmitButton } from "./submit-button";
import { formatDecimal } from "@/lib/format";
import type { Item, Obligation, Option } from "@/lib/operations";
import { payBill, recordDelivery } from "@/app/operasi/actions";

export function PaymentForm({id,bill,today,accounts,returnTo}:{id:string;bill:Obligation;today:string;accounts:Option[];returnTo:string}) {
  const [amount,setAmount] = useState("");
  const amountLabel = bill.kind === "payable" ? "Nominal dibayar ke supplier (Rp)" : "Nominal diterima dari pelanggan (Rp)";
  return <form action={payBill} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="source" value={bill.source_id}/><input type="hidden" name="kind" value={bill.kind}/><input type="hidden" name="return_to" value={returnTo}/><p className="calculation">Sisa Rp{formatDecimal(bill.balance)}</p><DatePicker label="Tanggal pembayaran" name="date" today={today} defaultValue={today}/><Dropdown label="Akun pembayaran" name="account" required options={[{value:"",label:"Pilih akun"},...accounts]}/><label>{amountLabel}<button type="button" className="payment-fill-button" aria-label={`Isi nominal dengan sisa Rp${formatDecimal(bill.balance)}`} onClick={() => setAmount(bill.balance)}>Isi sisa</button><NumberInput name="amount" value={amount} onValueChange={setAmount} required/></label><label>Keterangan<textarea name="note" maxLength={1000}/></label><SubmitButton>Catat pembayaran</SubmitButton></form>;
}
export function DeliveryForm({id,saleId,today,items,returnTo}:{id:string;saleId:string;today:string;items:Item[];returnTo:string}) {
  const [quantities,setQuantities]=useState<Record<string,string>>({});
  return <form action={recordDelivery} className="form"><input type="hidden" name="id" value={id}/><input type="hidden" name="source" value={saleId}/><input type="hidden" name="return_to" value={returnTo}/><input type="hidden" name="items" value={JSON.stringify(Object.entries(quantities).filter(([,q])=>Number(q)>0).map(([item,quantity])=>({item,quantity})))}/><DatePicker label="Tanggal kejadian" name="date" today={today} defaultValue={today}/><Dropdown label="Kejadian" name="stage" options={[{value:"sent",label:"Dikirim"},{value:"received",label:"Diterima pelanggan"}]}/>{items.map(i=><label key={i.id}>{i.products?.name} ({i.unit})<NumberInput name={`_qty_${i.id}`} onValueChange={q=>setQuantities(current=>({...current,[i.id]:q}))}/></label>)}<label>Catatan selisih / penerima<textarea name="note" maxLength={1000}/></label><p className="form-hint">Pengiriman mencatat realisasi. Selisih barang ditindaklanjuti melalui retur atau koreksi.</p><SubmitButton>Catat pengiriman</SubmitButton></form>;
}
