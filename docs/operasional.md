# Operasional dan kesiapan penggunaan

Implementasi 31 Oktober 2026, Supabase `vcephhquqtppxuvypeft`.

## Alur harian

1. Pengelola membuat DO. DO dapat diedit sebelum ada penerimaan; stok dan hutang belum berubah.
2. Petugas produksi dapat mengirim hasil timbang melalui **Lainnya → Timbang penerimaan**. Form ini tidak menampilkan harga supplier. Pengelola membuka DO, memilih hasil timbang, menetapkan dasar tagihan, lalu mengonfirmasi. Pengelola juga dapat mencatat penerimaan langsung bila merangkap petugas penerima.
3. Stok masuk mengikuti netto aktual; hutang mengikuti dasar kesepakatan. Satu DO dapat memiliki beberapa penerimaan. Tutup DO jika pengirimannya selesai; beri catatan peninjauan pada selisih timbang.
4. Catat bahan dan seluruh hasil timbang nyata melalui **Produksi**. Pemotongan lanjutan memakai konversi kedua. Untuk mengganti kg menjadi ekor/pcs, lakukan konversi dengan jumlah dan berat aktual yang diukur; jangan membuat dua persediaan untuk barang fisik yang sama.
5. Buat penjualan, pilih pelanggan, item/varian/satuan, diskon, uang yang benar-benar diterima dan akun penerima. Draft belum mengubah saldo. Final mengeluarkan stok sekali dan membentuk piutang untuk bagian belum dibayar.
6. Sopir dan penagih dapat ditugaskan terpisah. Sopir hanya mencatat realisasi pengiriman yang ditugaskan. Pengiriman tidak mengeluarkan stok kedua kali. Kekurangan/penolakan ditindaklanjuti dengan retur/koreksi.
7. Pembayaran berikutnya dicatat pada tagihan sumber. Cicilan tidak dapat melebihi sisa. Penerimaan oleh penagih masuk ke akun kas penagih yang sesuai.
8. Penagih mengajukan setoran dari akunnya. Pengelola berbeda memverifikasi uang yang diterima. Sebelum verifikasi, uang tetap berada di kas penagih. Jika hanya satu akun digunakan, tambahkan akses pengguna penerima/verifikator sebelum mengaktifkan alur ini.
9. Buku keuangan manual hanya untuk kejadian yang belum dicatat modul lain. Gunakan kategori khusus untuk modal, pinjaman, pokok, bunga, aset, dan prive. Referensi pinjaman harus konsisten antara pencairan dan angsurannya.

## Koreksi dan bukti

- Penjualan final dikoreksi melalui retur item asal, lalu penjualan pengganti bila diperlukan. Retur mengurangi tagihan dan mengembalikan stok; bagian yang sudah terbayar memerlukan akun pengembalian dana.
- Penerimaan salah dikoreksi melalui retur penerimaan asal, lalu catatan penerimaan pengganti pada DO terbuka atau DO baru. DO yang sudah ditutup tidak menerima barang tambahan.
- Menu **Koreksi melalui pembalikan** tersedia pada pembayaran dan dokumen final terkait. Pembalikan menyimpan pengguna, tanggal, alasan dan sumber. Jika stok/uang telah dipakai atau ada ketergantungan seperti kasbon terpotong, aset terjual atau pinjaman terbayar, koreksi dokumen turunannya terlebih dahulu.
- Bukti PDF/JPG/PNG maksimal 10 MB disimpan di bucket privat. Tautan unduh bersifat sementara. Riwayat dokumen tetap tersimpan.
- Jangan memasukkan ulang pembayaran ke buku kas manual; pembayaran dan setoran sudah menghasilkan gerakan kas otomatis.

## Gaji, aset dan laporan

- Tarif pekerja adalah catatan acuan. Gaji dibayar dengan komponen manual pada rentang periode yang tidak bertumpang tindih. Potong kasbon mengurangi piutang pekerja, bukan biaya gaji kedua kali.
- Perolehan aset melalui kategori **Pembelian aset tetap**. Saat menjual aset, pilih aset dan isi nilai buku yang telah ditinjau. Selisih hasil penjualan dan nilai buku menjadi hasil pelepasan; seluruh uang masuk bukan laba.
- Filter periode memengaruhi nilai transaksi dan arus periode. Dashboard menandai saldo kas, stok dan hutang/piutang sebagai posisi saat ini. Posisi saldo akuntansi menampilkan saldo sebelum, masuk, keluar dan akhir periode.
- Laporan laba rugi/neraca tetap **Belum lengkap**. Metode HPP, valuasi persediaan, penyusutan, biaya langsung, dan saldo awal belum disahkan; selisih sebelum HPP tidak boleh disebut laba bersih.

## Saldo awal

Dua gerakan saldo awal kas lama tetap ada. Cocokkan terhadap uang/rekening sebenarnya sebelum go-live. Jangan menambah saldo awal kedua untuk akun yang sudah dicatat. Akun baru dapat diberi saldo awal melalui kategori buku keuangan oleh owner/developer. Piutang dan hutang awal dicatat sebagai pembelian/penjualan bertanggal nyata. Tidak tersedia input stok awal tersendiri.

## Backup dan restore

Pemeriksaan 31 Oktober 2026 dengan `supabase backups list --project-ref vcephhquqtppxuvypeft`: WALG aktif, PITR tidak aktif, timestamp paling awal/akhir bernilai 0. Hasil ini belum membuktikan tersedianya titik restore yang dapat dipakai.

Sebelum go-live:

1. Periksa backup pada dashboard Supabase proyek tujuan. Pastikan tanggal, retensi dan metode pemulihan benar-benar tersedia; aktifkan kebijakan backup yang sesuai bila belum ada.
2. Simpan cadangan database dan berkas Storage secara terpisah di tempat dengan akses terbatas. Jangan menganggap restore database otomatis memulihkan isi file bukti.
3. Uji pemulihan pada proyek/lingkungan terpisah, termasuk akun dan akses, gerakan stok/kas, dokumen, pembayaran, bukti, dan audit.
4. Rekonsiliasi jumlah baris serta saldo stok, kas, hutang/piutang dan kas penagih dengan sumber sebelum backup. Jalankan pemeriksaan aplikasi pada lingkungan hasil restore.
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
supabase db lint --linked --level error
```

Test transaksi menggunakan rollback. Test API memakai akun dan fixture sementara, lalu membersihkannya dalam `finally`. Test API memerlukan koneksi cloud dan Supabase CLI yang sudah login. Jangan menjalankan dua proses CLI Supabase bersamaan: inisialisasi kredensial sesi CLI dapat saling berbenturan. Paralelisme transaksi diuji melalui API, bukan melalui dua sesi CLI.

Untuk pemeriksaan HTTP setelah build, jalankan server produksi lokal pada port terpisah lalu set `AYAM_TEST_BASE_URL` sebelum menjalankan `npm run test:concurrency`. Pemeriksaan ini tidak menggantikan UAT visual/HP oleh pengguna.
