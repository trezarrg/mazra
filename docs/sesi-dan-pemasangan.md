# Sesi masuk dan pemasangan perangkat

## Penggunaan

Login disimpan pada browser/perangkat yang digunakan dan tokennya diperbarui otomatis. Menutup lalu membuka browser tidak memerlukan login ulang selama sesi masih valid dan data browser tidak dihapus. Membuka alamat `/login` dengan sesi aktif mengarah kembali ke aplikasi. Tombol Keluar mengakhiri sesi browser/perangkat tersebut, bukan seluruh perangkat pengguna.

Sesi yang pernah dicabut melalui logout global sebelumnya tidak dapat dipulihkan; login sekali lagi untuk membuat sesi baru. Password/perubahan keamanan, akun yang dinonaktifkan, atau penghapusan data browser tetap dapat memerlukan login ulang. Pengaturan Supabase demo dan klien tidak memakai batas durasi/inaktivitas maupun satu sesi per pengguna; JWT tetap berumur pendek dan refresh-token rotation tetap aktif.

Buka aplikasi dari alamat HTTPS masing-masing, lalu pilih **Pasang aplikasi** di halaman masuk atau **Lainnya**. Chrome/Edge dapat menampilkan dialog pemasangan langsung. Pada iPhone/iPad, buka melalui Safari, pilih Bagikan lalu Tambahkan ke Layar Utama. Setelah dipasang, aplikasi dibuka dari ikon perangkat dalam tampilan mandiri. Dukungan menu mengikuti browser/perangkat; tidak memerlukan paket APK atau publikasi App Store.

Pencatatan dan pembacaan transaksi tetap membutuhkan internet. Ketika offline, aplikasi menampilkan halaman koneksi; tidak mengantrekan atau mengirim ulang transaksi otomatis. Sesi tidak dihapus karena koneksi terputus.

## Implementasi

- Logout memakai `scope: local`. Pengujian tidak boleh memanggil logout global pada akun yang juga dipakai pengguna aktif.
- Cookie sesi memiliki Path `/`, SameSite Lax, Secure pada produksi, serta umur bergulir 400 hari (terbatas kebijakan browser). Tidak ada pelemahan pemeriksaan JWT atau pembatasan RLS.
- Proxy meneruskan cookie hasil pembaruan beserta header cache dari Supabase. Respons halaman akun memakai private/no-store. Aset publik dan manifest tidak memicu pembaruan sesi.
- Klien browser menjaga pembaruan token ketika aplikasi aktif dan memeriksa sesi saat kembali ke tab/perangkat. Gangguan sementara Auth/profil tidak diarahkan sebagai logout; error halaman menawarkan coba lagi. Akun tidak aktif tetap ditolak.
- Manifest `/manifest.webmanifest` memakai nama usaha. Ikon PNG 192/512, maskable dan Apple dihasilkan saat dev/build dari logo bawaan instalasi menggunakan Sharp; file hasilnya tidak dimasukkan ke Git. Logo khusus di pengaturan tetap dipakai untuk halaman masuk/navigasi/dokumen; ikon pemasangan menggunakan logo bawaan build.
- Service worker `/sw.js` hanya menyimpan halaman offline dan ikon publik. Tidak menyimpan halaman dashboard, transaksi, API, respons autentikasi, atau token di Cache Storage. Permintaan POST tidak ditangani/diantrekan service worker.
- Rilis memeriksa manifest, ukuran ikon, service worker dan autentikasi pada URL publik setelah deploy. Pengujian sesi/perangkat memakai profil browser terpisah dan logout lokal agar tidak memutus sesi pengguna lain.
