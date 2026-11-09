"use client";

import { useState } from "react";
import { saveOperation } from "@/app/operasi/actions";
import { cents, fromCents, multiplyMoney } from "@/lib/money";
import { formatDecimal } from "@/lib/format";
import type { Option } from "@/lib/operations";
import { DatePicker } from "./date-picker";
import { Dropdown } from "./dropdown";
import { NumberInput } from "./number-input";
import { SubmitButton } from "./submit-button";
import {MeasurementFields} from "./measurement-fields";
import {editMeasurement,measurementMetadata,type MeasuredItem,type MeasurementProduct} from "@/lib/measurement";

export function PurchaseReturnForm({ id, source, today, remainingWeight, remainingAmount, balance, price, method, accounts, returnTo,product,variant="",stockReference="" }: { id: string; source: string; today: string; remainingWeight: string; remainingAmount: string; balance: string; price: string; method: string; accounts: Option[]; returnTo: string;product?:MeasurementProduct;variant?:string;stockReference?:string }) {
  const [date, setDate] = useState(today);
  const [measure,setMeasure]=useState<MeasuredItem>({unit:"kg",quantity:"",weight:"",count:"",variant,stock_reference:stockReference});
  const quantity=measure.quantity;
  const [agreedAmount, setAgreedAmount] = useState<string | null>(null);
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const amount = agreedAmount ?? (method === "kg" && Number(quantity) > 0 ? multiplyMoney(price, quantity) : "");
  const refund = cents(amount) > cents(balance) ? fromCents(cents(amount) - cents(balance)) : "0.00";
  const hasRefund = cents(refund) > BigInt(0);
  return <form action={saveOperation} className="form" onSubmit={event => {
    if (!(Number(quantity) > 0) || Number(quantity) > Number(remainingWeight) || cents(amount) > cents(remainingAmount)) {
      event.preventDefault(); setError("Jumlah barang atau nilai retur melebihi sisa penerimaan yang dapat dikembalikan.");
    }
  }}>
    <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value="purchase_return"/><input type="hidden" name="intent" value="final"/><input type="hidden" name="return_to" value={returnTo}/><input type="hidden" name="data" value={JSON.stringify({ source, date, quantity, count:measure.count,...measurementMetadata(measure),amount, account: hasRefund ? account : "", note })}/>
    <p className="form-hint">Gunakan untuk barang yang dikembalikan ke supplier. Barang yang sudah dipakai atau terjual perlu diperiksa terlebih dahulu.</p>
    <DatePicker label="Tanggal pengembalian" name="_date" today={today} defaultValue={today} onValueChange={setDate}/>
    <label>Berat dikembalikan (kg)<NumberInput name="_quantity" value={quantity} onValueChange={value => { setMeasure(current=>editMeasurement(current,"weight",value,product)); setAgreedAmount(null); setError(""); }} required/></label>
    <MeasurementFields item={measure} product={product} prefix="_purchase_return" reference={false} onChange={next=>{setMeasure(next);setAgreedAmount(null);setError("");}}/>
    <p className="caption">Maksimal {formatDecimal(remainingWeight)} kg dari penerimaan ini.</p>
    <label>Nilai retur disepakati (Rp)<NumberInput name="_amount" value={amount} onValueChange={value => { setAgreedAmount(value); setError(""); }} required/></label>
    {method === "kg" && <p className="caption">Terisi dari berat dikembalikan × Rp{formatDecimal(price)}/kg. Sesuaikan jika nominal yang disepakati berbeda.</p>}
    {Number(quantity) > 0 && <div className="transaction-impact"><strong>Dampak pencatatan</strong><p>Stok berkurang {formatDecimal(quantity)} kg.</p><p>Tagihan berkurang Rp{formatDecimal(amount || "0")}.</p>{hasRefund && <p>Dana Rp{formatDecimal(refund)} dicatat kembali dari supplier.</p>}</div>}
    {hasRefund && <><Dropdown label="Dana dari supplier diterima ke" name="_account" required options={[{ value: "", label: "Pilih kas atau bank" }, ...accounts]} onValueChange={setAccount}/><p className="form-hint">Catat setelah dana Rp{formatDecimal(refund)} benar-benar diterima dari supplier.</p></>}
    <label>Alasan pengembalian<textarea value={note} onChange={event => setNote(event.target.value)} required maxLength={1000} placeholder="Contoh: barang tidak sesuai kesepakatan"/></label>
    <label className="checkbox"><input type="checkbox" required/>Barang dan nominal retur sudah disepakati dengan supplier.</label>
    {hasRefund && <label className="checkbox"><input type="checkbox" required/>Dana pengembalian sudah diterima di akun yang dipilih.</label>}
    {error && <p className="notice is-error" role="alert">{error}</p>}
    <SubmitButton>Catat retur barang</SubmitButton>
  </form>;
}
