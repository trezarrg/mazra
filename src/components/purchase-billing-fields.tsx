"use client";

import { useState } from "react";
import { formatDecimal } from "@/lib/format";
import { multiplyMoney } from "@/lib/money";
import { NumberInput } from "./number-input";

export function PurchaseBillingFields({ method, price, actualWeight }: { method: string; price: string; actualWeight: string }) {
  const [quantity, setQuantity] = useState(method === "kg" ? actualWeight : "");
  const [amount, setAmount] = useState("");
  if (method === "borongan") return <>
    <p className="caption">Harga borongan DO Rp{formatDecimal(price)}. Isi nominal untuk penerimaan ini.</p>
    <label>Tagihan penerimaan (Rp)<NumberInput name="lump_amount" required onValueChange={setAmount}/></label>
    {amount && <p className="calculation" role="status">Total tagihan <strong>Rp{formatDecimal(amount)}</strong></p>}
  </>;

  return <>
    <p className="caption">Harga Rp{formatDecimal(price)} per {method}. Isi {method === "kg" ? "berat" : "jumlah ekor"} yang ditagihkan, bukan harga atau total rupiah.</p>
    <label>{method === "kg" ? "Berat yang ditagihkan (kg)" : "Jumlah yang ditagihkan (ekor)"}
      <NumberInput name="billing_quantity" required defaultValue={quantity} onValueChange={setQuantity}/>
    </label>
    {method === "kg" && <p className="caption">Terisi dari netto aktual. Ubah bila kesepakatan supplier memakai berat lain.</p>}
    {Number(quantity) > 0 && <p className="calculation" role="status" aria-atomic="true">{formatDecimal(quantity)} {method} × Rp{formatDecimal(price)} = <strong>Rp{formatDecimal(multiplyMoney(price, quantity))}</strong></p>}
    {method === "kg" && Number(actualWeight) > 0 && Number(quantity) > 0 && Number(quantity) !== Number(actualWeight) && <p className="notice" role="status">Berat tagihan berbeda dari netto aktual {formatDecimal(actualWeight)} kg. Pastikan sesuai kesepakatan supplier.</p>}
  </>;
}
