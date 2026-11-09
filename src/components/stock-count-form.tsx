import { randomUUID } from "node:crypto";
import { setStockCount } from "@/app/operasi/actions";
import { Dropdown } from "./dropdown";
import { NumberInput } from "./number-input";
import { SubmitButton } from "./submit-button";

export function StockCountForm({product,variant,unit}:{product:string;variant:string;unit:string}) {
  return <form action={setStockCount} className="form"><input type="hidden" name="id" value={randomUUID()}/><input type="hidden" name="product" value={product}/><input type="hidden" name="variant" value={variant}/><input type="hidden" name="return_to" value="/stok"/>
    <p className="caption">Menetapkan jumlah saat ini sebagai awal pencatatan pendamping. Saldo kg, pembelian, dan modal tidak berubah. Transaksi stok bertanggal sebelum penetapan ini perlu diperiksa melalui opname.</p>
    <label>Jumlah saat ini ({unit})<NumberInput name="quantity" required/></label><Dropdown label="Sumber jumlah" name="source" options={[{value:"counted",label:"Hasil hitung fisik"},{value:"estimated",label:"Perkiraan yang diperiksa"}]}/><label>Alasan<textarea name="reason" required maxLength={1000}/></label><SubmitButton>Tetapkan jumlah</SubmitButton>
  </form>;
}
