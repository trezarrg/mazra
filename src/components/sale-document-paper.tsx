import Image from "next/image";
import { formatDate, formatDecimal } from "@/lib/format";
import { saleDocumentNumber, saleDocumentStatus, saleDocumentTotals, type SaleDocumentData, type SaleDocumentFormat } from "@/lib/sale-document";

const Money = ({value}:{value:string}) => <span className="paper-money"><small>Rp</small>{formatDecimal(value)}</span>;

export function SaleDocumentPaper({data:d,format}:{data:SaleDocumentData;format:SaleDocumentFormat}) {
  const delivery = format === "delivery", thermal = format === "thermal";
  const title = delivery ? "Surat Jalan" : thermal ? "Struk penjualan" : "Invoice penjualan";
  const number = saleDocumentNumber(d.number,format);
  const totals = saleDocumentTotals(d);
  return <article className={`purchase-paper sale-paper${thermal ? " thermal-paper" : ""}`} aria-label={`${title} ${number}`}>
    <header className="paper-header">
      <div className="paper-business">{d.business.logo && <Image src={d.business.logo} width={96} height={64} alt="" unoptimized/>}<div><strong>{d.business.name}</strong>{d.business.address && <p>{d.business.address}</p>}{d.business.phone && <p>Tel. {d.business.phone}</p>}</div></div>
      <div className="paper-heading"><h2>{title}</h2><p className="paper-number">{number}</p>{(d.cancelled || !delivery) && <span className={`paper-status ${d.cancelled ? "is-cancelled" : Number(d.balance)<=0 ? "is-settled" : "is-outstanding"}`}>{saleDocumentStatus(d)}</span>}</div>
    </header>
    <section className="paper-parties" aria-label="Pelanggan dan referensi penjualan">
      <div><h3>{delivery ? "Dikirim kepada" : "Pelanggan"}</h3><strong>{d.customer.name}</strong>{d.customer.address && <p>{d.customer.address}</p>}{d.customer.phone && <p>Tel. {d.customer.phone}</p>}</div>
      <dl className="paper-meta"><div><dt>Tanggal penjualan</dt><dd>{formatDate(d.date)}</dd></div><div><dt>Referensi penjualan</dt><dd>#{d.number}</dd></div>{!delivery && Number(d.balance)>0 && d.dueDate && <div><dt>Jatuh tempo</dt><dd>{formatDate(d.dueDate)}</dd></div>}</dl>
    </section>
    {thermal ? <div className="thermal-items">{d.items.map((item,index)=><div className="thermal-item" key={item.id}><strong>{item.name}{item.variant ? ` · ${item.variant}` : ""}</strong><div><span>{item.unit==="kg"&&item.weight_source==="estimated"?"± ":""}{formatDecimal(item.quantity)} {item.unit} × {formatDecimal(item.price)}</span><b>{formatDecimal(totals.subtotals[index])}</b></div>{item.unit==="kg"&&item.pieces&&<small>{item.count_source==="estimated"?"± ":""}{formatDecimal(item.pieces)} {item.count_unit??"ekor/pcs"}</small>}{item.weight && item.unit!=="kg" && <small>Berat {item.weight_source==="estimated"?"± ":""}{formatDecimal(item.weight)} kg</small>}</div>)}</div> : <table className={`paper-table ${delivery ? "delivery-items" : "paper-items"}`}><caption>Rincian barang{delivery ? " untuk pengiriman" : ""}</caption><thead><tr><th scope="col">Uraian barang</th><th scope="col">Jumlah</th>{!delivery && <><th scope="col">Harga satuan</th><th scope="col">Subtotal</th></>}</tr></thead><tbody>{d.items.map((item,index)=><tr key={item.id}><td><strong>{item.name}</strong>{item.variant && <small>{item.variant}</small>}{item.weight && item.unit!=="kg" && <small>Berat {item.weight_source==="estimated"?"± ":""}{formatDecimal(item.weight)} kg</small>}{item.unit==="kg" && item.pieces && <small>{item.count_source==="estimated"?"± ":""}{formatDecimal(item.pieces)} {item.count_unit??"ekor/pcs"}</small>}</td><td>{item.unit==="kg"&&item.weight_source==="estimated"?"± ":""}{formatDecimal(item.quantity)} {item.unit}</td>{!delivery && <><td><Money value={item.price}/><small>per {item.unit}</small></td><td><Money value={totals.subtotals[index]}/></td></>}</tr>)}</tbody></table>}
    <section className={`paper-settlement${delivery ? " delivery-note" : ""}`}>
      <div className="paper-note"><h3>Catatan</h3><p>{d.note || (delivery ? "Periksa jumlah dan kondisi barang saat serah terima." : "Terima kasih atas kepercayaan Anda.")}</p>{delivery && <p className="paper-due-note">Daftar ini mengikuti jumlah pada penjualan. Realisasi pengiriman dicatat terpisah.</p>}</div>
      {!delivery && <dl className="paper-totals"><div><dt>Subtotal</dt><dd><Money value={totals.subtotal}/></dd></div>{Number(d.discount)>0 && <div><dt>Diskon</dt><dd>− <Money value={d.discount}/></dd></div>}<div><dt>Total penjualan</dt><dd><Money value={d.total}/></dd></div>{Number(d.credited)>0 && <><div><dt>Pengurangan retur</dt><dd>− <Money value={d.credited}/></dd></div><div><dt>Tagihan bersih</dt><dd><Money value={totals.net}/></dd></div></>}<div><dt>Terbayar bersih</dt><dd><Money value={d.paid}/></dd></div><div className="paper-balance"><dt>Sisa tagihan</dt><dd><Money value={d.balance}/></dd></div></dl>}
    </section>
    {delivery && <div className="delivery-signatures"><div><span>Pengirim</span><p>(________________)</p></div><div><span>Penerima</span><p>(________________)</p></div></div>}
    <footer className="paper-footer"><strong>{d.business.name}</strong><p>{delivery ? "Surat jalan ini bukan bukti pembayaran." : "Dokumen berdasarkan penjualan dan pembayaran yang tercatat."}</p><span>{number}</span></footer>
  </article>;
}
