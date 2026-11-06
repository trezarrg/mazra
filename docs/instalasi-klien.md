# Satu kode, database terpisah

Sumber aplikasi tetap repositori ini. Setiap instalasi mempunyai Worker Cloudflare, proyek Supabase, akun pengguna, dan pengaturan rilis sendiri. Transaksi demo tidak disalin. Tidak perlu membuat cabang kode khusus klien.

Target yang telah dicatat dalam `deployments/clients.json`:

| Instalasi | Worker | Supabase | GitHub Environment |
|---|---|---|---|
| Demo | mazra | vcephhquqtppxuvypeft | demo |
| Rizki Berkah Abadi Farm | rizki-berkah-abadi | wgdjtmdomseqhzgatbsk | rizki-berkah-abadi |

Pencatatan target belum berarti database telah dipasang atau aplikasi sudah diterbitkan. Database klien harus diperiksa dan instalasi pertamanya diverifikasi sebelum digunakan.

Status 6 November 2026: proyek klien telah diverifikasi kosong dan 45 migrasi sampai `20261106000100_developer_visibility` berhasil diterapkan. Akun developer `trezarrg@gmail.com` sudah dibuat dan login/akses pengelolanya terverifikasi; owner klien belum dibuat. Kredensial hanya berada di `artifacts/client-access/rizki-berkah-abadi/developer-login.txt` (diabaikan Git). Aplikasi klien telah dirilis secara langsung ke Worker `rizki-berkah-abadi`, dengan Pages gateway di **https://rizkiberkahabadi.pages.dev**. Login, sesi, dashboard dan logout melalui Pages telah diuji. Kode sudah dipush dan rilis demo ? klien telah berhasil melalui GitHub Actions; lihat `docs/status-penyerahan.md`. `.env.local` demo dan tautan Supabase utama workspace tetap memakai proyek demo.

Untuk membuka instalasi klien secara lokal tanpa mengganti demo, gunakan `npm run dev:client -- rizki-berkah-abadi` lalu buka `http://localhost:3002`. Perintah ini memuat `.env.rizki-berkah-abadi.local` dan memeriksa URL/kunci terhadap daftar instalasi sebelum memulai server. Berkas konfigurasi lokal ini diabaikan Git.

Developer mempunyai akun Auth dan profil teknis untuk login serta audit, tetapi tidak tampil pada Tim & akses maupun pilihan operasional. RLS juga menyembunyikan profil developer dari pembacaan owner/admin. Owner tidak dapat mengubah akses developer. ID pelaku tetap dicatat dalam audit; akun developer tidak dibuat menjadi owner usaha, sopir, atau pekerja. Akses administrator Supabase Dashboard berada di luar RLS aplikasi.

Untuk instalasi berikutnya yang memerlukan developer, buat akun Auth terpisah dan jalankan `deployments/bootstrap-developer.sql` sebagai administrator. Skrip ini hanya mengaktifkan developer untuk email yang ditentukan dan menolak mengambil alih profil operasional. Bootstrap owner mengizinkan profil developer sudah ada, tetapi tetap menolak bila profil operasional atau transaksi telah tercatat. Password developer tidak digunakan sebagai password owner.

## Identitas usaha

Nama dan logo tampilan login/navigasi dibakukan saat build melalui `NEXT_PUBLIC_BUSINESS_NAME` dan `NEXT_PUBLIC_BUSINESS_LOGO`. Workflow mengisinya dari daftar instalasi. Gunakan berkas logo dalam `public/`; instalasi baru mendapat logo netral jika tidak ditentukan. Nama, alamat, dan telepon pada dokumen transaksi berasal dari Data master > Identitas usaha pada database masing-masing. Isi identitas itu saat pemasangan awal.

Alias login `owner` dibatasi pada demo atau `DEMO_LOGIN_EMAIL` yang sengaja diisi. Klien memakai email akun sendiri. Jangan menyalin akun atau kata sandi demo.

## Instalasi database pertama

1. Pastikan proyek Supabase milik klien benar-benar baru/khusus aplikasi ini. Periksa tidak ada tabel, transaksi, profil aplikasi, dan saldo usaha sebelumnya. Jangan reset database yang sudah berisi data.
2. Pastikan akun Supabase CLI memiliki akses proyek klien. Jalankan `npm run clients:database`. Skrip menghasilkan salinan migrasi di `artifacts/client-release/supabase/migrations`; tautan Supabase utama workspace tidak berubah.
3. Hubungkan folder itu: `supabase link --project-ref wgdjtmdomseqhzgatbsk --workdir artifacts/client-release`. Gunakan penyimpanan kredensial CLI atau environment rahasia; jangan memasukkan password ke Git.
4. Tinjau `supabase db push --linked --dry-run --workdir artifacts/client-release`, lalu terapkan `supabase db push --linked --workdir artifacts/client-release` setelah target dipastikan benar. Tidak ada impor transaksi demo dan tidak memakai `--include-seed`.
5. Nonaktifkan signup publik. Jika developer sudah dapat login aplikasi, buka **Data utama → Pengguna → Tambah** untuk membuat akun Owner dengan nama pribadi, email dan password awal. Tidak perlu membuka dashboard Supabase. `deployments/bootstrap-owner.sql` tetap tersedia sebagai alternatif administrator untuk instalasi awal tanpa sesi developer.
6. Isi alamat/telepon, periksa satuan dan produk awal, lalu tambahkan saldo awal hanya sesuai data klien. Foundation menyediakan katalog produk umum, Pelanggan Umum, Kas Kantor, dan kategori standar; tidak membawa saldo atau transaksi.
7. Atur Site URL dan redirect URL autentikasi sesuai alamat aplikasi, siapkan backup, lalu periksa login, pembatasan akses, penerimaan, penjualan, pembayaran dan bukti privat pada instalasi baru.

Adapter instalasi hanya menghilangkan penetapan akun pribadi pada salinan `20261029000300_developer_role.sql`. Definisi aksesnya tetap sama. Migrasi historis asli tidak diubah. Versi migrasi tetap sama sehingga pembaruan berikutnya menerapkan versi baru saja. Bila migrasi sumber itu berubah bentuk, generator berhenti untuk ditinjau. Jangan menjalankan seluruh migrasi asli dari nol pada klien, karena migrasi akun demo itu memang khusus pemasangan lama.

## Hosting Cloudflare

Aplikasi memiliki Server Actions, autentikasi server dan ekspor; proses server menggunakan **Workers** dengan vinext. Untuk alamat Pages tanpa nama akun, klien ini memakai Pages Advanced Mode sebagai gateway melalui service binding `APP` menuju Worker khusus klien. Gateway meneruskan request/response secara utuh; cookie dan Server Actions tetap pada origin Pages. Sumbernya `deployments/pages-gateway.mjs`; penerbitannya `scripts/deploy-pages-gateway.mjs`. Upload statis aplikasi saja tidak cukup. Domain sendiri dapat ditambahkan kemudian.

Pages project `rizkiberkahabadi` terikat ke Worker `rizki-berkah-abadi`, bukan `mazra`. Nama akun Cloudflare tetap akun pengelola saat ini, tetapi alamat publik klien dan databasenya terpisah dari demo. Ini bukan pemindahan kepemilikan akun Cloudflare. Pages dan Worker harus berada pada akun yang sama untuk service binding ini.

Site URL Supabase klien telah disetel ke `https://rizkiberkahabadi.pages.dev`, redirect lokal port 3002 diizinkan, dan signup publik dinonaktifkan. Konfigurasi Auth yang sesuai disimpan di `deployments/rizki-berkah-abadi.supabase.toml`. Pemasangan akun dilakukan administrator, tidak melalui signup publik. Jangan mendorong konfigurasi CLI minimal/default ke proyek produksi karena dapat mengubah pengaturan Auth lain.

Untuk pembaruan banyak klien, gunakan workflow GitHub berikut sebagai pengelola rilis. Jangan sekaligus mengaktifkan Workers Builds otomatis ke Worker yang sama; dua jalur rilis dapat saling menimpa. Konfigurasi Workers Builds demo lama perlu ditinjau sebelum menggantinya. Konfigurasi build klien tidak boleh memakai `.env.local` demo.

## Pengaturan rilis bersama

Buat GitHub Environments `demo` dan `rizki-berkah-abadi`. Isi pada **masing-masing** environment:

| Jenis | Nama | Isi |
|---|---|---|
| Variable | NEXT_PUBLIC_SUPABASE_URL | URL proyek instalasi tersebut |
| Variable | CLOUDFLARE_ACCOUNT_ID | Akun Cloudflare tempat Worker instalasi |
| Secret | NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Publishable key atau JWT anon proyek tersebut |
| Secret | SUPABASE_ACCESS_TOKEN | Token akun yang boleh mengelola proyek tujuan |
| Secret | CLOUDFLARE_API_TOKEN | Token untuk merilis Worker serta Pages Read/Write pada akun tujuan bila memakai gateway |

Jangan gunakan Supabase service-role/secret key sebagai kunci aplikasi. Daftar instalasi tidak berisi kredensial. Token database dan Cloudflare hanya tersedia bagi proses rilis; tidak ditanam dalam aplikasi. Nama Worker, project ref, environment dan logo diperiksa sebelum build. Nama Worker, database, serta environment tidak boleh dipakai bersama oleh dua instalasi.

GitHub Environments `demo` dan `rizki-berkah-abadi` sudah diisi. CLI menggunakan token Management API untuk koneksi database sementara, tanpa menyimpan password database di workflow. Token Cloudflare rilis dibatasi ke Worker/Pages pada akun tujuan dan berlaku sampai 6 November 2027; rotasi secret sebelum kedaluwarsa.

Push perubahan kode ke `main` menjalankan rilis otomatis. Workflow juga dapat dipicu manual. Demo wajib berhasil pada commit yang sama sebelum pekerjaan rilis klien dimulai. Kegagalan demo menghentikan rilis klien. Perubahan yang hanya menyentuh `docs/`, README, atau AGENTS tidak menerbitkan ulang aplikasi.

## Mengirim pembaruan

1. Simpan perubahan dalam commit yang akan dirilis dan push ke `main`. Workflow **Rilis aplikasi klien** berjalan otomatis. Untuk menjalankan manual, pilih `all` (demo lalu semua klien) atau `demo` saja.
2. Workflow membangun aplikasi dengan konfigurasi demo, memeriksa tipe, meninjau/menerapkan migrasi lalu merilis Worker. Jika `pagesProject` dikonfigurasi, workflow juga merilis gateway Pages dan memeriksa status publikasinya. Periksa alur penting pada URL demo.
3. Setelah demo berhasil, workflow memperbarui semua klien aktif pada commit yang sama. Klien dirilis satu per satu, masing-masing dengan build dan database sendiri. Tambah klien berikutnya melalui daftar instalasi dan environment baru, tanpa menggandakan kode aplikasi.
4. Jika suatu migrasi/build/deploy gagal, lihat job instalasi yang gagal. Klien yang sudah berhasil tidak otomatis dibatalkan. Selesaikan penyebabnya dan jalankan ulang job yang gagal; migrasi yang sudah tercatat tidak diterapkan ulang.

Migrasi dilakukan sebelum publikasi aplikasi. Migrasi yang sudah berhasil tidak otomatis di-rollback jika publikasi gagal, sehingga perubahan skema mendatang harus tetap kompatibel dengan aplikasi sebelumnya. Untuk perubahan yang menghapus/mengganti kontrak, lakukan bertahap: tambahkan kontrak baru, rilis semua aplikasi, baru bersihkan kontrak lama pada rilis berikutnya. Pastikan backup tersedia sebelum migrasi produksi.

Menonaktifkan `enabled` hanya mengeluarkan instalasi dari rilis bersama; tidak mematikan Worker dan tidak menghapus datanya. Jangan menjalankan skrip pengujian transaksi demo terhadap database klien.

## Pembuatan akun di aplikasi

Developer dan Owner dapat membuat akun langsung melalui Tim & akses. Formulir membuat akun Auth serta profil/perannya, dengan password awal minimal 10 karakter. Pilihan Developer tidak tersedia. Akun yang emailnya sudah terdaftar tidak diambil alih atau direset passwordnya; tersedia pilihan terpisah untuk menambahkan akses akun yang sudah ada.

Proses administratif berjalan dalam Supabase Edge Function `create-team-user`. Kunci service-role hanya memakai secret bawaan lingkungan Edge Function, tidak dimasukkan ke aplikasi/Worker/browser. Fungsi memverifikasi JWT dengan Auth dan mengecek peran aktif sebelum membuat akun. Jika pemasangan profil gagal, hanya akun Auth baru dari permintaan itu yang dibersihkan; jika pembersihan tidak berhasil, UI meminta pengelola memasang akses pada akun yang sudah dibuat. Pendaftaran publik tetap dinonaktifkan. Fungsi dipasang oleh workflow sebelum aplikasi yang memakainya.
