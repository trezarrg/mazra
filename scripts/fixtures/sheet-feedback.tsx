import { useState } from "react";
import { Sheet } from "../../src/components/sheet";
import { Dropdown } from "../../src/components/dropdown";
import { NumberInput } from "../../src/components/number-input";
import { SubmitButton } from "../../src/components/submit-button";
import { saveOperation } from "@/app/operasi/actions";

export function SheetFeedbackFixture({ version, initialOpen = false }: { version: number; initialOpen?: boolean }) {
  return <Sheet title="Uji penyimpanan" trigger="Buka uji" initialOpen={initialOpen}><FixtureForm key={version} version={version}/></Sheet>;
}
function FixtureForm({ version }: { version: number }) {
  const [quantity, setQuantity] = useState("");
  const [product, setProduct] = useState("");
  return <form action={saveOperation} className="form">
    <input type="hidden" name="kind" value="sheet-feedback"/><input type="hidden" name="id" value={`feedback-${version}`}/>
    <input type="hidden" name="data" value={JSON.stringify({ quantity, product })}/>
    <label>Nama<input name="fixture_name" required/></label>
    <div style={{ height: 600 }}>Isian berikutnya berada di bawah.</div>
    <Dropdown label="Produk" name="fixture_product" required options={[{ value: "", label: "Pilih produk" }, { value: "dada", label: "Dada" }, { value: "paha", label: "Paha" }]} onValueChange={setProduct}/>
    <label>Berat (kg)<NumberInput name="fixture_quantity" required onValueChange={setQuantity}/></label>
    <label>Catatan<textarea name="fixture_note"/></label>
    <label className="checkbox"><input name="fixture_confirm" type="checkbox" required/>Saya menyetujui data.</label>
    <SubmitButton>Simpan uji</SubmitButton>
  </form>;
}
