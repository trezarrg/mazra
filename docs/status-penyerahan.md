# Status penyerahan — 6 November 2026

## Selesai dan terverifikasi

- Alamat klien: https://rizkiberkahabadi.pages.dev.
- Database klien: Supabase `wgdjtmdomseqhzgatbsk`, terpisah dari demo `vcephhquqtppxuvypeft`.
- Sebanyak 46 migrasi diterapkan di kedua proyek. Database klien masih tanpa transaksi, gerakan stok/kas, atau akun operasional.
- Developer menggunakan akun aplikasi terpisah yang tidak tampil pada daftar tim/pilihan operasional. Owner tidak dapat mengubah developer. ID teknis pelaku tetap tercatat dalam audit.
- Login, sesi, dashboard dan logout melalui Pages sudah diuji. Signup publik klien dinonaktifkan dan Site URL Auth sesuai alamat Pages.
- Sumber kode dipush ke repositori `trezarrg/mazra`, cabang `main`. Rilis kode `1b2cbdf` berhasil melalui [GitHub Actions](https://github.com/trezarrg/mazra/actions/runs/42141658021): demo dahulu, kemudian klien. Build, typecheck, migrasi, deploy Worker, Pages gateway, pemeriksaan alamat publik/aset dan konfigurasi autentikasi berhasil.
- GitHub Environments demo dan klien telah memiliki variabel/secret terpisah. Pemicu Workers Builds demo lama dihapus agar tidak terjadi rilis ganda; konfigurasi pemulihannya disimpan lokal oleh developer.
- Perubahan kode berikutnya yang dipush ke main mengikuti alur demo → klien. Dokumentasi saja tidak menerbitkan ulang aplikasi. Secret dan berkas akses lokal tidak masuk repositori.
- Panduan klien tersedia dalam HTML mandiri pada `docs/panduan-klien.html`, Markdown pada `docs/penyerahan-rizki-berkah-abadi.md`, serta PDF lokal di `artifacts/penyerahan/Panduan-Rizki-Berkah-Abadi-Farm.pdf`.

## Ditunda sesuai permintaan pemilik proyek

Akun owner usaha belum dibuat. Email, nama pribadi dan password ditentukan saat pertemuan langsung dengan klien. Jangan menyerahkan password developer sebagai akun bersama klien. Langkah pembuatan akun terpisah sudah tercantum pada panduan instalasi dan penyerahan.

## Perlu ditetapkan sebelum transaksi rutin

API backup Supabase klien pada 6 November 2026 belum menampilkan snapshot; PITR tidak aktif. Metode backup database, file bukti dan prosedur pemulihan perlu ditetapkan. Belum ada uji restore produksi. Tidak ada reset atau penghapusan transaksi produksi yang dilakukan untuk penyerahan ini.

Sebelum pemakaian rutin, pemilik juga melengkapi alamat/telepon, akun kas/bank, supplier/pelanggan, dan saldo awal sesuai keadaan usaha. Aplikasi belum memuat saldo atau transaksi usaha klien.

## Pemeliharaan developer

Token rilis Cloudflare dibatasi ke Worker/Pages pada akun tujuan, dengan masa berlaku sampai 6 November 2027. Rotasi GitHub Environment secret sebelum kedaluwarsa. Token Supabase yang dipakai workflow mengikuti akses akun pengelola; perbarui secret jika token dicabut/diganti. Jangan memasukkan kredensial developer, token, atau file `.env.local` ke berkas penyerahan umum.

Hosting masih berada di akun Cloudflare pengelola saat ini; alamat publik dan database klien terpisah. Pemasangan ini tidak memindahkan kepemilikan akun Cloudflare/GitHub kepada klien.

Logo usaha kini dapat diganti oleh owner/developer melalui Data utama & pengaturan ? Usaha. Unggah PNG/JPG/WebP maksimal 2 MB dengan pratinjau; perubahan dipakai pada halaman masuk, navigasi dan dokumen pembelian tanpa build ulang. Logo tersimpan terpisah per proyek Supabase. Rilis `ebfc7e1` berhasil pada demo dan klien melalui https://github.com/trezarrg/mazra/actions/runs/42151997310. Pengujian upload/akses publik/CORS, larangan pengunjung, perlindungan logo aktif, pratinjau situs klien serta perubahan logo halaman masuk tanpa build ulang telah lulus; logo uji dipulihkan dan dibersihkan.
