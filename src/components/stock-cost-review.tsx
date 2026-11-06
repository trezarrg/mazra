import Link from "next/link";
import { formatDate,formatDecimal } from "@/lib/format";
import { kindLabels } from "@/lib/operations";
import { saveStockCost } from "@/app/operasi/actions";
import { Sheet } from "./sheet";
import { NumberInput } from "./number-input";
import { SubmitButton } from "./submit-button";
import { EmptyState,ListRow } from "./ui";

export type StockCostReviewRow={id:string;movement_date:string;product_name:string;variant_name:string|null;quantity:string;unit:string;source_type:string;source_id:string|null;issue:string|null;total_value:string|null;reason:string|null;can_fill:boolean};
export function StockCostReview({rows,canEdit}:{rows:StockCostReviewRow[];canEdit:boolean}) {
  return <><p className="caption">Lengkapi nilai modal yang belum diketahui. Isian ini menghitung ulang HPP dan tidak mengubah kg stok, tagihan, atau kas.</p><div className="list-card">{rows.map(row=><Sheet key={row.id} title="Modal stok" className="row-button" trigger={<ListRow title={[row.product_name,row.variant_name].filter(Boolean).join(" · ")} subtitle={`${formatDate(row.movement_date)} · ${kindLabels[row.source_type]??row.source_type} · ${formatDecimal(row.quantity)} ${row.unit}`} trailing={<span className={`badge ${row.issue?"badge-amber":"badge-green"}`}>{row.issue?"Perlu diperiksa":"Terisi"}</span>}/>}>
    <div className="document-summary"><strong>{row.product_name}</strong><p>{formatDate(row.movement_date)} · {formatDecimal(row.quantity)} {row.unit}</p><p>{row.issue??"Nilai modal manual sudah diterapkan."}</p></div>
    {row.source_id && <Link className="text-link" href={row.source_type==="purchase_receipt"?`/dokumen/pembelian/${row.source_id}`:`/dokumen/${row.source_id}`}>Lihat transaksi</Link>}
    {row.can_fill && canEdit ? <form action={saveStockCost} className="form"><input type="hidden" name="movement" value={row.id}/><input type="hidden" name="return_to" value="/akuntansi?tab=modal"/><label>Total nilai modal untuk {formatDecimal(row.quantity)} {row.unit} (Rp)<NumberInput name="amount" defaultValue={row.total_value??""} required/></label><label>Alasan / sumber nilai modal<textarea name="reason" defaultValue={row.reason??""} maxLength={1000} required/></label><p className="caption">Isi total modal gerakan ini, bukan harga per kg. Nilai Rp0 hanya untuk barang yang memang tanpa modal.</p><SubmitButton>Simpan modal</SubmitButton></form> : <p className="caption">{row.can_fill?"Pengisian modal dilakukan oleh pemilik.":"Periksa modal bahan atau urutan tanggal pada transaksi asal terlebih dahulu."}</p>}
  </Sheet>)}{!rows.length&&<EmptyState title="Tidak ada modal stok yang perlu diperiksa"/>}</div></>;
}
