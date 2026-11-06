# Penyerahan Rizki Berkah Abadi Farm

Tanggal persiapan: 6 November 2026.

## Akses aplikasi

Alamat klien: **https://rizkiberkahabadi.pages.dev**.

Akun pemilik usaha akan dibuat saat pertemuan langsung sesuai permintaan pengelola. Siapkan email dan nama pribadi pemilik. Password dibuat/ditetapkan secara pribadi dan tidak ditulis dalam panduan umum ini. Developer bukan akun untuk digunakan bersama oleh klien.

## Urutan pengenalan saat bertemu klien

1. Login sebagai developer, buka **Lainnya → Data utama → Pengguna → Tambah**, lalu isi nama pribadi pemilik, email, password awal minimal 10 karakter, dan peran Owner. Akun dibuat langsung dari aplikasi dan dapat langsung login. Periksa login owner pada alamat klien dan pastikan akun developer tidak muncul di Tim & akses.
2. Lengkapi identitas usaha, alamat, telepon, supplier, pelanggan, produk, dan akun kas/bank. Gunakan data usaha yang sebenarnya.
3. Tentukan tanggal awal pemakaian dan cocokkan stok fisik, saldo kas/bank, hutang, serta piutang awal. Jangan memasukkan pembelian/penjualan lama lagi jika saldo awal sudah mewakilinya.
4. Peragakan satu penerimaan, pengolahan, penjualan dan pembayaran menggunakan contoh yang disetujui pemilik. Jika memakai data latihan di produksi, batalkan melalui alur koreksi yang sesuai; jangan menghapus baris database.
5. Tunjukkan pengingat Hari ini/Besok/Terlambat, pembayaran cicilan, dan cara membuka invoice serta menyimpan PDF/gambar.
6. Tentukan siapa yang menangani akun pengguna, pertanyaan operasional, backup, dan pemeriksaan saldo harian.

## Alur harian ringkas

**Pembelian:** buat DO → terima barang → catat pembayaran supplier. Stok mengikuti netto aktual kg; hutang mengikuti dasar tagihan yang disepakati. Penerimaan sudah menghasilkan dokumen meskipun belum dibayar.

**Hasil potong:** pilih satu bahan dan kg yang diolah, lalu isi kg masing-masing hasil. Simpan draft belum mengubah stok. Simpan hasil potong mengurangi bahan dan menambah semua hasil sekaligus. Catat barang yang terpisah agar tidak dihitung dua kali.

**Penjualan:** pilih produk dan jumlah → terbitkan invoice → kirim → catat pembayaran. Pembayaran awal boleh Rp0. Harga per ekor/pcs tetap memerlukan berat aktual kg untuk stok. Penjualan final mengurangi stok sekali; pengiriman tidak mengurangi stok lagi.

**Hutang/piutang:** catat tempo bila diketahui. Dashboard menampilkan yang terlambat, hari ini dan besok. Tagihan tanpa tempo tetap masuk total hutang/piutang, tetapi perlu dijadwalkan untuk menjadi pengingat bertanggal. Cicilan menyisakan tagihan; pelunasan mengeluarkannya dari pengingat.

**Keuangan:** pembayaran invoice dicatat dari invoice/Piutang & hutang. Buku keuangan digunakan untuk kejadian lain seperti biaya usaha. Jangan mencatat pembayaran invoice sekali lagi sebagai pengeluaran manual.

**Profit:** omzet, pembelian, HPP, laba kotor dan profit usaha mempunyai arti berbeda. Pembelian tidak dikurangi lagi setelah HPP. Profit yang ditampilkan adalah sebelum pajak dan penyusutan. Jika modal belum lengkap, lengkapi dahulu; angka tersebut belum dapat dijadikan laba final.

**Kesalahan input:** draft dapat diperbaiki. Transaksi final menggunakan Kelola untuk edit keterangan, perbaikan atau pembatalan sesuai kondisi. Pembayaran, pengiriman atau pemakaian stok berikutnya bisa perlu diselesaikan dahulu. Retur hanya untuk barang yang benar-benar dikembalikan.

## Batas akses dan pemeliharaan

Owner mengelola kegiatan usaha. Produksi dan sopir memakai akun sesuai tugas; harga/profit hanya tersedia sesuai peran. Developer mempunyai akses pemeliharaan terpisah, tidak ditampilkan sebagai tim operasional, dan perubahan tetap mempunyai jejak audit.

Data klien menggunakan Supabase tersendiri. Satu sumber kode digunakan untuk pembaruan aplikasi; pembaruan tidak menyalin transaksi demo. Hosting masih berada di akun Cloudflare pengelola saat ini. Domain khusus yang dibeli dapat dipasang kemudian.

Periksa backup dan prosedur pemulihan sebelum transaksi usaha menjadi rutin. Cadangan database dan file bukti perlu diperhatikan secara terpisah. Jangan menjalankan restore/reset terhadap produksi sebagai latihan.

Pemeriksaan 6 November 2026: API backup Supabase klien belum menampilkan snapshot, dan PITR tidak aktif. Konfirmasi metode backup serta pemulihan sebelum mengandalkannya untuk transaksi rutin; belum ada klaim backup/restore produksi berhasil.

Panduan ini tidak memuat password, API key, token rilis, atau akun developer. Berkas akses pribadi tetap disimpan terpisah oleh pengelola.
