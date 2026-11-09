# Kajian pencatatan kg dan jumlah ayam

Tanggal kajian: 9 November 2026. Status: usulan berdasarkan kode saat ini dan dokumentasi industri; belum mengubah skema, saldo, atau cara posting transaksi.

## Temuan pada aplikasi

- `src/app/stok/page.tsx` hanya menampilkan saldo unit kg.
- Posting penjualan, retur penjualan, dan produksi pada `20261105000600_simple_processing.sql` menggerakkan stok kg. Penjualan dengan unit ekor/pcs menggunakan `actual_weight` untuk gerakan tersebut.
- `operation_items.piece_count` menyimpan jumlah opsional, tetapi jumlah itu belum menjadi buku pergerakan stok yang tersambung ke seluruh alur.
- Formulir penjualan per kg belum menyediakan jumlah ekor/pcs pendamping; penjualan per ekor/pcs meminta berat aktual.
- Penerimaan menyimpan berat asal, netto aktual, dan kuantitas dasar tagihan. Kuantitas tagihan bukan jumlah fisik hidup yang diterima.
- Jumlah hasil potong opsional sudah tersedia. Rekap SQL memakai `sum(piece_count)`, sehingga campuran baris terisi dan kosong dapat menghasilkan angka parsial tanpa penanda kelengkapan.
- Pengiriman saat ini mencatat kuantitas dalam satuan item penjualan, belum sepasang berat dan jumlah aktual.

## Prinsip yang diusulkan

Satu barang dapat mempunyai dua pengukuran fisik: berat aktual dan jumlah aktual. Harga mengikuti satu dasar tagihan yang dipilih. Kedua pengukuran menggambarkan barang yang sama, bukan dua persediaan yang boleh dijumlahkan atau dijual dua kali.

Berat per ekor/pcs berubah antarbarang dan penerimaan. Tidak ada konversi tetap kg menjadi ekor. Rasio rata-rata dapat membantu pengisian perkiraan dan usulan pergerakan stok buku. Nilai tersebut tidak dianggap hasil hitung fisik aktual. Satuan yang menjadi dasar tagihan menggunakan kuantitas yang disepakati, bukan diam-diam mengambil hasil perkiraan.

Definisi satuan jumlah mengikuti produk: ayam hidup/karkas dapat memakai ekor; bagian potongan dapat memakai pcs; ati-ampela dapat memakai set jika satu set memang satuan usaha yang disepakati. Jangan mengasumsikan satu pcs sama dengan satu set.

## Perilaku pengisian dan stok

| Mode produk | Data saat finalisasi | Perlakuan data lain |
| --- | --- | --- |
| Stok utama kg | Kg dengan sumber jelas; jika kebijakan mengizinkan, estimasi dikonfirmasi petugas | Ekor/pcs boleh kosong atau berupa estimasi berlabel |
| Stok utama jumlah | Jumlah dengan sumber jelas | Berat boleh kosong atau berupa estimasi berlabel; dasar biaya mengikuti konfigurasi produk |
| Kontrol ketat kg dan jumlah | Keduanya aktual sebelum finalisasi | Mode opsional untuk produk/proses yang memerlukan pengukuran lengkap |

Mode stok utama jumlah adalah kemampuan baru, bukan kemampuan yang sudah tersedia. Perubahan dasar stok dan HPP untuk produk yang sudah mempunyai transaksi memerlukan rekonsiliasi, bukan sekadar mengganti pilihan satuan.

Khusus penerimaan klien ini, kg boleh mengikuti dokumen supplier tanpa timbang ulang. Tandai sumbernya sebagai angka supplier dan belum ditimbang ulang, bukan hasil timbang aktual klien. Aturan ini tidak mewajibkan pengguna mengisi jumlah ekor yang memang tidak dihitung.

- Kosong berarti tidak diketahui; nol berarti sudah diperiksa dan memang tidak ada.
- Jika berat dan jumlah keduanya aktual, tampilkan rata-rata kg per ekor/pcs secara otomatis.
- Jika hanya salah satu tersedia, saran berdasarkan lot yang diketahui boleh ditampilkan sebagai perkiraan dan tetap dapat diubah. Untuk mode operasional yang mengizinkannya, petugas boleh mengonfirmasi pencatatan dengan pasangan estimasi. Jangan mengubah estimasi menjadi aktual secara otomatis.
- Rasio dari data dengan jumlah parsial tidak boleh diperlakukan sebagai rasio seluruh stok.
- Jika saldo jumlah diketahui tetapi barang keluar tanpa jumlah aktual, saldo jumlah berikutnya menjadi tidak lengkap. Jangan mempertahankan saldo lama seolah-olah masih akurat.
- Jumlah aktual yang menjadi kuantitas jual harus bilangan bulat untuk unit ekor/pcs/set. Pengukuran kg mengikuti presisi proyek.
- Pengurangan, retur, pembatalan, dan penggantian transaksi harus menjaga kedua ukuran secara atomik jika keduanya dikontrol. Periksa saldo di server dengan penguncian yang sesuai agar transaksi bersamaan tidak menjual stok dua kali.
- Data lama tidak dikonversi menggunakan rata-rata buatan. Mulai saldo jumlah dari hitung fisik yang diberi tanggal dan jejak koreksi.

## Konversi perkiraan untuk operasional

Kebutuhan pengguna mencakup pencatatan kematian cukup dalam ekor/pcs dan hasil potong yang kadang hanya ditimbang. Rancangan operasional perlu mengizinkan satu pengukuran diketahui dan pengukuran lainnya diusulkan sebagai estimasi yang dapat dikonfirmasi.

- Setiap ukuran memiliki sumber sendiri: ditimbang/dihitung, dokumen supplier, atau estimasi. Status bukan hanya satu label untuk seluruh baris.
- Utamakan rasio dari kelompok stok yang sedang digunakan dan memiliki pasangan ukuran yang diketahui. Jika belum tersedia, gunakan rasio produk/varian yang disetel usaha; jika tidak ada keduanya, jangan memaksakan konversi.
- Rasio dari banyak pasangan aktual dihitung sebagai total kg dibagi total jumlah pada data yang relevan dan lengkap, bukan rata-rata sederhana dari beberapa rasio. Jangan melatih ulang rasio menggunakan data estimasi hasil rumusnya sendiri.
- Rumus saran: estimasi kg = jumlah × kg per unit; estimasi jumlah = kg ÷ kg per unit. Pembulatan jumlah mengikuti satuan bulat dan tetap ditandai sebagai perkiraan.
- Contoh: rasio kelompok ayam hidup 2 kg/ekor, petugas mencatat mati 3 ekor. Sistem menyarankan pengurangan 6 kg dengan keterangan "3 ekor dihitung; 6 kg perkiraan dari 2 kg/ekor". Setelah dikonfirmasi, pergerakan buku mencatat kedua nilai dan kualitas sumbernya.
- Bila saldo awal jumlah merupakan estimasi, saldo jumlah setelah pengurangan aktual tetap tidak menjadi saldo aktual. Kelengkapan saldo harus mengikuti semua pergerakan yang membentuknya.
- Jika petugas kemudian menimbang ayam mati tersebut dan hasilnya 5,4 kg, koreksi kejadian yang sama: pengurangan kg berubah dari 6 menjadi 5,4, atau selisih 0,6 kg dikembalikan lewat koreksi tertaut. Jumlah mati tetap 3 ekor; jangan membuat kematian kedua. Dampak nilainya mengikuti mekanisme koreksi, tidak dibebankan dua kali.
- Simpan nilai rasio, sumber rasio, dan hasil pembulatan pada transaksi. Perubahan rasio produk di kemudian hari tidak boleh menghitung ulang transaksi lama.
- UI mengikuti ukuran yang diedit petugas: pasangan estimasi diperbarui selama belum diisi sebagai data diketahui. Dua nilai yang sudah diketahui tidak saling ditimpa oleh perhitungan otomatis; tampilkan rasionya sebagai informasi.
- Mode kontrol ketat tetap dapat melarang estimasi. Tidak perlu memaksakan mode ini pada semua produk.

Untuk hasil potong, setiap produk memiliki rasio sendiri. Ayam hidup, karkas, fillet, kaki, dan ati-ampela tidak berbagi satu angka kg/pcs. Jumlah hasil dapat disarankan dari resep jumlah bahan (misalnya satu karkas per ayam) hanya jika definisi produk dan prosesnya sesuai; hasil tetap berstatus estimasi sampai dihitung. Jumlah tiap produk tidak dijumlahkan menjadi jumlah ayam yang dipotong.

## Penerimaan dan kehilangan stok

Klarifikasi pengguna pada 9 November 2026 menggantikan asumsi awal tentang penimbangan ulang: jumlah pembelian mengikuti supplier, dibayar penuh tanpa toleransi, dan klien ini tidak menghitung atau menimbang ulang saat menerima. Contoh: dokumen supplier 1.000 kg menjadi dasar tagihan dan penerimaan stok tercatat 1.000 kg. Jumlah ekor tetap boleh tidak diketahui. Saldo tersebut merupakan saldo buku berdasarkan supplier, bukan bukti hitung fisik ulang.

Ayam mati dapat ditemukan saat bongkar maupun kemudian saat berada di kandang. Produk olahan di freezer juga dapat dibuang sesuai kebijakan usaha. Semuanya dicatat melalui kejadian kehilangan stok tersendiri pada tanggal diketahui/dibuang, tanpa mengubah transaksi pembelian dan tagihan supplier.

Alur yang diusulkan:

1. Terima stok berdasarkan dokumen supplier dan simpan sumber angka tersebut.
2. Catat kehilangan: produk, lokasi (misalnya kandang/freezer), tanggal, lot/penerimaan/hasil produksi jika diketahui, jumlah/berat yang diketahui, alasan, serta catatan/bukti bila ada.
3. Keluarkan stok yang hilang sekali dan catat nilai kerugian menggunakan nilai modal persediaan yang terkait; bukan harga jual. Pembatalan atau koreksi kejadian mengembalikan dampaknya secara konsisten.
4. Jangan membebankan lagi nilai yang sama melalui HPP barang yang tersisa atau mencatatnya sebagai pembayaran kas baru.

Contoh pergerakan yang semuanya tercatat dalam kg: masuk 1.000 kg; ditemukan mati 8 kg saat bongkar; mati lagi 4 kg di kandang; stok buku hidup menjadi 988 kg sebelum pemakaian/penjualan lain. Contoh terpisah: stok fillet di freezer 20 kg, dijual 15 kg, dibuang 5 kg; saldo menjadi nol, bukan penjualan 20 kg. Contoh tersebut mengandaikan berat kehilangan memang diketahui.

Jika hanya diketahui 3 ekor mati tetapi beratnya tidak ditimbang, catat fakta 3 ekor. Rasio yang tersedia boleh mengusulkan kg estimasi untuk dikonfirmasi sesuai mode produk; bila tidak ada rasio, kg tetap belum diketahui. Jangan mengeklaim saldo kg aktual telah pasti. Kehilangan yang sudah dicatat harus ikut direkonsiliasi saat opname agar tidak dibebankan dua kali.

Pisahkan alasan: mati saat bongkar, mati di kandang, olahan rusak/tidak layak, pembuangan karena melewati batas simpan internal, dan selisih hitung/timbang. Selisih hasil proses tetap mempunyai catatan proses sendiri dan tidak otomatis dianggap kematian.

Penyebutan tiga hari untuk barang freezer merupakan kebijakan operasional klien yang perlu dapat diatur per produk/lot. Tampilkan umur stok dan pengingat untuk ditinjau; jangan menghapus stok atau membukukan kerugian otomatis hanya karena umur tersebut terlewati. Pembuangan memerlukan kejadian nyata yang dicatat petugas.

## Pengolahan dan penjualan

- Catat bahan dan hasil nyata per produk: misalnya bahan 24 ekor/48 kg menjadi beberapa produk hasil dengan berat dan jumlah masing-masing jika dihitung.
- Jangan menjumlahkan jumlah karkas, kepala, kaki, dan ati-ampela sebagai jumlah ayam baru. Satu ayam menghasilkan beberapa jenis produk.
- Jangan mencatat karkas utuh sekaligus bagian yang sudah diambil darinya sebagai dua hasil yang sama-sama tersedia penuh.
- Resep hasil seperti perkiraan jumlah kaki atau set jeroan boleh menyarankan isian. Jumlah yang ditolak, rusak, atau tidak terkumpul tetap mengikuti kenyataan.
- Penjualan per kg boleh memiliki jumlah ekor/pcs pendamping. Penjualan per jumlah boleh memiliki berat aktual pendamping sesuai mode produk. Total dihitung sekali dari satuan harga, bukan dari kedua ukuran.
- Invoice, SJ, dan struk memakai data transaksi yang sama. Tampilkan kedua ukuran bila tersedia; SJ tetap menyembunyikan harga. Data perkiraan harus dikenali sebagai perkiraan.
- Pengiriman parsial dan retur harus membawa kedua ukuran aktual jika tersedia dan tidak boleh melampaui sisa pengiriman/penjualan pada salah satu ukuran yang dikontrol.

## Urutan implementasi

1. Tetapkan definisi ekor/pcs/set dan mode stok per produk. Penerimaan klien ini mengikuti dokumen supplier tanpa timbang ulang; kehilangan saat bongkar/kandang/freezer menjadi kejadian tersendiri dan tidak mengurangi hutang supplier.
2. Tambahkan model pengukuran dengan sumber angka dan penanda kelengkapan, pergerakan jumlah, kejadian kehilangan stok, serta validasi server untuk penerimaan, produksi, penjualan, pengiriman, retur, dan koreksi.
3. Rekonsiliasi saldo awal jumlah aktual; pertahankan riwayat kg dan transaksi lama.
4. Sesuaikan form agar kolom pendamping muncul sesuai produk; tambahkan saran rasio dan penanda perkiraan.
5. Sesuaikan stok, rekap, invoice, SJ, dan struk; uji alur lengkap sebelum rilis.

Pengujian utama: penerimaan berdasarkan supplier tanpa hitung ulang, sebagian data jumlah kosong, transaksi paralel, kehilangan saat bongkar/kandang/freezer, kehilangan dengan hanya jumlah yang diketahui, opname setelah kehilangan, pencegahan penghapusan otomatis berdasarkan umur, harga per kg versus per jumlah, retur parsial/penuh, pembatalan, dan pengolahan beberapa produk dari satu bahan.

## Rujukan

- [Infor M3 — Catch Weight Management](https://docs.infor.com/m3udi/2026.10/en-us/m3beud/scexechs/mms360.html): dua satuan sejajar dengan hubungan yang berubah; berat aktual untuk penilaian; saran berat dapat diubah dalam produksi.
- [Cobb — Processing Management Guide, bagian Catching, Transport, and Live Receiving](https://www.cobbgenetics.com/assets/Cobb-Files/Processing-Guide-8-15-2025.pdf): dokumentasi kematian selama transportasi dan pemantauan susut berat sebagai aspek penerimaan yang berbeda.
