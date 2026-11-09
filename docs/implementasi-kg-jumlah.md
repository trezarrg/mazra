# Pencatatan kg dan jumlah

Implementasi tahap pertama, 9 November 2026. Migrasi `20261109000100_stock_measurements` diterapkan ke Supabase demo dan Rizki Berkah Abadi. Rilis aplikasi dilakukan melalui workflow GitHub Actions pada branch main.

## Pengaturan awal

1. Di Data → Produk, tetapkan satuan pendamping ekor, pcs, atau set. Aktifkan kg sebagai satuan stok. Satu pasangan ati-ampela bisa ditetapkan sebagai satu set sesuai definisi usaha.
2. Isi rasio kg per satuan pada produk atau masing-masing varian ukuran. Rasio kecil dan besar terpisah; tidak ada angka standar otomatis. Rasio pada referensi penerimaan/hasil yang memiliki pasangan aktual lebih diutamakan.
3. Tentukan apakah estimasi diizinkan dan batas simpan internal bila diperlukan.
4. Untuk stok lama, pemilik menetapkan jumlah awal melalui detail stok berdasarkan hitungan fisik atau perkiraan yang dinyatakan jelas. Penetapan berlaku mulai hari ini, tercatat dalam audit, dan tidak mengubah kg/modal. Transaksi stok sebelum tanggal penetapan ditolak agar saldo pendamping tidak keliru.

## Pemakaian

- Isi ukuran yang diketahui. Ukuran aktual tidak ditimpa saat pasangannya diubah. Pasangan estimasi dapat dihitung ulang dan harus dikonfirmasi sebelum finalisasi; penanda ± ikut tampil pada stok dan dokumen.
- Penerimaan default memakai angka supplier tanpa mewajibkan timbang/hitung ulang. Jumlah boleh kosong. Angka kosong berarti belum diketahui, bukan nol.
- Bila hanya jumlah yang diketahui tetapi rasio belum tersedia, simpan draft untuk dilengkapi. Finalisasi tidak membukukan kg/kerugian nol.
- Di Stok → Mati / dibuang, catat jumlah atau kg, alasan, dan lokasi kejadian. Kehilangan mengurangi stok dan nilai persediaan melalui penilaian yang sudah ada. Tidak mengurangi hutang supplier dan tidak membuat pengeluaran kas kedua.
- Produksi mencatat pasangan ukuran bahan dan tiap hasil secara terpisah. Jumlah karkas, kepala, kaki, dan jeroan tidak dijumlahkan menjadi ekor ayam.
- Penjualan tetap menghitung harga dari satuan tagihan yang dipilih. Pengiriman mencatat realisasi, tanpa pengurangan stok kedua. Retur dan koreksi mengikuti sisa transaksi asal.
- Invoice, SJ tanpa harga, dan struk thermal 58 mm menampilkan ukuran pendamping jika tersedia.
- Batas simpan memberi pengingat untuk diperiksa, tanpa pembuangan otomatis. Umur yang tidak diketahui tidak ditebak dari tanggal migrasi.

## Batas tahap pertama

Kg tetap menjadi dasar stok dan modal rata-rata. Referensi stok membantu konversi dan penelusuran; persediaan tetap gabungan per produk/varian, belum merupakan stok terpisah per kandang, freezer, atau lot. Lokasi pada kehilangan merupakan keterangan kejadian.

Saldo jumlah hanya disebut lengkap bila seluruh gerakan relevan diketahui atau sudah ada penetapan awal. Gerakan tanpa jumlah membuat saldo pendamping tidak lengkap. Riwayat lama tidak diisi dengan perkiraan massal. Snapshot rasio transaksi tersimpan sehingga perubahan pengaturan tidak mengubah riwayat.

## Verifikasi

- Unit: konversi desimal, pembulatan, sumber rasio, angka aktual tidak tertimpa, tanpa rasio, dan larangan estimasi.
- Database: supplier dibayar penuh, kehilangan tanpa kas/tagihan ganda, koreksi estimasi menjadi aktual, ukuran/ref yang tepat, produksi, penjualan, retur, pengiriman, penetapan jumlah awal, idempotensi, dan hak akses.
- Regresi: produksi sederhana, koreksi transaksi, dashboard keuangan/valuasi, antrean penerimaan, pembelian, dan penjualan tanpa kolektor.
- Konkurensi: retry paralel, rebutan stok kg/jumlah, dan batas pembayaran. Fixture dibersihkan.
- Browser: ukuran kecil/besar, konfirmasi estimasi, referensi stok, penerimaan supplier, produksi, penjualan, pengiriman, formulir ponsel, serta dokumen termasuk PDF thermal 58 mm.
- HTTP: 28 halaman memakai sesi admin dan ekspor CSV; TypeScript, lint, dan build Next.js lulus.
- Pembanding sebelum/sesudah migrasi: hash gerakan stok, valuasi, kas, kewajiban, serta jumlah operasi/penerimaan identik untuk masing-masing database. Cadangan definisi fungsi lama dan pembanding tersimpan lokal di `artifacts/stock-measurements`.

Ekspektasi pengujian lama untuk pembatalan diselaraskan dengan aturan yang sudah ada: dokumen dibatalkan tetap tampil dengan status cancelled; pembatalan produksi yang hasilnya sudah dipakai ditolak sampai transaksi turunannya dibalik.

## Rilis dan pemulihan

Skema tambahan kompatibel dengan aplikasi lama. Rilis frontend mengikuti otorisasi rilis proyek. Sebelum rilis, tinjau perubahan Cloudflare dan dokumen penjualan yang juga ada di working tree.

Jika terjadi masalah setelah transaksi baru dibuat, pertahankan tabel dan metadata pengukuran, lalu lakukan perbaikan maju atau matikan akses formulir baru sementara. Jangan menghapus kolom atau mengembalikan saldo secara langsung. Definisi fungsi lama disimpan untuk pembandingan; pemulihan fungsi perlu memperhitungkan transaksi baru dan dilakukan dalam satu transaksi database.
