import Link from "next/link";
import { formatDecimal } from "@/lib/format";
import { cents } from "@/lib/money";
import type { Summary } from "@/lib/summary";

export function ProfitBreakdown({summary:s}:{summary:Summary}) {
  const rows:[string,string|null,string?][]=[
    ["Penjualan final",s.sales],["Retur & koreksi penjualan",s.sales_returns],
    ["Omzet bersih",s.net_sales,"subtotal"],["HPP barang terjual",s.cogs],
    ["Laba kotor",s.gross_profit,"subtotal"],["Pendapatan usaha lain",s.other_income],
    ["Hasil pelepasan aset",s.asset_disposal_result],["Biaya operasional",s.operating_expense],
    ["Gaji & upah",s.wages],["Penyesuaian persediaan & retur",s.stock_result],
    ["Profit usaha",s.business_profit,"total"]
  ];
  return <section className="profit-breakdown" aria-label="Rincian perhitungan profit">
    <dl>{rows.map(([label,value,className])=><div key={label} className={className}><dt>{label}</dt><dd className={value!==null && ["Profit usaha","Laba kotor","Penyesuaian persediaan & retur","Hasil pelepasan aset"].includes(label) && cents(value)<BigInt(0)?"amount-negative":undefined}>{value===null?<span className="cost-incomplete">Belum lengkap</span>:`Rp${formatDecimal(value)}`}</dd></div>)}</dl>
    {!s.profit_complete && <p className="notice is-error">Modal untuk sebagian transaksi belum lengkap. <Link href="/akuntansi?tab=modal">Periksa modal stok</Link></p>}
    <p className="caption">Profit usaha sebelum pajak dan penyusutan. Pembelian menjadi HPP saat stok terjual; pembayaran cicilan tidak mengubah laba.</p>
  </section>;
}
