# Daftar pekerjaan Sistem Usaha Ayam Potong

Acuan: PRD versi 1.2, 29 Oktober 2026. Diperbarui 31 Oktober 2026. Status implementasi dan kesiapan produksi dibedakan di bawah.

## Keputusan yang digunakan

- Penjualan final langsung mengurangi stok. Pengiriman mencatat realisasi; selisih ditindaklanjuti dengan retur/koreksi terhubung.
- Jumlah disimpan sesuai satuan produk; kg hanya dari hasil timbang. Konversi antarproduk/satuan dicatat sebagai produksi, tanpa asumsi berat rata-rata.
- Supabase Cloud tujuan: `vcephhquqtppxuvypeft` (ayam-potong), tanpa Docker dan database lokal.
- Akun developer `trezarrg@gmail.com` tetap memiliki akses penuh. Tidak dibuat akun owner permanen tambahan. Verifikasi setoran sendiri tetap dilarang, termasuk untuk developer/akun rangkap peran.
- Tidak ada modul stok/saldo awal terpisah. Saldo awal kas/bank melalui buku keuangan; hutang/piutang melalui transaksi bertanggal. Entry point lama untuk menambah stok/piutang awal sudah ditutup.
- Dua gerakan kas saldo awal lama tetap disimpan. Nilainya perlu divalidasi sebelum go-live; tidak ada data usaha yang dihapus untuk menghilangkan saldo tersebut.
- Pengguna menyetujui pada 31 Oktober 2026: stok kuantitas aktual, gaji manual per periode, laporan laba rugi/neraca berstatus **Belum lengkap** sampai metode HPP, valuasi, penyusutan, dan saldo awal disahkan.
- SOP aplikasi: produksi mencatat timbang; pengelola mengonfirmasi penerimaan dan dasar tagihan. Sopir dan penagih ditugaskan terpisah. Setoran diverifikasi pengelola lain.

## P0 — Fondasi dan data utama

- [x] Fondasi Next.js/TypeScript, login tertutup, profil, peran gabungan, dan RLS.
- [x] UI responsif yang mengikuti fondasi disetujui; maksimal lima tujuan navigasi utama.
- [x] Identitas usaha/logo, mitra, katalog, varian, satuan, akun kas/bank, dan pengelolaan akses akun Auth terkonfirmasi.
- [x] Stok dan riwayat berasal dari penerimaan, produksi/konversi, penjualan, retur, penyesuaian beralasan, dan pembalikan.
- [x] Hak akses server/database; akun tanpa profil dan akun nonaktif ditolak. Petugas timbang tidak memperoleh harga DO; penagih hanya mengakses tagihan yang ditugaskan dan gerakan kasnya.
- [x] Audit perubahan master, dokumen, item, gerakan stok/kas, pembayaran, bukti, dan koreksi.

## P0 — Operasional dan uang

- [x] DO tanpa dampak stok/hutang, edit sebelum penerimaan pertama, penutupan, dan pembatalan draft.
- [x] Penerimaan parsial, netto aktual, selisih kg/persen, dasar tagihan per kg/ekor/borongan, dan peninjauan selisih.
- [x] Pencatatan timbang oleh produksi dan konfirmasi penerimaan oleh pengelola secara atomik/idempoten.
- [x] Produksi/konversi dari bahan dan hasil aktual, susut terlihat, tanpa stok ganda.
- [x] Penjualan banyak item, varian/satuan, diskon, pembayaran awal, draft/final, piutang, dan perlindungan stok tidak cukup.
- [x] Pengiriman parsial, konfirmasi diterima, serta retur/koreksi dengan referensi dokumen/item asal.
- [x] Hutang/piutang, jatuh tempo, cicilan, pelunasan, pembatalan pembayaran berjejak, dan larangan kelebihan bayar.
- [x] Kas penagih, setoran parsial, status menunggu, penolakan/verifikasi oleh orang berbeda, dan sisa kas yang tetap terlihat.
- [x] Buku keuangan otomatis/manual, saldo awal kas/bank, transfer, modal, pinjaman, pokok/bunga, prive, dan kategori usaha.
- [x] Koreksi melalui pembalikan atomik: stok, kas, pembayaran, produksi, retur, keuangan, transfer, setoran, gaji, dan kasbon. Dokumen final tidak dihapus.
- [x] Dashboard dengan sumber transaksi nyata, perhatian, riwayat penjualan/pembelian terpisah, pencarian otomatis, filter periode, dan paginasi.
- [x] Uji integrasi transaksi, otorisasi positif/negatif, audit, retry, dan permintaan paralel melalui API aplikasi.

## P1 — Pengelolaan usaha

- [x] Kategori keuangan, klasifikasi modal/pinjaman/prive, register aset tetap, penjualan aset dengan nilai buku, dan hasil pelepasan aset.
- [x] Pekerja tetap/harian/borongan, gaji manual per periode, komponen upah/lembur/bonus/potongan, kasbon, pengembalian, dan potong gaji tanpa biaya ganda.
- [x] Posisi saldo, komponen laba rugi, dan posisi neraca dengan status kelengkapan sesuai keputusan pengguna. Tidak menyatakan laba/neraca formal atau HPP yang belum disahkan.
- [x] Analisis berbasis aturan, perbandingan periode, tren arus kas, perhatian jatuh tempo, ekspor CSV sesuai filter, dan bukti PDF/JPG/PNG privat.

## Verifikasi dan sinkronisasi

- [x] Migrasi `20261031000100`–`20261031001200` diterapkan pada proyek cloud tujuan; tidak melakukan reset.
- [x] TypeScript, ESLint, build produksi, unit test periode/uang, integrasi SQL, dan lint fungsi database lulus.
- [x] API paralel: retry final tidak menggandakan stok; perebutan stok dan pembayaran paralel hanya menerima transaksi yang sah.
- [x] Penyimpanan bukti privat, metadata, signed URL, dan penolakan dokumen tidak sah lulus.
- [x] 22 halaman HTTP dengan sesi admin serta ekspor CSV lulus. Ini pemeriksaan HTTP, bukan review visual/browser.
- [x] Fixture, akun Auth sementara, berkas bukti, dan audit pengujian API dibersihkan; test SQL selalu rollback.

## Redesain 31 Oktober 2026

- [x] Tema hijau tua/netral, tombol minimalis, angka tabular, dan komponen konsisten lintas modul.
- [x] Hapus ikon dekoratif kartu/daftar, avatar inisial, serta badge/titik Pengelola. Aturan tanpa emoji/emotikon dicatat di AGENTS.md.
- [x] Sapaan dari nama pribadi; nama profil pengguna diperbarui menjadi Trezar.
- [x] Dashboard: penjualan bersih dan perbandingan periode, grafik kas masuk/keluar enam bulan, posisi tagihan, jatuh tempo tujuh hari, stok, tindak lanjut, dan aktivitas.
- [x] Menu Lainnya dikelompokkan menurut fungsi tanpa deretan ikon.
- [x] Build, typecheck, lint, dan tes periode/uang lulus. Browser produksi: desktop 1440, tablet 1024, mobile 390/320 px, interaksi grafik/kalender/keyboard serta 16 modul lulus tanpa overflow horizontal atau kesalahan JavaScript. Akun uji sudah dibersihkan.

## Sebelum digunakan sebagai pembukuan produksi

- [ ] Review visual dan UAT lapangan bersama pengguna, termasuk perangkat HP, timbangan, serta SOP penerima barang/uang.
- [ ] Validasi dua saldo awal kas lama, akun aktif, penanggung jawab kas penagih, dan saldo hutang/piutang saat mulai memakai aplikasi.
- [ ] Pastikan backup yang dapat dipulihkan dan lakukan latihan restore pada lingkungan terpisah. Pemeriksaan CLI 31 Oktober 2026: WALG aktif, PITR tidak aktif, tidak ada rentang timestamp pemulihan yang dikembalikan. Prosedur ada di `docs/operasional.md`; restore produksi tidak dijalankan.
- [ ] Pengesahan metode HPP/valuasi, biaya langsung dan penyusutan bila laporan akan dinyatakan formal. Mode **Belum lengkap** tetap dapat digunakan sesuai persetujuan pengguna.
- [ ] Aplikasi telah diterbitkan pada Cloudflare Workers. Tentukan domain dan pemantauan untuk penggunaan produksi.
