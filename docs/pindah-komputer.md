# Panduan pindah komputer — 6 November 2026

## Kondisi yang perlu diketahui

- Banyak perubahan terbaru masih lokal, belum commit/push. Clone repositori saja belum memuat seluruh pekerjaan terbaru. Bawa paket kode terbaru atau salin folder sumber lengkap.
- Demo tetap menggunakan Supabase `vcephhquqtppxuvypeft` dan Worker `mazra`. Migrasi sampai `20261105001700` sudah diterapkan ke demo.
- Klien Rizki Berkah Abadi Farm ditujukan ke Supabase `wgdjtmdomseqhzgatbsk` dan Worker rencana `rizki-berkah-abadi`. Database klien belum dipasang/terverifikasi; proyek belum terlihat dari login CLI komputer asal.
- Konfigurasi banyak klien, 44 migrasi portable, bootstrap pemilik pertama, dan workflow GitHub sudah tersedia. Tes konfigurasi, lint terarah, typecheck dan build lulus.
- Belum ada push/deploy klien. Jangan menganggap aplikasi klien sudah tayang.

## Sebelum berangkat

1. Salin ZIP `ayam-potong-pindah-komputer-2026-11-06.zip` dari `artifacts/handoff/` ke flashdisk atau penyimpanan pribadi yang bisa dibuka dari komputer tujuan. Pastikan salinan selesai dan ZIP bisa dibuka.
2. Pastikan bisa login email/Google/GitHub yang memiliki proyek Supabase klien, repositori GitHub, serta akun Cloudflare tujuan. Siapkan ponsel/akses autentikasi dua langkah dan password manager bila digunakan. Tidak perlu menyalin sesi browser atau token dari komputer rumah.
3. ZIP berisi sumber terbaru, termasuk file baru dan perubahan belum commit. Tidak menyertakan `.git`, `.env.local`, `node_modules`, hasil build, sesi login, token CLI atau database. Transaksi tetap tersimpan di Supabase Cloud.
4. Simpan teks instruksi lanjutan di bagian akhir panduan ini. Panduan juga ikut masuk ZIP. Aplikasi coding di komputer tujuan belum tentu membuka percakapan/workspace ini secara otomatis.

## Di komputer tujuan

Gunakan Windows dengan Node.js 24 yang kompatibel proyek (README merekomendasikan 24.22 atau lebih baru dalam lini 24), Git, editor/aplikasi coding, dan koneksi internet.

Jika ingin mempertahankan riwayat Git, login GitHub lalu clone `https://github.com/trezarrg/mazra.git`. Ekstrak ZIP ke folder sementara dan salin seluruh ISI folder `ayam-potong` ke folder hasil clone, termasuk `.github`, `.gitignore` dan `.env.example`; pertahankan folder `.git` hasil clone. Paket tidak berisi `.git`, jadi tidak mengganti riwayat repo. Tinjau `git status` sebelum melakukan commit.

Alternatif: langsung ekstrak ZIP, buka folder `ayam-potong` dan lanjutkan pemasangan lokal. Cara ini belum mempunyai riwayat Git; sebelum push, gunakan clone+overlay seperti di atas. Jangan membuat repositori lain untuk tiap klien.

Buka terminal pada folder yang berisi `package.json`, lalu:

```powershell
npm ci
npx supabase login
npx supabase projects list
```

Login Supabase memakai akun pemilik proyek klien. Akun itu boleh berbeda dari akun demo; tidak perlu mengundang akun komputer rumah jika pekerjaan dilanjutkan langsung di komputer tujuan. Pastikan daftar proyek memuat `wgdjtmdomseqhzgatbsk`. Bila tidak muncul, selesaikan pemilihan akun/akses organisasi dahulu, jangan mengganti dengan proyek demo.

## Menyiapkan konfigurasi lokal klien

Salin `.env.example` menjadi `.env.local` di folder proyek. Isi:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://wgdjtmdomseqhzgatbsk.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ISI_DARI_PROYEK_KLIEN
NEXT_PUBLIC_BUSINESS_NAME=Rizki Berkah Abadi Farm
NEXT_PUBLIC_BUSINESS_LOGO=/Logo.png
APP_WORKER_NAME=rizki-berkah-abadi
DEMO_LOGIN_EMAIL=
```

Ambil publishable key (atau anon key lama) dari pengaturan API proyek Supabase klien. Jangan memakai secret/service-role key. Simpan password database di password manager atau isikan saat CLI meminta; jangan memasukkannya ke kode/Git/chat. Restart server lokal setelah mengubah `.env.local`.

## Pemasangan database

Minta agen memeriksa proyek klien sebelum menjalankan migrasi. Bila proyek kosong dan khusus aplikasi ini:

```powershell
npm run clients:database
npx supabase link --project-ref wgdjtmdomseqhzgatbsk --workdir artifacts/client-release
npx supabase db push --linked --dry-run --workdir artifacts/client-release
```

Setelah hasil dry-run dan kondisi proyek diperiksa, pemasangan menggunakan:

```powershell
npx supabase db push --linked --workdir artifacts/client-release
```

Gunakan folder `artifacts/client-release`, bukan menjalankan migrasi asli dari root untuk instalasi baru. Jangan reset atau menghapus data jika ditemukan tabel/transaksi yang sudah ada. Migrasi baru ini belum diuji pada database klien; jika muncul kegagalan, simpan pesan dan lanjutkan perbaikan dari keadaan terakhir, jangan mengulang reset.

Sesudah migrasi selesai, buat akun pemilik melalui Supabase Authentication, nonaktifkan signup publik, lalu sesuaikan dan jalankan `deployments/bootstrap-owner.sql` di SQL Editor proyek klien. Isi identitas/alamat/telepon usaha. Selanjutnya `npm run dev` untuk pemeriksaan lokal dengan akun klien. Verifikasi database dan transaksi secukupnya sebelum dipakai sungguhan; jangan menjalankan skrip tes transaksi demo pada klien.

## Penerbitan dan pembaruan berikutnya

Aplikasi menggunakan server, jadi arah hosting yang sudah disiapkan ialah Cloudflare **Workers**, bukan upload situs statis ke Pages. Alamat bawaan menggunakan `workers.dev`; domain final dapat diatur kemudian. Pengerjaan dari dashboard Cloudflare tetap memungkinkan.

Rilis bersama memakai GitHub Actions pada repositori yang sama; pengaturan GitHub Environments dan langkah detail ada di `docs/instalasi-klien.md`. Jangan aktifkan dua jalur auto-deploy ke Worker yang sama. Jangan push sebelum perubahan/migrasi dan pemicu deploy lama ditinjau, karena cabang main demo sudah mempunyai Workers Builds otomatis. ZIP ini sendiri tidak mengaktifkan publikasi apa pun.

## Teks untuk melanjutkan dengan agen di komputer tujuan

> Lanjutkan proyek ayam-potong dari docs/pindah-komputer.md dan docs/instalasi-klien.md. Saya sudah membawa sumber terbaru melalui ZIP; banyak perubahan masih belum commit/push. Klien Rizki Berkah Abadi Farm memakai Supabase wgdjtmdomseqhzgatbsk. Demo harus tetap terpisah pada vcephhquqtppxuvypeft. Periksa akses dan kondisi database klien, lalu lanjutkan instalasi 44 migrasi portable melalui artifacts/client-release dan pembuatan owner. Jangan menyalin transaksi demo. Pertahankan seluruh perubahan lokal, lakukan verifikasi proporsional dan jangan mengulang tes menyeluruh yang sudah lulus tanpa alasan. Siapkan rilis satu sumber untuk seluruh klien; jangan push/deploy sebelum konfigurasi dan pemicu rilis ditinjau. Baca AGENTS.md. Jika path skill kerja-presisi tidak tersedia di komputer baru, gunakan prinsip yang tercantum di AGENTS.md dan panduan ini, tanpa mengambil konfigurasi proyek lain.
