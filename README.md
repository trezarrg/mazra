# Sistem Usaha Ayam Potong

Acuan produk: `PRD_Sistem_Usaha_Ayam_Potong.md`. Progres ada di `task.md`.

1. Jalankan `npm install`.
2. Salin `.env.example` menjadi `.env.local`, lalu isi URL dan publishable/anon key proyek Supabase Cloud. Jangan memasukkan service-role key.
3. Jalankan `npm run dev`.

Login memakai akun Supabase Auth yang dibuat administrator. Pendaftaran publik dinonaktifkan pada proyek demo Supabase. Migrasi di `supabase/migrations`, termasuk HPP rata-rata stok, pengingat tagihan dan pemisahan developer sampai `20261106000100`, telah diterapkan pada proyek demo `vcephhquqtppxuvypeft` dan klien `wgdjtmdomseqhzgatbsk`. Akun developer digunakan untuk akses penuh dan tidak tampil dalam daftar tim operasional. Pengguna tanpa profil aktif tidak memiliki akses ke data melalui RLS. Docker dan Supabase lokal tidak diperlukan.

Untuk demonstrasi Rizki Farm, nama pengguna `owner` adalah alias sementara untuk akun `owner@example.invalid`; akun lain masuk dengan email. Akun demo memiliki akses Owner ke data usaha dan harus dinonaktifkan setelah demonstrasi. Jangan gunakan alias atau akun demo ini untuk instalasi pelanggan lain.

Aplikasi mencakup DO/penerimaan, timbang lapangan, hasil potong, stok kg, penjualan/pengiriman/retur, hutang/piutang, pembayaran kas/bank, buku keuangan, SDM/kasbon, aset, dashboard, riwayat, ekspor dan bukti privat. Invoice penjualan dapat diterbitkan dengan pembayaran awal Rp0 dan dikirim sebelum pembayaran. Dashboard memisahkan tagihan terlambat, hari ini dan besok, serta menghitung HPP, laba kotor dan profit usaha sebelum pajak/penyusutan. Modal yang belum diketahui ditandai belum lengkap.

Alur penggunaan, pengujian, backup/restore, dan prasyarat sebelum produksi ada di [docs/operasional.md](docs/operasional.md). Status implementasi dan pekerjaan sebelum go-live ada di [task.md](task.md).

## Cloudflare Workers

Aplikasi disiapkan untuk Workers menggunakan vinext. Gunakan Node.js 24.22 atau lebih baru dalam lini 24, lalu jalankan `npm ci`. Untuk deploy dari komputer, isi `.env.local` dengan dua nilai Supabase yang sama seperti di atas, masuk dengan `npx cf auth login`, lalu jalankan `npm run deploy:vinext`. Perintah ini membangun dan menerbitkan Worker bernama `mazra` pada akun Cloudflare yang dipilih.

Rilis bersama dikelola GitHub Actions pada repositori `trezarrg/mazra`: push kode ke `main` membangun dan memigrasikan demo dahulu, lalu seluruh klien jika demo berhasil. Tiap instalasi memakai GitHub Environment dan build Supabase terpisah. Pages gateway klien ikut diterbitkan. Pemicu Workers Builds demo lama dinonaktifkan untuk menghindari rilis ganda. Detail ada pada [panduan instalasi](docs/instalasi-klien.md).

Pratinjau lokal: `npm run build:vinext` lalu `npm run start:vinext`. Sebelum digunakan, uji login, akses setiap peran, transaksi, ekspor dan unggah/unduh bukti pada URL Workers, serta periksa pengaturan URL autentikasi Supabase dan backup sesuai panduan operasional. Pemeriksaan kompatibilitas otomatis tidak menggantikan pengujian tersebut.

## Penggunaan untuk usaha lain

Satu repositori mendukung beberapa instalasi dengan proyek Supabase dan Worker terpisah. Target dicatat di `deployments/clients.json`; nama dan logo aplikasi mengikuti konfigurasi build tiap instalasi. Panduan instalasi, pengaturan kredensial, serta rilis bersama ada di [docs/instalasi-klien.md](docs/instalasi-klien.md).

Gunakan `npm run clients:database` untuk menyiapkan migrasi instalasi klien tanpa ketergantungan akun developer demo, kemudian buat pemilik pertama melalui `deployments/bootstrap-owner.sql`. Migrasi historis tidak diubah dan transaksi demo tidak disalin. Instalasi baru tetap harus diverifikasi pada proyek tujuan. Jangan menjalankan skrip uji demo pada database pelanggan. Workflow `Rilis aplikasi klien` menyediakan rilis demo terlebih dahulu, lalu rilis seluruh klien dari commit yang sama setelah pengaturan GitHub Environments selesai.
