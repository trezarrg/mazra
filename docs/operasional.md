# Operasional dan kesiapan penggunaan

Implementasi diperbarui 6 November 2026. Demo memakai Supabase `vcephhquqtppxuvypeft`; klien Rizki Berkah Abadi Farm memakai `wgdjtmdomseqhzgatbsk`. Panduan penyerahan ada di [penyerahan-rizki-berkah-abadi.md](penyerahan-rizki-berkah-abadi.md).

## Alur harian

Modul **Dokumen** memuat dokumen final **Penjualan** dan **Pembelian**, dengan filter jenis tersebut serta status **Lunas** / **Belum lunas**. Kedua jenis selalu tersedia sebagai pilihan. Status mengikuti sisa piutang/hutang setelah pembayaran dan retur; cicilan tetap **Belum lunas** selama masih ada sisa. Draft dan transaksi yang dibalik tidak masuk daftar ini; produksi, penyesuaian stok, dan transaksi lain tetap dikelola di modul masing-masing. Periode dan pencarian tetap tersedia.

1. Pengelola membuat DO. DO dapat diedit sebelum ada penerimaan; stok dan hutang belum berubah.
2. Petugas produksi membuka **Lainnya → Timbang penerimaan**, memilih DO langsung dari daftar berstatus **Belum** (pilihan awal), lalu mengisi tanggal, berat asal bila ada, netto aktual, dan catatan. Harga supplier tidak ditampilkan. DO yang sudah diterima di Pembelian atau sudah memiliki hasil timbang tidak muncul lagi dalam antrean. Filter periode mengikuti tanggal DO untuk **Belum**, dan tanggal timbang/penerimaan untuk **Sudah**; default tanggal hari ini. Pilih **Semua** pada periode untuk melihat lintas tanggal. Pilihan **Sudah** memuat penerimaan langsung dan hasil timbang dengan penanda menunggu konfirmasi atau sudah diterima. Hasil timbang yang dibatalkan tidak masuk **Sudah**; DO kembali ke **Belum** bila masih memenuhi syarat antrean.
   Hasil yang dikirim muncul pada **Pembelian → Hasil timbang menunggu konfirmasi**; pengelola menetapkan dasar tagihan lalu mengonfirmasi. Selama ada hasil timbang menunggu, penerimaan langsung pada DO itu ditahan agar tidak tercatat ganda. Jika salah, batalkan hasil timbang dengan alasan agar DO kembali ke antrean. Jika ada pengiriman tambahan untuk DO yang sudah diterima, pengelola mencatatnya lewat **Tambah penerimaan** di Pembelian.
3. Stok masuk mengikuti netto aktual; hutang mengikuti berat yang ditagihkan × harga per kg, jumlah ekor × harga per ekor, atau nominal borongan. Satu DO dapat memiliki beberapa penerimaan. Lanjutkan **Bayar supplier** untuk membayar sisa tagihan; **Isi sisa** mengisi nominal pelunasan. Daftar DO menandai **Belum diterima**, **Belum lunas**, atau **Lunas**, dengan filter pembayaran.
4. Buka **Hasil potong** untuk mencatat pengolahan, atau **Stok** untuk melihat persediaan. Penerimaan dari semua supplier menjadi stok gabungan per produk dalam kg, tanpa memilih asal DO. Untuk mengolah, klik **Catat hasil potong**, pilih bahan (default ayam hidup), isi kg yang digunakan serta jumlah ekor opsional, lalu tambahkan seluruh hasil timbang per produk. Sistem mengurangi bahan dan menambah hasil sekaligus saat **Simpan hasil potong**; draft belum mengubah stok. Karkas dapat diolah lagi menjadi fillet dan bagian lainnya. Selisih proses dan persentase hasil dihitung dari berat bahan dan hasil nyata. Barang yang sama tidak boleh dihitung dua kali.
5. Buat penjualan dan pilih pelanggan. Item memakai baris ringkas: produk, jumlah, satuan, harga, serta subtotal. Default satuan kg; harga per ekor/pcs tetap memerlukan berat aktual untuk pengurangan stok kg. Varian muncul hanya jika produk memilikinya. Pembayaran awal default **Rp0**; akun kas/bank hanya diminta jika pembayaran lebih dari nol. Tambahkan jatuh tempo opsional bila belum lunas. **Terbitkan invoice** mengurangi stok sekali, membentuk piutang sisa, lalu membuka invoice. Draft belum mengubah saldo.
6. Sopir dapat ditugaskan untuk mencatat pengiriman. Barang boleh dikirim dan diterima sebelum pembayaran. Pengiriman tidak mengurangi stok kedua kali. Sopir hanya melihat tugasnya dan tidak dapat mencatat pembayaran. Kekurangan/penolakan ditindaklanjuti dengan retur/koreksi.
7. Pengelola mencatat pembayaran berikutnya dari invoice atau **Piutang & hutang**, melalui kas/bank aktif. Cicilan tidak dapat melebihi sisa. Invoice dan daftar penjualan menandai **Belum lunas** sampai sisa nol, lalu **Lunas**. Retur per ekor/pcs memerlukan berat dikembalikan dan dibatasi jumlah serta berat asal.
8. Buku keuangan manual hanya untuk kejadian yang belum dicatat modul lain. Gunakan kategori khusus untuk modal, pinjaman, pokok, bunga, aset, dan prive. Referensi pinjaman harus konsisten antara pencairan dan angsurannya.

Fitur petugas penagih sudah dihentikan: peran, penugasan, kas penagih, setoran, dan verifikasinya tidak tersedia pada UI maupun backend. Rute lama `/setoran` mengarahkan pengelola ke Buku keuangan. Invoice, hutang/piutang, dan jatuh tempo tetap tersedia. Migrasi `20261105000700` memeriksa tidak adanya data penagih sebelum mengubah aturan akses; tidak menghapus transaksi atau saldo. Kolom lama dan kunci JSON ringkasan bernilai nol dipertahankan untuk kompatibilitas view, tanpa alur aktif.

## Koreksi dan bukti

- Jika tagihan supplier belum lunas, tambahkan tanggal jatuh tempo bila diperlukan. Pengingat dikelompokkan Terlambat, Hari ini dan Besok (H-1), lalu hilang setelah lunas. Tanggal lama tetap tersimpan sebagai riwayat, tanpa menampilkan formulir jatuh tempo pada tagihan lunas.
- Dokumen pembelian tersedia otomatis setelah penerimaan dicatat di **Dokumen**, **Dokumen terbaru**, dan tautan **Lihat dokumen pembelian** pada penerimaan. Format bukti memuat identitas usaha/supplier, nomor PB yang tetap untuk tiap penerimaan, rincian timbang, tabel tagihan, dan pembayaran aktif. Pembayaran yang dicatat otomatis memperbarui rincian dan status dokumen; tidak perlu mengunggah berkas agar dokumen muncul. Gunakan **Cetak / PDF**, **Salin gambar**, **Bagikan gambar**, atau **Unduh PNG**. PNG berisi dokumen saja; tombol pengelolaan dan riwayat pembatalan tidak ikut dibagikan. **Bagikan gambar** membuka pemilih aplikasi perangkat (misalnya WhatsApp jika tersedia), bukan membagikan tautan halaman privat. Jika browser tidak mendukung berbagi/salin gambar, gunakan unduh PNG. Unggah nota supplier atau bukti transfer tetap opsional.
- Penjualan final dikoreksi melalui retur item asal, lalu penjualan pengganti bila diperlukan. Retur mengurangi tagihan dan mengembalikan stok; bagian yang sudah terbayar memerlukan akun pengembalian dana.
- Penerimaan salah dikoreksi melalui retur penerimaan asal, lalu catatan penerimaan pengganti pada DO terbuka atau DO baru. DO yang sudah ditutup tidak menerima barang tambahan.
- Menu **Batalkan pembayaran** / **Batalkan transaksi** menyimpan pengguna, tanggal, alasan dan sumber. Pada pembelian, buka **Dokumen pembelian → Kelola transaksi**. Pilih pembayaran yang salah untuk melihat nominal, akun, dampak pembatalan, lalu isi alasan dan konfirmasi. **Catat retur barang** memakai jumlah aktual dikembalikan dan nilai yang disepakati; jika retur mencakup bagian yang sudah dibayar, pilih akun penerimaan dan catat setelah dana dari supplier benar-benar diterima. Kontrol pengelolaan terpisah dari bukti yang dicetak/dibagikan. Jika stok/uang telah dipakai atau ada ketergantungan seperti kasbon terpotong, aset terjual atau pinjaman terbayar, koreksi dokumen turunannya terlebih dahulu.
- Bukti PDF/JPG/PNG maksimal 10 MB disimpan di bucket privat. Tautan unduh bersifat sementara. Riwayat dokumen tetap tersimpan.
- Jangan memasukkan ulang pembayaran ke buku kas manual; pembayaran sudah menghasilkan gerakan kas otomatis.

## Gaji, aset dan laporan

- **Stok** menunjukkan saldo kg saat ini dengan pencarian. Buka produk untuk melihat pergerakan berdasarkan periode. **Hasil potong** berada di menu terpisah, dengan periode, pencarian, status Draft/Selesai, rincian bahan/hasil, dan ringkasan seluruh proses selesai pada periode terpilih yang dibuka sesuai kebutuhan. Ringkasan memuat kg bahan, hasil per produk, jumlah ekor/pcs yang dicatat, selisih, dan persentase hasil. Proses lanjutan dihitung sebagai kegiatan tersendiri; total kg diolah adalah jumlah seluruh tahap. Nilai pembelian dan penjualan periode hanya tersedia bagi pengelola, ditampilkan terpisah sebagai nilai transaksi (bukan laba atau kas masuk/keluar). Petugas produksi tidak memperoleh nilai uang. Modal hasil potong dihitung otomatis; laba muncul saat produknya terjual.
- Migrasi stok sederhana tidak mengubah gerakan stok atau nilai transaksi lama. Stok/transaksi final non-kg ditahan untuk pemeriksaan sebelum migrasi. Uji alur lengkap tersedia pada `scripts/test-simple-processing.sql`; fixture di-rollback, audit dinonaktifkan pada sesi uji, dan restart nomor operasi bersifat transaksional agar penghitung asli dipulihkan.

- Tarif pekerja adalah catatan acuan. Gaji dibayar dengan komponen manual pada rentang periode yang tidak bertumpang tindih. Potong kasbon mengurangi piutang pekerja, bukan biaya gaji kedua kali.
- Perolehan aset melalui kategori **Pembelian aset tetap**. Saat menjual aset, pilih aset dan isi nilai buku yang telah ditinjau. Selisih hasil penjualan dan nilai buku menjadi hasil pelepasan; seluruh uang masuk bukan laba.
- Filter periode memengaruhi nilai transaksi dan arus periode. Dashboard menandai saldo kas, stok dan hutang/piutang sebagai posisi saat ini. Posisi saldo akuntansi menampilkan saldo sebelum, masuk, keluar dan akhir periode.
- **Laba kotor** = omzet bersih − HPP. **Profit usaha** = laba kotor + pendapatan lain + hasil pelepasan aset − biaya operasional − gaji ± penyesuaian persediaan/retur. Angka ini sebelum pajak dan penyusutan; neraca tetap memerlukan validasi ekuitas awal, penyusutan dan saldo awal. Pembayaran, modal, prive, pokok pinjaman dan pembelian aset tidak dibebankan sebagai biaya usaha.

## Dashboard dan modal stok

### Perbaikan dan pembatalan transaksi

- Rincian transaksi menyediakan menu Kelola: Edit keterangan, Perbaiki transaksi, Batalkan transaksi. Draft dihapus dari daftar aktif; DO yang belum diterima dapat diedit/dibatalkan. Filter Dibatalkan membuka catatan lama.
- Perbaikan harga penjualan atau penerimaan dengan barang/tanggal/mitra yang sama mempertahankan invoice dan pembayaran yang masih sesuai. Total baru tidak boleh di bawah pembayaran aktif. Harga penerimaan disimpan per penerimaan, sehingga tidak mengubah harga penerimaan lain pada DO yang sama. HPP direkonstruksi setelah koreksi modal.
- Perubahan barang membuat pembatalan dan transaksi pengganti secara atomik. Pemakaian stok berikutnya, retur aktif, pembayaran aktif dan pengiriman diperiksa di server. Stok gabungan tidak menelusuri DO; pemakaian produk setelah transaksi ditampilkan sebagai hambatan, bukan dianggap berasal dari batch tertentu.
- Barang yang benar-benar kembali memakai Retur. Pembatalan/perbaikan pembayaran hanya mengoreksi catatan uang; tidak memindahkan uang nyata. Catatan pengiriman yang salah dapat dibatalkan oleh pengelola; penerimaan pengiriman berikutnya perlu diselesaikan dahulu.
- Sebelum/sesudah, alasan, pengguna, waktu dan tautan pengganti disimpan pada riwayat perubahan dengan akses pengelola. Transaksi final tidak dihapus permanen. Uji terarah tersedia pada `scripts/test-transaction-changes.sql`, seluruh fixture di-rollback.

- Posisi piutang, hutang dan kas/bank mencakup seluruh periode. Kinerja usaha default bulan berjalan; mengubah periode tidak menyembunyikan pengingat hari ini.
- Harus ditagih/Harus dibayar dikelompokkan Terlambat, Hari ini, Besok menurut tanggal Asia/Jakarta. Setiap kelompok menampilkan lima invoice pertama, tetapi jumlah dan total mencakup semuanya. Tagihan tanpa tempo tersedia pada Belum dijadwalkan. Bayar sebagian mengurangi sisa; lunas menghilangkan pengingat. Pengingat pembelian mengikuti H-1 dan hari H, serta tetap menampilkan tunggakan.
- Popup invoice menyediakan pembayaran dan pengaturan tempo. Pengingat diperbarui setiap menit saat halaman terlihat, ketika kembali ke halaman dan setelah perubahan; popup terbuka tidak diganggu refresh otomatis. Tidak ada pengiriman notifikasi ke luar aplikasi.
- Penerimaan terkonfirmasi menambah nilai stok sebesar tagihan dibagi kg aktual. Modal rata-rata berlaku per produk/varian. Hasil potong memindahkan seluruh modal bahan menurut proporsi kg hasil, termasuk susut. Produksi tidak meminta asal DO atau harga modal.
- HPP timbul saat penjualan, memakai kg aktual termasuk penjualan ekor/pcs. Retur penjualan mengembalikan modal asal. Retur supplier mengeluarkan stok pada rata-rata; selisih kredit supplier masuk penyesuaian usaha. Pembalikan mempertahankan modal asal dengan selisih rata-rata stok gabungan dicatat terpisah agar nilai persediaan tetap cocok dengan ledger.
- Ledger nilai terpisah dari stok fisik. Posting dan valuasi satu transaksi database melalui trigger deferred; semua gerakan dikunci dengan kunci transaksi yang sama. Replay mengikuti tanggal bisnis dan urutan posting monoton, bahan sebelum hasil. Tanggal mundur merekonstruksi transaksi berikutnya tanpa mengubah invoice, kg, atau kas.
- **Akuntansi → Modal stok** menunjukkan modal awal/penyesuaian yang belum diketahui dan masalah urutan riwayat. Owner/developer mengisi total modal gerakan serta alasan yang diaudit; admin hanya membaca. Modal yang hilang tidak dianggap Rp0, dan laba yang terdampak ditandai Belum lengkap. Rp0 hanya diisi jika barang memang tanpa modal. Nilai transaksi historis tetap menjadi dasar sampai dikoreksi melalui alur transaksi.
- Pengujian rollback ada di `scripts/test-financial-dashboard.sql`, termasuk rata-rata, susut, pengolahan lanjutan, ekor, retur/koreksi, tanggal mundur, gaji, modal hilang, pengingat lintas bulan/tahun dan pembatasan akses. `scripts/test-concurrency.mjs` menguji stok/HPP dan pembayaran paralel melalui API nyata, lalu membersihkan fixture. Harness browser memakai data contoh tanpa koneksi database.

## Saldo awal

Dua gerakan saldo awal kas lama tetap ada. Cocokkan terhadap uang/rekening sebenarnya sebelum go-live. Jangan menambah saldo awal kedua untuk akun yang sudah dicatat. Akun baru dapat diberi saldo awal melalui kategori buku keuangan oleh owner/developer. Piutang dan hutang awal dicatat sebagai pembelian/penjualan bertanggal nyata. Tidak tersedia input stok awal tersendiri.

## Backup dan restore

Pemeriksaan 31 Oktober 2026 dengan `supabase backups list --project-ref vcephhquqtppxuvypeft`: WALG aktif, PITR tidak aktif, timestamp paling awal/akhir bernilai 0. Hasil ini belum membuktikan tersedianya titik restore yang dapat dipakai.

Sebelum go-live:

1. Periksa backup pada dashboard Supabase proyek tujuan. Pastikan tanggal, retensi dan metode pemulihan benar-benar tersedia; aktifkan kebijakan backup yang sesuai bila belum ada.
2. Simpan cadangan database dan berkas Storage secara terpisah di tempat dengan akses terbatas. Jangan menganggap restore database otomatis memulihkan isi file bukti.
3. Uji pemulihan pada proyek/lingkungan terpisah, termasuk akun dan akses, gerakan stok/kas, dokumen, pembayaran, bukti, dan audit.
4. Rekonsiliasi jumlah baris serta saldo stok, kas, dan hutang/piutang dengan sumber sebelum backup. Jalankan pemeriksaan aplikasi pada lingkungan hasil restore.
5. Catat tanggal backup, waktu dan hasil restore, kehilangan data maksimum yang dapat diterima, dan orang yang bertanggung jawab.

Restore pada produksi menghentikan/mengubah keadaan database. Jangan menjalankannya sebagai pengujian rutin; pastikan target, waktu pemulihan, cadangan terbaru dan otorisasi pemilik jelas terlebih dahulu. Tidak ada restore/reset produksi yang dilakukan dalam pengerjaan ini.

## Pengujian ulang

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run test:transactions
npm run test:concurrency
supabase db query --linked --file scripts/test-purchase-workflow.sql
supabase db query --linked --file scripts/test-receiving-queue.sql
supabase db query --linked --file scripts/test-simple-processing.sql
supabase db query --linked --file scripts/test-sales-without-collectors.sql
node scripts/test-purchase-document.mjs
supabase db lint --linked --level error
```

Test transaksi menggunakan rollback. Test API memakai akun dan fixture sementara, lalu membersihkannya dalam `finally`. Test API memerlukan koneksi cloud dan Supabase CLI yang sudah login. Jangan menjalankan dua proses CLI Supabase bersamaan: inisialisasi kredensial sesi CLI dapat saling berbenturan. Paralelisme transaksi diuji melalui API, bukan melalui dua sesi CLI.

Pemeriksaan dokumen dan formulir antrean timbang memakai fixture lokal di Chrome/Edge tanpa login atau mengirim pesan. Jika browser tidak terdeteksi, isi `AYAM_BROWSER_PATH`. PNG, pratinjau desktop/HP, dialog pembatalan, formulir timbang, dan PDF contoh dihasilkan di `artifacts/purchase-document/`. Clipboard dan pemilih aplikasi disimulasikan; ketersediaan WhatsApp tetap mengikuti perangkat pengguna. Uji SQL antrean memakai fixture dalam transaksi rollback, nomor DO eksplisit, dan trigger audit yang dinonaktifkan khusus sesi uji sehingga tidak mengonsumsi nomor dokumen atau audit.

Untuk pemeriksaan HTTP setelah build, jalankan server produksi lokal pada port terpisah lalu set `AYAM_TEST_BASE_URL` sebelum menjalankan `npm run test:concurrency`. Pemeriksaan ini tidak menggantikan UAT visual/HP oleh pengguna.
