# Impor riwayat pembelian dan penjualan

Kebutuhan yang dipilih pengguna adalah **seluruh rincian transaksi lama**, bukan hanya saldo awal hutang/piutang. Implementasi dan pemetaan menunggu contoh Excel klien; fitur unggah/import riwayat belum tersedia pada aplikasi.

Data yang perlu dikenali dari contoh:

| Kelompok | Informasi yang dibutuhkan |
|---|---|
| Pembelian | Nomor DO/invoice, tanggal, supplier, produk, jumlah/satuan, penerimaan aktual kg, dasar tagihan dan harga |
| Penjualan | Nomor invoice, tanggal, pelanggan, produk, jumlah/satuan, harga, diskon bila ada, dan berat aktual kg untuk satuan ekor/pcs |
| Pembayaran | Nomor invoice asal, tanggal pembayaran, nominal dan akun kas/bank; satu invoice bisa memiliki beberapa pembayaran |
| Tagihan | Jatuh tempo dan sisa belum lunas yang bisa dicocokkan dengan total invoice dikurangi pembayaran/retur |
| Perubahan | Retur, pembatalan atau koreksi jika tercantum dalam sumber |

Nomor invoice yang sama pada beberapa baris item harus menjadi satu transaksi dengan beberapa item. Pembayaran tidak boleh dibuat ulang sebagai penjualan/pembelian. Supplier/pelanggan/produk yang namanya mirip harus ditinjau sebelum digabungkan. Angka dan tanggal mengikuti nilai Excel asli dan format Indonesia; format teks ambigu harus ditandai untuk diperiksa.

Alur yang direncanakan: unggah berkas → pilih sheet/pemetaan kolom → pratinjau dan daftar kesalahan → rekonsiliasi jumlah transaksi, nilai pembelian/penjualan, kas, stok serta sisa hutang/piutang → konfirmasi impor. Identitas impor harus mencegah transaksi terduplikasi jika berkas yang sama diunggah kembali.

Sebelum impor penuh, tentukan tanggal awal pemakaian dan kelengkapan data stok/hasil potong/pembayaran. Jika stok/kas awal sudah mewakili transaksi lama, riwayat tersebut tidak boleh diposting lagi dengan cara yang menggandakan saldo. Jika riwayat fisik tidak lengkap, tentukan perlakuan historis terlebih dahulu dan tandai modal/laba yang belum lengkap. Jangan menganggap modal nol atau menciptakan berat/pembayaran yang tidak ada dalam sumber.

Contoh berkas boleh menggunakan nama mitra yang disamarkan, tetapi pertahankan susunan sheet, kolom, jenis angka/tanggal, invoice dengan beberapa item, cicilan, serta contoh transaksi belum lunas. Jangan menyertakan password atau API key.
