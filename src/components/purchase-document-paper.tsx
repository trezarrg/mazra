import { branding } from "@/lib/branding";
import Image from "next/image";
import { formatDate, formatDecimal } from "@/lib/format";
import { netPurchaseTotal, purchaseDocumentStatus, type PurchaseDocumentData } from "@/lib/purchase-document";

function Money({ value }: { value: string }) {
  return <span className="paper-money"><small>Rp</small>{formatDecimal(value)}</span>;
}

export function PurchaseDocumentPaper({ data: d }: { data: PurchaseDocumentData }) {
  const settled = Number(d.balance) <= 0;
  const hasReturns = Number(d.credited) > 0;
  return <article className="purchase-paper" aria-label={`Bukti pembelian ${d.number}`}>
    <header className="paper-header">
      <div className="paper-business"><Image src={d.business.logo??branding.logo} width={96} height={64} alt="" unoptimized priority/><div><strong>{d.business.name}</strong>{d.business.address && <p>{d.business.address}</p>}{d.business.phone && <p>Tel. {d.business.phone}</p>}</div></div>
      <div className="paper-heading"><p className="paper-kicker">Bukti pembelian</p><h2>Penerimaan & pembayaran</h2><p className="paper-number">{d.number}</p><span className={`paper-status ${d.cancelled?"is-cancelled":settled ? "is-settled" : "is-outstanding"}`}>{purchaseDocumentStatus(d)}</span></div>
    </header>

    <section className="paper-parties" aria-label="Supplier dan referensi transaksi">
      <div><h3>Supplier</h3><strong>{d.supplier.name}</strong>{d.supplier.address && <p>{d.supplier.address}</p>}{d.supplier.phone && <p>Tel. {d.supplier.phone}</p>}</div>
      <dl className="paper-meta"><div><dt>Referensi DO</dt><dd>DO #{d.doNumber}</dd></div><div><dt>Tanggal DO</dt><dd>{formatDate(d.orderDate)}</dd></div><div><dt>Barang diterima</dt><dd>{formatDate(d.receiptDate)}</dd></div>{!settled && d.dueDate && <div><dt>Jatuh tempo</dt><dd>{formatDate(d.dueDate)}</dd></div>}</dl>
    </section>

    <section className="paper-weights" aria-label="Rincian timbang">
      <div><span>Berat asal</span><strong>{d.originWeight ? `${formatDecimal(d.originWeight)} kg` : "Tidak dicatat"}</strong></div>
      <div><span>Berat diterima{d.measurement?.weight_source==="supplier"?" (supplier)":""}</span><strong>{d.measurement?.weight_source==="estimated"?"± ":""}{formatDecimal(d.actualWeight)} kg</strong>{d.measurement?.count&&<small>{d.measurement.count_source==="estimated"?"± ":""}{formatDecimal(d.measurement.count)} {d.measurement.count_unit??"ekor/pcs"}</small>}{d.variant&&<small>{d.variant}</small>}</div>
      <div><span>{d.priceMethod === "borongan" ? "Dasar tagihan" : "Ditagihkan"}</span><strong>{d.billingQuantity ? `${formatDecimal(d.billingQuantity)} ${d.priceMethod}` : "Borongan"}</strong></div>
    </section>

    <table className="paper-table paper-items"><caption>Rincian pembelian</caption><thead><tr><th scope="col">Uraian barang</th><th scope="col">Ditagihkan</th><th scope="col">{d.priceMethod === "borongan" ? "Nilai borongan" : `Harga / ${d.priceMethod}`}</th><th scope="col">Jumlah</th></tr></thead><tbody><tr><td><strong>{d.product}</strong>{d.origin && <small>Asal {d.origin}</small>}</td><td>{d.billingQuantity ? `${formatDecimal(d.billingQuantity)} ${d.priceMethod}` : "1 bagian"}</td><td><Money value={d.priceMethod === "borongan" ? d.total : d.unitPrice}/></td><td><Money value={d.total}/></td></tr></tbody></table>

    <section className="paper-settlement" aria-label="Ringkasan pembayaran">
      <div className="paper-note"><h3>Catatan</h3><p>{d.note || "Pembelian dicatat sesuai penerimaan barang dan dasar tagihan yang disepakati."}</p>{!settled && <p className="paper-due-note">Sisa pembayaran kepada supplier <Money value={d.balance}/>{d.dueDate ? `, jatuh tempo ${formatDate(d.dueDate)}.` : "."}</p>}</div>
      <dl className="paper-totals"><div><dt>Total pembelian</dt><dd><Money value={d.total}/></dd></div>{hasReturns && <><div><dt>Pengurangan retur</dt><dd>− <Money value={d.credited}/></dd></div><div><dt>Tagihan bersih</dt><dd><Money value={netPurchaseTotal(d)}/></dd></div></>}<div><dt>{d.payments.some(p => p.kind === "refund") ? "Dibayar bersih" : "Sudah dibayar"}</dt><dd><Money value={d.paid}/></dd></div><div className="paper-balance"><dt>Sisa tagihan</dt><dd><Money value={d.balance}/></dd></div></dl>
    </section>

    <section className="paper-payments" aria-label="Rincian pembayaran kepada supplier">
      <h3>Rincian pembayaran</h3>
      {d.payments.length ? <table className="paper-table"><thead><tr><th scope="col">Tanggal</th><th scope="col">Akun & referensi</th><th scope="col">Nominal</th></tr></thead><tbody>{d.payments.map(p => <tr key={p.id}><td>{formatDate(p.date)}</td><td><strong>{p.kind === "refund" ? "Dana kembali dari supplier" : p.account}</strong><small>{p.kind === "refund" ? `${p.account} · ` : ""}{p.kind === "refund" ? "RT" : "BYR"}-{p.id.slice(0, 8).toUpperCase()}</small>{p.note && <small>{p.note}</small>}</td><td>{p.kind === "refund" ? "− " : ""}<Money value={p.amount}/></td></tr>)}</tbody></table> : <p className="paper-no-payment">Belum ada pembayaran yang tercatat.</p>}
    </section>
    <footer className="paper-footer"><strong>{d.business.name}</strong><p>Bukti digital berdasarkan penerimaan dan pembayaran yang tercatat. Simpan nomor dokumen ini sebagai referensi transaksi.</p><span>{d.number}</span></footer>
  </article>;
}
