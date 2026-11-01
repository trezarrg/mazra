# Sistem Usaha Ayam Potong

Acuan produk: `PRD_Sistem_Usaha_Ayam_Potong.md`. Progres ada di `task.md`.

1. Jalankan `npm install`.
2. Salin `.env.example` menjadi `.env.local`, lalu isi URL dan publishable/anon key proyek Supabase Cloud. Jangan memasukkan service-role key.
3. Jalankan `npm run dev`.

Login memakai akun Supabase Auth yang dibuat administrator. Pendaftaran publik dinonaktifkan pada proyek Supabase. Migrasi di `supabase/migrations`, termasuk operasional sampai `20261031001200`, telah diterapkan pada proyek `vcephhquqtppxuvypeft`. Akun developer digunakan untuk akses penuh. Pengguna tanpa profil aktif tidak memiliki akses ke data melalui RLS. Docker dan Supabase lokal tidak diperlukan.

Aplikasi mencakup DO/penerimaan, timbang lapangan, produksi/konversi, penjualan/pengiriman/retur, hutang/piutang, pembayaran, kas penagih/setoran, buku keuangan, SDM/kasbon, aset, dashboard, riwayat, ekspor dan bukti privat. Laporan akuntansi menandai prasyarat HPP/valuasi dan saldo awal yang belum disahkan.

Alur penggunaan, pengujian, backup/restore, dan prasyarat sebelum produksi ada di [docs/operasional.md](docs/operasional.md). Status implementasi dan pekerjaan sebelum go-live ada di [task.md](task.md).

## Cloudflare Workers

Aplikasi disiapkan untuk Workers menggunakan vinext. Gunakan Node.js 24.22 atau lebih baru dalam lini 24, lalu jalankan `npm ci`. Untuk deploy dari komputer, isi `.env.local` dengan dua nilai Supabase yang sama seperti di atas, masuk dengan `npx cf auth login`, lalu jalankan `npm run deploy:vinext`. Perintah ini membangun dan menerbitkan Worker bernama `mazra` pada akun Cloudflare yang dipilih.

Untuk Workers Builds, hubungkan repositori ke Cloudflare dan gunakan `npm run build:vinext` sebagai build command serta `npm run deploy:vinext` sebagai deploy command. Atur `NODE_VERSION` ke versi Node 24.22 atau lebih baru, serta isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pada variabel lingkungan build. Kedua nilai ini bersifat publik dan disertakan dalam hasil build; jangan gunakan service-role key. Lakukan build ulang setiap kali nilainya berubah. Pastikan repositori dan akun Cloudflare yang dipilih memang milik proyek ini.

Pratinjau lokal: `npm run build:vinext` lalu `npm run start:vinext`. Sebelum digunakan, uji login, akses setiap peran, transaksi, ekspor dan unggah/unduh bukti pada URL Workers, serta periksa pengaturan URL autentikasi Supabase dan backup sesuai panduan operasional. Pemeriksaan kompatibilitas otomatis tidak menggantikan pengujian tersebut.

## Penggunaan untuk usaha lain

Repositori ini menyimpan versi Rizki Farm sebagai dasar, bukan template yang langsung siap dipasang untuk usaha lain. Untuk setiap pelanggan, gunakan proyek Supabase, akun pengguna, konfigurasi lingkungan dan Worker yang terpisah; jangan gunakan database atau kunci Rizki Farm. Sesuaikan nama, logo, dan identitas usaha sebelum publikasi.

Migrasi historis `20261029000300_developer_role.sql` mengharuskan profil developer tertentu sudah ada dan migrasi lain berasal dari kondisi database Rizki Farm. Tinjau dan siapkan migrasi khusus instalasi baru, termasuk akses administrator pertama, sebelum menerapkannya pada database pelanggan. Jangan menjalankan skrip uji yang menargetkan proyek Rizki Farm terhadap database pelanggan tanpa penyesuaian dan pemeriksaan target.
