# PRD — Sistem Usaha Potong Ayam Pak Dasep

**Versi:** 1.2 — mulai dari nol, Supabase Cloud tanpa Docker — 29 Oktober 2026  
**Status:** Draft produk untuk konfirmasi operasional; bukan spesifikasi final seluruh rumus akuntansi  
**Platform:** Web app mobile-first (responsif di laptop)  
**Teknologi:** Next.js App Router, TypeScript, Supabase Cloud (Postgres + Auth + RLS)  
**Pengembangan:** Proyek baru dari nol; Next.js lokal terhubung langsung ke Supabase Cloud; tanpa Docker dan tanpa Supabase lokal  
**Prinsip:** Sesimpel mungkin di layar, akurat di belakang layar.

## 1. Ringkasan produk

Aplikasi internal untuk mencatat aliran ayam, uang, dan kewajiban dalam usaha potong ayam: mulai dari DO pembelian di supplier/kandang, timbang aktual saat diterima, proses penyembelihan dan pemotongan, stok hasil produksi, penjualan, pengiriman, pembayaran, penagihan, sampai ringkasan kondisi usaha.

Konteks bisnis awal: pembelian ayam hidup sekitar **2–5 ton per hari**; pengolahan sendiri; penjualan ayam hidup, karkas, dan berbagai bagian ayam kepada pembeli perorangan, pedagang, restoran, serta dapur MBG. Pembelian dan penjualan bisa tunai ataupun tempo. Ada sopir dan penagih. Sebagian barang hasil potong disimpan di freezer untuk dijual berikutnya.

Aplikasi **bukan ERP kompleks**. Karyawan cukup mencatat kejadian yang benar-benar terjadi. Sistem menghitung saldo, stok, selisih, hutang, piutang, dan ringkasan secara otomatis.

## 2. Sasaran dan batasan

### Sasaran utama

1. Mencatat **ayam masuk → hasil potong → ayam keluar** tanpa kehilangan jejak perubahan berat atau produk.
2. Mengetahui **siapa membeli/menjual kepada siapa**, berapa jumlahnya, berapa nilainya, dan berapa yang belum dibayar.
3. Mengetahui posisi **kas, rekening bank, dan uang tunai yang masih dibawa penagih**.
4. Memisahkan uang dari penjualan, modal, pinjaman, penjualan aset, dan transfer antarakun secara benar.
5. Menyediakan tampilan HP yang sederhana, cepat, dan konsisten.

### Bukan sasaran versi awal

GPS/rute sopir, integrasi timbangan elektronik, bank otomatis, akuntansi pajak otomatis, absensi, multi-cabang/multi-gudang, barcode, inventaris ayam per ekor, integrasi WhatsApp, dan analisis AI generatif. Semua itu tidak boleh menjadi prasyarat pencatatan transaksi harian.

## 3. Prinsip pengalaman pengguna

- **Mobile-first**: aktivitas paling sering dapat dijalankan di HP; laptop menggunakan pola yang sama dengan ruang lebih luas.
- **Sedikit klik**: gunakan data terakhir/default yang relevan, isi otomatis tanggal dan nomor, hitung nominal otomatis, dan tampilkan kolom lanjutan hanya saat diperlukan.
- **Satu sumber transaksi**: penjualan tidak perlu diinput lagi ke buku kas, piutang, maupun laporan; modul lain membaca kejadian yang sama.
- **Draft → Final**: data dapat diperbaiki saat draft; setelah final perubahan berisiko melalui pembatalan/koreksi yang tercatat.
- **UI baru yang konsisten**: bangun fondasi desain baru yang minimalis modern, rounded, dan memiliki transisi halus. Setelah fondasi UI proyek baru disetujui, gunakan kembali komponen, token, dan pola interaksinya untuk semua modul; perubahan desain hanya jika diminta.
- **Bahasa Indonesia**: `Rp1.250.000`, `1.250,5 kg`, tanggal `29 Oktober 2026`, zona waktu tampilan `Asia/Jakarta`.
- **Desain status jelas**: `Draft`, `Menunggu`, `Sebagian`, `Lunas`, `Selisih`, `Selesai`; jangan hanya mengandalkan warna.
- **Akses berbasis peran**: pengguna lapangan hanya melihat menu yang relevan.

### Navigasi ringkas yang disarankan

Di HP, bottom navigation maksimal lima tujuan: **Beranda, Penjualan, Pembelian, Keuangan, Lainnya**. Dalam **Lainnya**: Riwayat, Produk & Stok, Mitra, Hutang/Piutang, SDM, Akuntansi, Analisis Usaha, Pengaturan. Aksi tambah transaksi terlihat jelas dari halaman terkait. Ini usulan navigasi untuk proyek baru; detailnya ditetapkan bersama fondasi UI baru.

## 4. Prioritas rilis

| Prioritas | Isi | Alasan |
|---|---|---|
| **P0 — Operasional inti** | Login/peran, dashboard ringkas, mitra, produk, DO/penerimaan, produksi & stok, penjualan, riwayat, hutang-piutang, pembayaran parsial, kas/bank, buku keuangan dasar, setoran penagih, audit dasar | Menutup alur usaha harian dan risiko uang/stok |
| **P1 — Pengelolaan usaha** | Kategori keuangan lengkap, aset tetap, penggajian & kasbon, laporan laba rugi dan neraca dengan prasyarat data terpenuhi, analisis usaha berbasis aturan, ekspor, lampiran bukti, pengingat jatuh tempo | Membantu keputusan pemilik sesudah data operasional stabil |
| **P2 — Pengembangan** | Integrasi perangkat, otomatisasi lanjutan, laporan biaya per produk yang lebih detail, multi-lokasi, absensi, notifikasi otomatis, fitur kepatuhan pajak | Tidak menghambat pengoperasian awal |

**Catatan penting:** seluruh modul yang diminta tercakup dalam produk, tetapi tidak harus seluruhnya kompleks sejak hari pertama. Dasar pencatatan uang/stok harus dirancang sejak P0 agar laporan P1 tidak memerlukan input ulang.

## 5. Alur bisnis ujung ke ujung

### 5.1 Pembelian ayam hidup melalui DO

1. Admin membuat **DO**: tanggal otomatis, supplier, kandang/lokasi asal (opsional), produk `Ayam Hidup`, perkiraan ekor/berat bila ada, harga dan satuan kesepakatan (`kg`, `ekor`, atau `borongan`).
2. Ayam diambil/diangkut. Data sopir dan kendaraan boleh dicatat bila relevan; tidak wajib mengisi semua detail setiap transaksi.
3. Ketika tiba, petugas penerima mengisi **berat netto aktual** hasil timbang. Tampilan dasar hanya meminta angka netto; panel rincian opsional untuk bruto, tara, foto/bukti, dan catatan bila dibutuhkan.
4. Sistem menampilkan **selisih berat dari laporan asal** dalam kg dan persentase. Selisih adalah temuan untuk ditinjau, **bukan otomatis bukti kecurangan** (bisa disebabkan tara, susut perjalanan, perbedaan alat, dan faktor lain).
5. Pengguna berwenang mengonfirmasi penerimaan. **Stok ayam hidup bertambah berdasarkan netto aktual yang diterima**, bukan angka DO.
6. **Nilai tagihan supplier** memakai dasar yang **disepakati**, yang disimpan terpisah: berat asal, berat aktual, dan berat/dasar penagihan. Jika harga per ekor atau borongan, nilai mengikuti metode terkait. Hutang muncul setelah pembelian final; bila lunas langsung, ada pencatatan pembayaran tersendiri.

Aturan: **DO draft/telah dibuat tidak menambah stok atau hutang**. Satu DO boleh memiliki lebih dari satu penerimaan bila memang ada beberapa kendaraan/pengiriman; layar harian tetap menampilkan satu ringkasan DO.

### 5.2 Produksi/pemotongan

1. Petugas memilih **Catat Hasil Potong** dan mengisi berat ayam hidup yang diproses.
2. Petugas memasukkan **hasil timbang nyata** per produk: karkas utuh, dada, paha, sayap, fillet, ceker, kepala, jeroan, dan produk lain sesuai katalog.
3. Sistem mengurangi stok bahan/input dan menambah stok masing-masing produk hasil.
4. Sistem menghitung selisih/susut produksi; tidak memakai persentase hasil baku sebagai angka stok.
5. Sisa hasil potong yang belum terjual otomatis tetap menjadi stok (termasuk stok dalam freezer). Lokasi freezer dapat menjadi catatan sederhana, bukan multi-gudang rumit.

Jika karkas utuh kemudian difillet/dipotong lagi, gunakan **proses konversi kedua**: kurangi stok karkas dan tambahkan bagian hasilnya. **Jangan mencatat karkas utuh dan seluruh potongannya sebagai stok yang sama-sama tersedia**. Penjualan ayam hidup langsung bisa mengambil stok ayam hidup tanpa proses potong.

### 5.3 Penjualan, pengiriman, dan retur

1. Admin memilih pelanggan (`Pelanggan Umum` tersedia untuk eceran), produk/varian ukuran, kuantitas dan satuan (`kg`, `ekor`, `pcs` sesuai produk), harga satuan yang boleh mengikuti kesepakatan pelanggan.
2. Tambahkan lebih dari satu item per transaksi; sistem menghitung total, diskon bila ada, dan status pembayaran `Tunai`, `Sebagian`, atau `Tempo`.
3. Saat **Selesaikan Penjualan**, sistem memfinalkan nilai jual, mengeluarkan stok yang dijual, membuat piutang sebesar bagian yang belum dibayar, dan mencatat kas/bank **hanya untuk pembayaran yang benar-benar diterima**.
4. Untuk pengiriman, penjualan dapat memiliki sopir/surat jalan sederhana. Catat jumlah dikirim dan konfirmasi jumlah diterima; kekurangan, penolakan, atau retur ditindaklanjuti sebagai koreksi/retur, bukan menghapus histori.
5. Bila satuan jual adalah `ekor` atau `pcs`, aplikasi menyimpan satuan dan jumlah sesuai produk. Berat kg dicatat ketika benar-benar ditimbang; jangan mengonversi memakai asumsi berat rata-rata secara diam-diam.

**Kebijakan default untuk P0:** transaksi penjualan final sekaligus membukukan pengeluaran stok; pengiriman menjadi pelacakan realisasi dan selisih. Jika operasional membutuhkan penjualan dibukukan baru setelah penerimaan pelanggan, kebijakan ini harus diputuskan **sebelum** modul penjualan diprogram.

### 5.4 Pembayaran, penagihan, dan setoran

- Penjualan tempo membuat **piutang**; pembayaran pelanggan berikutnya mengurangi piutang.
- Pembelian tempo membuat **hutang**; pembayaran ke supplier mengurangi hutang.
- Pembayaran parsial dapat berkali-kali dan selalu dialokasikan ke dokumen transaksi tertentu.
- Pembayaran langsung ke rekening/kas perusahaan menambah saldo akun tersebut.
- Jika uang tunai diterima penagih, pembayaran pelanggan dicatat pada **Kas Penagih** (kas dalam penguasaan penagih), bukan langsung menjadi Kas Kantor.
- Saat penagih menyerahkan uang, buat **Setoran**; status `Menunggu Verifikasi`. Pemilik/admin lain yang menerima uang memverifikasi; baru setelah itu saldo Kas Penagih berkurang dan Kas Kantor/Bank bertambah.
- **Penagih dilarang memverifikasi setorannya sendiri**. Setoran parsial dan sisa uang dipegang penagih tetap terlihat.
- Transfer antarakun bukan pendapatan baru; pelunasan piutang tidak menciptakan pendapatan penjualan kedua kali.

### 5.5 Buku keuangan dan laporan

Seluruh pembayaran dari pembelian/penjualan masuk ke buku pergerakan kas/bank otomatis. Pengguna **hanya menambah transaksi manual** untuk kejadian yang belum tercatat di modul lain: biaya listrik, modal masuk, pinjaman, pembelian aset, biaya lain, penjualan aset, penarikan owner, dan sejenisnya.

Alur ini menjadi dasar laporan saldo, hutang/piutang, laba rugi, neraca, dan analisis usaha. Laporan yang butuh HPP, penyusutan, atau saldo awal harus menunjukkan status **Belum lengkap/Estimasi** sampai aturan dan data pendukung disahkan.

## 6. Persyaratan per modul

### M01 — Dashboard (P0)

- Pilihan periode: Hari Ini, Kemarin, 7 Hari, Bulan Ini, dan rentang tanggal.
- Kartu ringkas: penjualan, pembelian, kas/bank, piutang, hutang, stok, uang di penagih; definisi total harus jelas agar penjualan tempo tidak disalahartikan sebagai kas.
- Daftar perhatian: DO belum ditimbang, selisih timbang belum ditinjau, setoran belum diverifikasi, pembayaran jatuh tempo, stok minus/selisih.
- Aksi cepat: `Penjualan Baru`, `DO Baru`, `Hasil Potong`, `Catat Kas`.

### M02 — Penjualan (P0)

- Penjualan langsung atau tempo, pelanggan umum/B2B, banyak item, produk dan ukuran, satuan fleksibel, harga disesuaikan transaksi.
- Pembayaran awal/tunai/sebagian; diskon jika diperlukan; pengiriman dan retur sederhana.
- Status: `Draft`, `Selesai`, `Sebagian Dibayar`, `Lunas`, `Dikoreksi/Diretur` (status pembayaran dan pengiriman dapat ditampilkan terpisah agar tidak rancu).
- Cetak/bagikan nota sederhana dapat menyusul P1 jika waktu terbatas.

### M03 — Pembelian (P0)

- DO supplier, sumber kandang, estimasi, harga dan satuan pembelian.
- Penerimaan timbang netto aktual, selisih, dasar tagihan terpisah, konfirmasi final.
- Mendukung tunai/tempo/cicilan dan beberapa penerimaan dari satu DO bila diperlukan.
- Hanya penerimaan final yang memengaruhi stok; tagihan final mengikuti kesepakatan pembelian.

### M04 — Riwayat (P0)

- Dua tab **Penjualan** dan **Pembelian**, tidak mencampurkan transaksi keduanya.
- Pencarian, filter periode, mitra, status pembayaran, detail dokumen dan histori koreksi.
- Buka detail untuk melihat item, pembayaran terkait, pengiriman/penerimaan terkait, pengguna dan waktu.

### M05 — Produk & Stok (P0)

- Katalog produk dan varian ukuran: `Ayam Hidup`, `Karkas`, `Dada`, `Paha`, `Sayap`, `Fillet`, `Ceker`, `Kepala`, `Jeroan`, dan produk lain yang dapat ditambahkan admin.
- Produk dapat menggunakan satuan jual yang relevan: kg/ekor/pcs; jangan memaksa semua produk memiliki varian.
- Saldo stok berasal dari penerimaan, hasil produksi/konversi, penjualan, retur, dan penyesuaian beralasan.
- Lihat stok saat ini, riwayat gerakan, stok sedikit/negatif, dan stok beku/sisa jika dibutuhkan.
- Tidak boleh ada stok ganda atau pengurangan stok dua kali untuk transaksi yang sama.

### M06 — Buku Keuangan (P0 dasar; P1 lengkap)

- Satu halaman arus uang dengan filter periode, akun, kategori, jenis transaksi, dan pencarian.
- Tombol `Pemasukan`, `Pengeluaran`, `Transfer`, dan `Penyesuaian` (penyesuaian dibatasi).
- Satu transaksi manual minimal memuat tanggal, akun sumber/tujuan, nominal, kategori, keterangan; mitra dan bukti opsional.
- Transaksi otomatis dari penjualan/pembelian/pembayaran terlihat, **tidak diinput ulang**.
- Saldo Kas Kantor, rekening bank, dan Kas Penagih dipisah; pembukuan transfer tidak mengubah total aset kas gabungan.
- Saldo awal kas/bank dicatat di buku keuangan, bukan melalui modul terpisah, dan tidak diperlakukan sebagai pendapatan usaha.
- Kategori dapat ditambah/dinonaktifkan oleh admin tanpa mengubah sifat akuntansi historis.

#### Kategori standar buku keuangan

| Kelompok | Subkategori/contoh | Sifat pencatatan |
|---|---|---|
| **Pendapatan usaha** | Penjualan ayam hidup/karkas/olahan | Pendapatan penjualan; kas bertambah hanya jika dibayar |
| **Pendapatan lain** | Pendapatan non-ayam; keuntungan penjualan aset | Pendapatan lain sesuai substansi, bukan modal/pinjaman |
| **Modal & pendanaan** | Setoran modal pemilik, pinjaman usaha, hibah | Modal/pinjaman/pendapatan hibah **dibedakan** menurut substansinya; tidak otomatis omzet |
| **HPP / biaya langsung** | Pembelian ayam yang terpakai, plastik/kemasan, bahan langsung terkait produksi | Diperhitungkan sebagai HPP saat konsumsi/penjualan menurut kebijakan yang disetujui; pembelian stok tidak otomatis seluruhnya HPP hari itu |
| **OPEX tetap** | Sewa, gaji pokok, Wi-Fi, keamanan, kebersihan, asuransi, software | Beban operasional; beberapa dapat dibayar di muka |
| **OPEX variabel** | Upah harian, lembur, komisi, bonus, ongkir, listrik/air, iklan, perlengkapan kantor, perawatan | Beban operasional sesuai periode/aktivitas |
| **Biaya finansial & admin** | Admin bank/transfer, bunga pinjaman | Beban finansial/admin; **cicilan pokok pinjaman** mengurangi hutang, bukan beban bunga |
| **Pajak & legalitas** | Pajak, perizinan, sertifikasi | Kategori terpisah; perlakuan spesifik memerlukan validasi kebijakan perpajakan/akuntansi |
| **CAPEX / aset tetap** | Mesin potong, freezer, kendaraan, peralatan jangka panjang | Menambah aset tetap, bukan langsung seluruhnya beban operasional |
| **Pribadi pemilik** | Pengambilan uang usaha oleh owner | Prive/pengambilan pemilik, **bukan biaya usaha** |
| **Pengeluaran lain** | Ojek, pengeluaran insidental, biaya di luar kategori | Wajib keterangan; klasifikasi operasional/pribadi harus dipilih |
| **Perpindahan dana** | Transfer kas ke bank, Kas Penagih ke Kas Kantor | Transfer antarakun, **bukan pemasukan/pendapatan** |

**Penting:** Penjualan aset lama dicatat sebagai pengurangan aset dan hasil penjualan; laba/ruginya bukan otomatis seluruh nilai kas masuk. Hibah perlu diklasifikasi sesuai kondisi sebenarnya. Kasbon karyawan adalah piutang karyawan sampai dipotong/dikembalikan. Pengeluaran manual tidak boleh menduplikasi jurnal dari modul penggajian atau pembelian.

### M07 — Akuntansi (P0 saldo; P1 laporan)

- **Posisi Saldo**: saldo awal, arus masuk, arus keluar, saldo akhir tiap kas/bank/Kas Penagih.
- **Piutang & Hutang**: total dan rincian jatuh tempo yang berasal dari transaksi.
- **Laporan Laba Rugi (P1)**: penjualan, HPP, laba kotor, biaya operasional, pendapatan/biaya lain, laba/rugi periode. Angka tidak boleh diperlakukan final bila HPP/biaya belum lengkap.
- **Neraca (P1)**: aset kas/bank, piutang, persediaan, aset tetap (dan akumulasi penyusutan bila diterapkan); kewajiban hutang supplier/pinjaman; ekuitas termasuk modal dan prive.
- **Persyaratan P1**: saldo awal tervalidasi, metode nilai persediaan/HPP, kebijakan biaya langsung dan penyusutan, serta pencatatan koreksi sudah ditetapkan. Tanpa itu tampilkan `Estimasi/Belum lengkap` secara eksplisit.
- Buku transaksi/jurnal konsisten menjadi sumber perhitungan; laporan bukan tempat input transaksi tersendiri.

### M08 — Finance / Analisis Usaha (P1)

Modul **baca & rekomendasi**, bukan modul transaksi.

- Ringkasan penjualan vs pembelian, tren kas, piutang terlambat, hutang jatuh tempo, sisa stok, dan selisih timbang/produksi.
- Peringatan berbasis aturan yang dapat dijelaskan, contoh: `Piutang lewat jatuh tempo naik`, `Uang tunai penagih belum disetor`, `Pembelian tinggi sementara penjualan turun`, `Saldo kas berpotensi tidak cukup membayar tagihan 7 hari`.
- Saran bersifat indikatif dan menampilkan data dasar/periode, bukan keputusan otomatis.
- Jangan mengklaim laba bersih akurat bila valuasi persediaan/HPP belum lengkap; jangan menyebut setiap selisih sebagai kecurangan.

### M09 — Mitra (P0)

- Satu daftar kontak dengan peran `Supplier`, `Pelanggan`, atau `Keduanya`.
- Nama, nomor telepon, alamat, catatan, harga khusus opsional; bisa dinonaktifkan tanpa menghapus riwayat. Pembayaran fleksibel tanpa termin standar per mitra.
- Pelanggan umum/eceran tersedia sebagai default.

### M10 — AR/AP — Piutang & Hutang (P0)

- Piutang otomatis dari penjualan final belum lunas; hutang otomatis dari pembelian final belum lunas.
- Daftar per mitra, dokumen, jatuh tempo, total, sudah dibayar, sisa.
- Catat cicilan, koreksi/retur, dan riwayat pelunasan; status `Belum Bayar`, `Sebagian`, `Lunas`, `Lewat Tempo`.
- Satu pembayaran terkait jelas dengan dokumen sumber. Tidak boleh menyimpan pembayaran melebihi sisa tanpa proses kelebihan bayar yang resmi (ditunda P1).

### M11 — SDM (P1)

- Data dasar pekerja: nama, peran, status tetap/harian/borongan, catatan tarif gaji bila dibutuhkan.
- Pencatatan penggajian sederhana: periode, komponen gaji/upah/lembur/bonus/potongan, nominal dibayar, akun pembayaran, histori.
- **Kasbon**: tanggal, nilai, sisa, cicilan/potong gaji atau pembayaran langsung; kasbon bukan biaya gaji kedua kali.
- Tidak termasuk sistem absensi, BPJS, perhitungan pajak gaji otomatis, approval berlapis, atau payroll kompleks P0.

### M12 — Pengaturan (P0 dasar; P1 tambahan)

- Identitas usaha, logo, kontak, mata uang Rupiah, zona waktu, preferensi nota.
- Pengguna, peran, hak akses, rekening/kas, kategori buku keuangan, satuan dan produk dasar.
- Saldo awal kas/bank dicatat melalui buku keuangan. Tidak ada input stok awal terpisah; hutang dan piutang dicatat melalui transaksi pembelian dan penjualan dengan tanggal masing-masing.
- Pengaturan kebijakan harga, stok dan koreksi dibatasi pada pemilik/admin berwenang.

## 7. Peran dan otorisasi

| Peran | Kemampuan utama | Batasan wajib |
|---|---|---|
| **Owner** | Semua ringkasan, pengaturan, persetujuan koreksi/selisih, verifikasi setoran | Semua keputusan material tercatat |
| **Admin** | DO, penerimaan, transaksi, pembayaran, mitra, laporan sesuai izin | Tidak menyembunyikan jejak koreksi; tidak memverifikasi transaksi uang sendiri jika ada konflik peran |
| **Petugas produksi** | Lihat stok terkait, catat hasil timbang dan hasil potong | Tidak mengubah harga/tagihan atau saldo uang |
| **Sopir** | Lihat tugas, catat pengiriman/terima dan ketidaksesuaian | Tidak mengubah DO, berat penerimaan yang dikonfirmasi pihak penerima, atau jumlah tagihan |
| **Penagih** | Lihat tagihan yang ditugaskan, catat penerimaan, ajukan setoran | Tidak memverifikasi setoran sendiri atau mengedit hutang/piutang secara bebas |

Satu orang dapat merangkap peran dalam usaha kecil, tetapi **aksi uang sensitif** tetap memerlukan verifikator berbeda atau owner. Peran spesifik diatur sesuai jumlah karyawan nyata, tanpa memaksa banyak akun yang tidak diperlukan.

## 8. Aturan data dan perhitungan inti

1. **Stok** adalah penjumlahan gerakan stok final, bukan angka bebas yang bisa diketik ulang. Penyesuaian perlu alasan, pengguna, dan persetujuan sesuai hak akses.
2. **Kas/bank** adalah penjumlahan gerakan keuangan terverifikasi per akun. Saldo tidak sama dengan omzet; piutang bukan kas.
3. **Tagihan** berkurang hanya oleh pembayaran sah, retur/koreksi resmi, atau penyelesaian lain yang disetujui.
4. **DO** tidak memposting stok atau hutang. **Penerimaan final** memposting stok aktual dan kewajiban berdasarkan perjanjian.
5. **Produksi** adalah perpindahan/konversi kuantitas antarproduk dengan keluaran nyata dan selisih yang dapat dilihat.
6. **Penjualan final** memposting stok keluar dan piutang/nilai jual secara konsisten. Pembayaran dicatat hanya saat benar-benar diterima.
7. **Setoran penagih** memindahkan kas di antara pemegang setelah diverifikasi; tidak menciptakan pendapatan lagi.
8. Modal, pinjaman, hasil penjualan aset, pengeluaran pribadi pemilik, CAPEX dan biaya usaha tidak boleh disatukan menjadi pendapatan/beban biasa.
9. Transaksi final tidak dihapus fisik; koreksi dilakukan dengan pembalikan/penyesuaian terhubung, menyimpan pengguna, waktu, alasan dan dokumen awal.
10. Nominal mata uang memakai tipe presisi tetap (bukan floating-point), kuantitas kg mendukung desimal; waktu disimpan konsisten dan diformat Indonesia saat ditampilkan.

## 9. Rancangan konseptual data (belum skema SQL)

Kelompok data minimal:

- **Akses & master**: `profiles/roles`, `business_settings`, `partners`, `products`, `product_variants`, `units`, `cash_accounts`, `finance_categories`.
- **Pembelian**: `purchase_dos`, `purchase_receipts`, `purchase_receipt_items`, `supplier_bills` (atau kewajiban yang terkait dokumen final).
- **Produksi & stok**: `production_batches`, `production_outputs`, `stock_movements`, `stock_adjustments`.
- **Penjualan**: `sales`, `sale_items`, `deliveries`, `sale_returns`.
- **Uang & kewajiban**: `payments`, `payment_allocations`, `cash_movements`, `collector_deposits`, `opening_balances`; struktur jurnal berpasangan disiapkan sebagai fondasi jika laporan akuntansi P1 akan dinyatakan formal.
- **Pengembangan SDM & aset**: `employees`, `payroll_runs`, `employee_advances`, `fixed_assets`.
- **Audit**: `audit_events` dan status dokumen unik.

Nama tabel final perlu dirancang bersama aturan posting, bukan dibuat sekaligus tanpa kebutuhan. Hindari tabel saldo ganda yang bisa menyimpang dari sumber transaksi. Simpan snapshot ringkasan/materialized view hanya bila ada alasan kinerja dan mekanisme rekonsiliasi.

## 10. Teknis, keamanan, dan kualitas

### 10.1 Fondasi proyek baru dan lingkungan pengembangan

- **Mulai dari nol**: buat struktur aplikasi, skema database, migrasi SQL, autentikasi, hak akses, dan fondasi UI baru berdasarkan PRD ini. Status task, implementasi, skema, dan persetujuan UI dari proyek sebelumnya tidak otomatis berlaku.
- **Supabase Cloud langsung**: gunakan project Supabase Cloud yang ditetapkan untuk aplikasi baru. Next.js dijalankan lokal dengan Node.js dan terhubung ke layanan cloud tersebut.
- **Tanpa Docker**: tidak membuat Dockerfile, Docker Compose, container, database Postgres lokal, atau Supabase lokal. Perintah `supabase start` dan instalasi Docker tidak menjadi bagian setup, pengujian, maupun prasyarat pengerjaan.
- **Setup sederhana**: install dependency aplikasi, isi `.env.local` dengan konfigurasi Supabase Cloud, terapkan migrasi SQL ke project cloud yang dituju, lalu jalankan development server Next.js. Simpan `.env.example` tanpa nilai rahasia; jangan commit `.env.local`.
- **Migrasi tetap tercatat**: simpan setiap perubahan skema, fungsi, dan RLS sebagai file SQL berurutan dalam repositori; terapkan melalui Supabase SQL Editor atau alat remote yang tersedia. Supabase CLI tidak wajib dan tidak boleh menjadi alasan mewajibkan Docker.
- **Project tujuan harus jelas** sebelum menerapkan migrasi. Memulai kode dari nol tidak berarti menghapus atau mereset database/proyek lama; tindakan tersebut memerlukan instruksi eksplisit terpisah.

### 10.2 Keamanan dan validasi

- Next.js App Router dan TypeScript; satu aplikasi responsif, bukan aplikasi HP dan desktop terpisah.
- Supabase Auth untuk login tertutup (tanpa pendaftaran publik), Postgres sebagai sumber data, **RLS default deny** dan policy per peran/operasi. Secrets dan service-role key tidak diekspos di browser.
- Validasi sisi server untuk semua perubahan stok, uang, status, dan akses; tidak bergantung pada UI untuk otorisasi.
- Posting final **atomik dan idempoten**: satu klik/permintaan hanya menghasilkan satu dampak stok dan kas/piutang/hutang, sekalipun pengguna mengetuk dua kali atau jaringan mengulang request.
- Input cepat di jaringan HP; skeleton/loading, keadaan kosong, kesalahan yang bisa dipahami, dan notifikasi selesai. Kurangi gerak untuk pengguna yang memilih reduced motion.
- Filter periode tersedia konsisten di dashboard, riwayat, laporan, dan keuangan. Angka dengan pemisah ribuan titik, desimal koma, tanggal panjang Indonesia.
- Backup dan prosedur restore, log audit perubahan sensitif, serta uji role positif/negatif wajib ditinjau sebelum produksi.
- Ikuti pola `Understand → Plan → Code → Validate → Stop`; tidak commit otomatis; review browser/visual hanya jika diminta. Uji relevan (typecheck, lint, build, tes aturan transaksi) dilaporkan jujur.

## 11. Kriteria penerimaan (UAT) awal

1. DO dibuat tetapi **stok dan hutang belum berubah**.
2. DO mencantumkan 1.000 kg asal, diterima 980 kg; aplikasi menampilkan **selisih −20 kg** dan menambah stok **980 kg** sesudah final; nilai tagihan mengikuti dasar pembelian yang disepakati.
3. DO yang satu dikirim dua kendaraan dapat diselesaikan dengan dua catatan penerimaan tanpa duplikasi stok.
4. Produksi memakai 500 kg ayam hidup dan mencatat beberapa jenis hasil aktual; stok hidup turun 500 kg, stok hasil naik masing-masing; selisih terlihat.
5. Karkas yang dipotong ulang tidak menyebabkan karkas dan fillet tersedia ganda.
6. Penjualan 100 kg tempo membuat stok turun 100 kg dan piutang bertambah sesuai nilai jual, tetapi **kas tetap**.
7. Pelanggan membayar sebagian lalu melunasi; piutang turun bertahap dan tidak ada penggandaan penjualan.
8. Penagih menerima Rp5.000.000 tetapi baru menyetor Rp3.000.000; sisa Rp2.000.000 tetap terlihat di Kas Penagih; penagih tak dapat memverifikasi setorannya sendiri.
9. Supplier dibayar dua kali untuk satu tagihan; sisa hutang dan kas benar serta tidak ada pembayaran ganda.
10. Modal masuk Rp20.000.000 meningkatkan kas dan ekuitas, bukan omzet penjualan; pinjaman usaha meningkatkan kas dan hutang, bukan laba.
11. Transfer Rp2.000.000 dari Kas Kantor ke Bank tidak mengubah total kas+bank.
12. Owner mengambil Rp500.000 untuk pribadi; kas turun, tetapi biaya operasional tidak bertambah.
13. Pembelian freezer dicatat sebagai aset tetap, dan pembayaran angsuran pinjaman memisahkan pokok dari bunga.
14. Dua kali klik tombol final, refresh, atau request paralel tidak membuat stok atau uang terposting dua kali.
15. Riwayat dan dashboard memakai rentang tanggal yang sama menghasilkan total yang konsisten; pengguna peran lapangan tidak dapat membuka data/aksi di luar kewenangannya.
16. Laporan laba rugi/neraca **tidak dinyatakan final** ketika saldo awal, HPP atau valuasi persediaan belum dikonfigurasi.

## 12. Keputusan yang perlu dikunci sebelum implementasi modul terkait

| Keputusan | Usulan awal paling sederhana | Kapan perlu dikunci |
|---|---|---|
| Penjualan/pengiriman | Final penjualan langsung keluarkan stok; selisih kemudian sebagai retur/koreksi | Sebelum M02 |
| Penjualan ayam dengan satuan ekor/pcs | Simpan jumlah satuan; kg hanya jika ditimbang aktual, tanpa konversi otomatis | Sebelum M02/M05 |
| Nilai HPP dan persediaan | Mulai dengan jumlah stok aktual; metode valuasi/HPP disepakati sebelum laba rugi/neraca final | Sebelum M07 P1 |
| Pencatatan saat mulai memakai sistem | Saldo awal kas/bank di buku keuangan; hutang/piutang melalui pembelian/penjualan bertanggal; tanpa modul atau input stok awal tersendiri | Sebelum go-live |
| Struktur gaji & kasbon | Periode manual, komponen sederhana, kasbon dikurangkan saat pembayaran gaji | Sebelum M11 P1 |
| Pengiriman dan penagihan | SOP siapa mencatat bukti barang diterima, pembayaran diterima, dan siapa memverifikasi setoran | Sebelum fitur lapangan aktif |

Keputusan pembelian yang **sudah disepakati**: harga supplier fleksibel per kg/ekor/borongan; berat asal, netto aktual, dan dasar tagihan terpisah; penerimaan harian cukup input netto aktual → lihat selisih → konfirmasi; stok mengikuti aktual. Tidak perlu mempertanyakan lagi sebagai keputusan baru kecuali proses bisnis berubah.

## 13. Rencana pengerjaan bertahap

1. **Fondasi & master dari nol** — inisialisasi Next.js/TypeScript, koneksi langsung Supabase Cloud tanpa Docker, migrasi SQL baru, auth/RLS, role, fondasi UI baru, identitas usaha, mitra, produk/varian, akun kas/bank. Fondasi UI yang disetujui pada proyek baru menjadi acuan modul berikutnya.
2. **Ayam masuk** — DO, penerimaan netto aktual, selisih, pembelian dan hutang otomatis.
3. **Ayam diproses & dijual** — produksi/konversi, stok, penjualan, pengiriman/retur sederhana.
4. **Uang benar-benar terlacak** — piutang/hutang, pembayaran sebagian, kas/bank, setoran penagih, buku keuangan manual dan otomatis.
5. **Pemantauan** — dashboard, riwayat, pencarian/filter, pengujian lintas alur.
6. **P1** — detail kategori biaya, SDM/kasbon, aset, akuntansi & laporan yang memenuhi prasyarat, analisis usaha.

**Definisi P0 selesai:** owner bisa menjawab dengan cepat: *ayam masuk berapa, stok sekarang berapa, terjual berapa, siapa belum bayar, berapa hutang supplier, uang ada di akun mana, dan uang siapa yang belum disetor*—tanpa rekonsiliasi manual berulang.

---

**Catatan implementasi:** PRD versi ini menjadi acuan proyek baru dari nol. Jangan membawa status pengerjaan, skema, atau keputusan desain proyek lama sebagai kewajiban implementasi baru. Pengerjaan mengikuti tahapan di atas, dengan konfirmasi kebutuhan operasional yang masih terbuka sebelum modul terkait dibangun. Penyuntingan PRD ini belum menjalankan pembuatan aplikasi, migrasi, atau reset database.
