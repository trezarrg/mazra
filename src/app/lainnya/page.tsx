import Link from "next/link";
import { requireAccess } from "@/lib/access";
import { officeRoles } from "@/lib/operations";
import { AppShell } from "@/components/app-shell";
import { ListRow } from "@/components/ui";

export default async function Page() {
  const { role, roles } = await requireAccess();
  const office = roles.some(r => officeRoles.includes(r));
  const groups = [
    { title: "Operasional", items: [
      { href: "/dokumen", label: "Dokumen & draft", detail: "Transaksi tersimpan dan dokumen final", show: true },
      { href: "/penerimaan", label: "Timbang penerimaan", detail: "Catat berat fisik barang masuk", show: office || roles.includes("production") },
      { href: "/stok", label: "Stok", detail: "Persediaan ayam hidup dan hasil olahan", show: office || roles.includes("production") },
      { href: "/produksi", label: "Hasil potong", detail: "Catat pengolahan dan hasil timbang", show: office || roles.includes("production") },
      { href: "/riwayat", label: "Riwayat transaksi", detail: "Rekap penjualan dan pembelian", show: office },
    ] },
    { title: "Keuangan & tim", items: [
      { href: "/tagihan", label: "Piutang & hutang", detail: "Sisa tagihan dan pembayaran", show: office },
      { href: "/sdm", label: "Pekerja, gaji & kasbon", detail: "Data pekerja dan pembayaran gaji", show: office },
      { href: "/aset", label: "Aset tetap", detail: "Perolehan dan pelepasan aset", show: office },
    ] },
    { title: "Laporan & pengaturan", items: [
      { href: "/akuntansi", label: "Akuntansi & posisi saldo", detail: "Saldo akun dan laporan keuangan", show: office },
      { href: "/analisis", label: "Analisis usaha", detail: "Perbandingan periode dan perhatian usaha", show: office },
      { href: "/data", label: "Data utama & pengaturan", detail: "Mitra, produk, akun, dan akses tim", show: office },
    ] },
  ];
  return <AppShell title="Lainnya" active="more" role={role} roles={roles}><div className="module-groups">{groups.filter(group => group.items.some(item => item.show)).map(group => <section key={group.title}><h2>{group.title}</h2><div className="list-card">{group.items.filter(item => item.show).map(item => <Link href={item.href} key={item.href}><ListRow title={item.label} subtitle={item.detail}/></Link>)}</div></section>)}</div></AppShell>;
}
