# Rencana implementasi kg, ekor/pcs, dan kehilangan stok

Tanggal: 9 November 2026. Status: tahap pertama telah diimplementasikan. Migrasi tambahan sudah diterapkan ke demo dan klien; rilis aplikasi dilakukan melalui workflow GitHub Actions pada branch main. Aturan operasional dan hasil verifikasi ada di [panduan implementasi](implementasi-kg-jumlah.md).

## 1. Hasil yang dituju

Petugas dapat mengisi kg atau jumlah yang diketahui. Aplikasi menawarkan pasangan perkiraan berdasarkan produk, ukuran, dan kelompok stok yang relevan. Penerimaan, hasil potong, penjualan, kehilangan stok, pengiriman, retur, koreksi, laporan, serta dokumen memakai aturan yang sama.

Saldo dan dokumen membedakan angka hasil timbang/hitung, angka supplier, perkiraan, dan yang belum diketahui. Kg dan jumlah menggambarkan barang yang sama, bukan dua stok yang dapat dijual terpisah.

## 2. Keputusan dasar untuk tahap pertama

- Pertahankan kg sebagai dasar stok dan penilaian persediaan yang sudah berjalan. Tambahkan jumlah pendamping dan kualitas datanya. Penggantian dasar HPP menjadi per pcs merupakan pekerjaan lanjutan, bukan bagian dari tahap pertama.
- Penerimaan klien ini mengikuti dokumen supplier tanpa memaksa hitung/timbang ulang. Jumlah boleh kosong. Pembayaran atau hutang tetap mengikuti transaksi pembelian yang disepakati.
- Kematian saat bongkar, kematian di kandang, dan barang olahan yang dibuang menjadi kejadian kehilangan stok tersendiri. Tidak mengurangi tagihan supplier.
- Satuan harga tetap independen dari dua ukuran fisik. Kuantitas yang menjadi dasar tagihan tidak diam-diam diubah oleh hasil konversi perkiraan.
- Ukuran kecil/sedang/besar menggunakan varian produk yang sudah ada jika sesuai. Nama ukuran dan rasio mengikuti usaha; jangan menetapkan batas ukuran atau angka standar secara global.
- Definisi jumlah ditetapkan per produk: ekor, pcs, atau set. Ati-ampela yang dijual satu pasangan memakai definisi set yang eksplisit. Periksa constraint unit dan konfigurasi produk sebelum memperluas unit yang didukung.
- Estimasi boleh dipakai untuk stok buku setelah dikonfirmasi petugas. Jika kg tidak diketahui dan tidak ada rasio yang dapat dipakai, simpan draft/catatan untuk dilengkapi; jangan memfinalkan pengurangan kg atau nilainya sebagai nol.
- Perhitungan nilai persediaan tetap mengikuti metode rata-rata proyek saat ini. Referensi kelompok stok membantu penelusuran dan rasio, tidak otomatis mengganti metode modal menjadi per lot atau FIFO.

## 3. Tahap A — Tetapkan kontrak data dan konversi

Hasil tahap ini: satu kontrak pengukuran untuk seluruh modul dan daftar migrasi yang dapat ditinjau.

- Rancang pasangan berat kg dan jumlah pendamping, berikut satuan jumlah, sumber setiap ukuran, serta identitas kelompok stok bila diketahui.
- Bedakan sumber: ditimbang/dihitung, dokumen supplier, dan estimasi. Angka tidak diketahui disimpan kosong; jangan disamakan dengan nol.
- Simpan snapshot rasio, asal rasio, nilai sebelum/sesudah pembulatan, dan ukuran mana yang menjadi input petugas pada transaksi.
- Urutan rasio: pasangan diketahui pada kelompok stok terpilih; kemudian rasio produk/varian yang disetel usaha. Jika barang tercampur, jangan menggunakan rasio kelompok kecil untuk seluruh campuran.
- Hitung rata-rata pasangan aktual dari total berat dibagi total jumlah yang lengkap dan relevan. Data estimasi tidak dipakai untuk menghasilkan pembelajaran rasio aktual.
- Utamakan ukuran yang diedit petugas. Pasangan yang masih estimasi boleh ikut berubah; angka yang sudah ditimbang/dihitung tidak ditimpa otomatis.
- Gunakan presisi kg yang sudah dipakai proyek dan jumlah bulat sesuai satuan. Tetapkan pembulatan estimasi secara konsisten di server dan tampilan. Jangan mengubah angka untuk diam-diam menghabiskan selisih stok.
- Definisikan status saldo per ukuran: diketahui lengkap, mengandung estimasi, atau belum lengkap. Jumlah keluar yang dihitung tidak membuat saldo awal perkiraan berubah menjadi saldo pasti.

## 4. Tahap B — Migrasi dan posting server

Hasil tahap ini: seluruh dampak stok, jumlah, koreksi, dan nilai tersimpan konsisten dalam satu transaksi database.

- Tambahkan struktur baru secara bertahap tanpa menghapus kolom atau kontrak lama yang masih dipakai aplikasi terpasang.
- Tentukan penyimpanan pendamping yang tertaut ke gerakan kg atau satu identitas kejadian stok. Jangan membuat kg dan pcs menjadi dua pembebanan nilai persediaan.
- Sediakan referensi penerimaan/produksi dan tanggal kelompok stok. Referensi yang tidak diketahui tetap kosong atau masuk kelompok saldo lama; jangan menciptakan ketepatan lot palsu.
- Untuk lokasi kandang/freezer, gunakan metadata lokasi kejadian pada tahap awal. Jika akan menampilkan saldo tersedia per lokasi, implementasikan pula transfer dan saldo lokasi; metadata saja tidak boleh diklaim sebagai kontrol saldo lokasi.
- Perbarui RPC penerimaan, posting operasi, retur, pembatalan/penggantian, dan penyesuaian agar menerapkan kontrak pengukuran yang sama.
- Pertahankan pembatasan akses dan RLS. Peran pencatat, peninjau, dan pemfinal kehilangan mengikuti alur otorisasi proyek; jangan memperluas hak hanya agar UI mudah dibuat.
- Validasi kg dan jumlah yang lengkap pada server dengan penguncian konsisten dan pemeriksaan ulang sebelum commit. Jumlah estimasi/tidak lengkap memerlukan peringatan sesuai status, bukan klaim kontrol fisik pasti.
- Pastikan pengiriman yang hanya mencatat realisasi tidak kembali mengurangi stok yang telah diposting penjualan.
- Pertahankan idempotensi finalisasi: pengiriman formulir ulang tidak menciptakan gerakan stok, kerugian, atau pembayaran kedua.

Objek yang perlu ditelusuri saat implementasi: `stock_movements`, `stock_balances`, `stock_history`, `operation_items`, penerimaan pembelian, `delivery_events`, `save_operation_internal`, `move_stock`, pembatalan/transaksi pengganti, serta view/RPC rekap terkait.

## 5. Tahap C — Kehilangan stok dan koreksinya

Hasil tahap ini: pencatatan praktis ayam mati dan barang dibuang, dengan jejak koreksi dan nilai kerugian yang dapat ditelusuri.

- Form berisi tanggal kejadian, produk/varian, referensi stok bila tersedia, lokasi, alasan, kg dan/atau jumlah, serta catatan/bukti opsional.
- Alasan dibedakan: mati saat bongkar, mati di kandang, rusak/tidak layak, melewati batas simpan internal, dan selisih stok lainnya.
- Jika petugas mengisi 3 ekor dan memilih kelompok dengan rasio 2 kg/ekor, tawarkan 6 kg estimasi. Tampilkan rasio serta dampak stok sebelum konfirmasi; tidak perlu tombol tambahan untuk sekadar menghitung.
- Jika kemudian ditimbang 5,4 kg, koreksi kejadian asal. Selisih 0,6 kg dan dampak nilainya direkonsiliasi tanpa menambah kematian atau pengurangan kedua.
- Integrasikan kehilangan dengan `stock_valuation`, `stock_result`, `rebuild_stock_valuation`, ringkasan laba, dan laporan keuangan yang sudah ada. Pastikan kehilangan bukan penjualan atau pengeluaran kas baru, dan nilai yang sama tidak kembali menjadi HPP barang tersisa.
- Pertahankan penanda modal belum lengkap. Jangan menyatakan kerugian Rp0 jika nilai modal atau pengukuran belum tersedia.
- Perubahan estimasi yang memengaruhi transaksi berikutnya mengikuti mekanisme rekalkulasi/koreksi proyek, dengan jejak perubahan dan pemeriksaan periode yang terpengaruh.
- Batas simpan freezer dapat diatur per produk. Umur dihitung dari tanggal produksi/masuk yang relevan dan diketahui; tampilkan pengingat. Tidak ada penghapusan otomatis hanya karena melewati tiga hari.

## 6. Tahap D — Sambungkan semua antarmuka

| Bagian | Perubahan |
| --- | --- |
| Data produk | Satuan jumlah, varian ukuran, rasio perkiraan, kebijakan estimasi dan batas simpan |
| Pembelian/penerimaan | Sumber kg dari supplier atau timbang ulang, jumlah opsional, referensi kelompok penerimaan |
| Produksi | Pasangan kg/jumlah pada bahan dan setiap produk hasil; rasio hasil terpisah dari bahan |
| Stok/detail/riwayat | Kg serta jumlah dengan penanda kualitas dan jejak gerakan/koreksi |
| Kehilangan stok | Form mati/dibuang dan riwayat kejadian |
| Penjualan | Ukuran pendamping, dasar harga jelas, perhitungan total sekali |
| Pengiriman | Pasangan ukuran realisasi dan sisa pengiriman, tanpa gerakan stok ganda |
| Retur/koreksi/opname | Batas terhadap sisa transaksi asal dan rekonsiliasi dua ukuran |
| Invoice/SJ/struk | Kedua ukuran jika tersedia, tanda perkiraan, satuan harga konsisten; SJ tanpa harga |
| Rekap/dashboard/ekspor | Pisahkan jumlah lengkap, perkiraan, dan parsial; kerugian masuk satu kali |

Gunakan komponen proyek `Dropdown`, `NumberInput`, dan `DatePicker`. Pilihan ukuran hanya muncul bila relevan. Isian pendamping tetap ringkas, estimasi diberi keterangan di dekat angka, dan perhitungan otomatis tidak menimpa data yang sudah diisi sebagai aktual.

Pada produksi, jangan menjumlahkan karkas, kepala, kaki, dan set jeroan sebagai jumlah ayam. Usulan resep jumlah seperti satu karkas per ayam adalah estimasi yang dapat diubah, bukan bukti hasil aktual. Kg/jumlah tiap produk diperiksa dalam konteks produknya sendiri.

## 7. Tahap E — Transisi data lama

- Ambil ringkasan awal tiap instalasi: saldo kg per produk/varian, persediaan, piutang/hutang, kas, status modal, dan laba/kerugian terkait stok.
- Migrasi tambahan tidak mengubah nilai atau saldo kg transaksi historis dan tidak mengisi jumlah historis dengan angka tebakan.
- Tetapkan tanggal mulai pencatatan pendamping. Kelompok stok lama diberi status belum diketahui; tanggal produksi freezer yang tidak tersedia tidak diambil dari tanggal migrasi.
- Bila dilakukan hitung fisik, buat penetapan jumlah bertanggal dengan audit. Perbedaan kg fisik dicatat melalui penyesuaian yang sah.
- Jika usaha memilih saldo awal jumlah perkiraan, konfirmasikan rasio dan simpan sebagai estimasi. Jangan menampilkannya sebagai hasil opname aktual.
- Untuk kehilangan lama yang sudah ditangani melalui penyesuaian, tautkan/identifikasi asalnya agar tidak dibukukan lagi sebagai kehilangan baru.

## 8. Tahap F — Pengujian dan kriteria lulus

Pengujian database dan alur lengkap harus membuktikan:

1. Masuk 1.000 kg dari supplier tetap menjadi tagihan penuh; jumlah boleh belum diketahui.
2. Varian kecil dan besar memakai rasio masing-masing; campuran tidak otomatis mengambil salah satunya.
3. Mati 3 ekor menghasilkan saran kg sesuai snapshot rasio; perubahan rasio kemudian tidak mengubah transaksi tersebut.
4. Koreksi 6 kg perkiraan menjadi 5,4 kg mengembalikan selisih 0,6 kg tanpa menggandakan jumlah mati, kas, atau kerugian.
5. Produksi beberapa produk tidak menciptakan stok atau nilai ganda; jumlah bahan tidak dijumlahkan dengan seluruh jumlah hasil.
6. Penjualan kg dengan jumlah pendamping dan penjualan per jumlah dengan kg pendamping menghasilkan harga dan pengurangan yang benar, termasuk diskon dan retur parsial/penuh.
7. Pengiriman tidak mengurangi stok dua kali. Pembatalan, penggantian, dan opname merekonsiliasi kedua ukuran beserta kualitas datanya.
8. Penjualan/kehilangan bersamaan tidak melewati saldo yang dikontrol; finalisasi ulang tidak menggandakan gerakan.
9. Rekap tidak menyebut jumlah parsial atau estimasi sebagai jumlah aktual lengkap. Nilai modal yang belum lengkap tetap ditandai.
10. Barang freezer yang melewati batas simpan hanya memberi pengingat sampai pembuangan dicatat; tanggal tidak diketahui tidak menghasilkan umur palsu.
11. Invoice, SJ, struk 58 mm, ekspor, dan form ponsel/laptop menampilkan ukuran serta satuan yang benar.
12. Hak akses tetap sesuai, dan demo serta klien tidak saling memakai data, konfigurasi, atau tujuan migrasi.

Jalankan pengujian regresi transaksi, valuasi, koreksi, dan konkurensi yang relevan; browser untuk alur baru dan dokumen; lint, TypeScript, serta build secara berurutan jika menyentuh keluaran tipe yang sama.

## 9. Tahap G — Rilis bertahap

- Tahap A–F diselesaikan sebagai perubahan yang dapat ditinjau sebelum penerapan ke klien.
- Terapkan migrasi yang kompatibel terlebih dahulu ke demo, uji dengan data simulasi termasuk data lama, lalu aktifkan UI demo.
- Periksa selisih saldo dan nilai terhadap baseline. Migrasi struktur saja harus mempertahankan saldo/nilai awal; kejadian baru harus dapat direkonsiliasi.
- Siapkan cadangan dan rencana pemulihan. Setelah transaksi baru memakai struktur baru, jangan menghapus kolom atau mengembalikan aplikasi lama secara buta; gunakan penonaktifan fitur yang kompatibel atau perbaikan maju yang telah ditinjau.
- Rilis klien mengikuti otorisasi rilis yang berlaku, setelah demo lulus. Pastikan target environment, Worker, dan Supabase masing-masing sebelum migrasi/deploy.
- Verifikasi migrasi, RPC, izin, schema cache, hasil deployment, dan contoh transaksi pada instalasi tujuan. Pemantauan error harus aktif.

## 10. Batas pekerjaan saat perencanaan

Dokumen ini mencatat rencana yang menjadi acuan implementasi tahap pertama. Perubahan error Cloudflare dan dokumen penjualan yang sudah ada di working tree tetap perlu ditinjau tersendiri saat commit/rilis.

Rujukan kebutuhan dan alasan bisnis: [kajian kg dan jumlah](kajian-kg-dan-jumlah.md).
