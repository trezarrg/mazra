# Standar UI proyek

- Gunakan komponen `src/components/dropdown.tsx` untuk pilihan dropdown formulir baru. Daftar pilihan harus mengikuti gaya aplikasi dengan sudut membulat, mendukung keyboard, validasi dan penggunaan seluler.
- Pertahankan fondasi UI yang telah disetujui pengguna serta ikuti preferensi UI ERP lintas proyek.

- Gunakan `src/components/date-picker.tsx` untuk isian tanggal dengan kalender berbahasa Indonesia; nilai yang dikirim tetap tanggal ISO. Gunakan `src/components/number-input.tsx` untuk nominal dan jumlah, serta `formatDecimal` untuk tampilan angka: titik pemisah ribuan, koma desimal.
- Popup pilihan, kalender, dan komponen serupa harus tampil di lapisan teratas, menyesuaikan ruang layar, dan tidak terpotong area gulir. Gunakan pola `useFloatingPopup`.

## Redesain 31 Oktober 2026

- Jangan gunakan emoji atau emotikon di aplikasi maupun komunikasi proyek.
- Kartu angka, akses cepat, dan baris daftar mengutamakan teks; hindari ikon dekoratif berulang. Ikon tetap boleh untuk navigasi mobile, kontrol, status, dan keadaan kosong.
- Sapaan memakai nama pribadi pada profil, bukan nama peran. Jangan tampilkan avatar inisial atau badge Pengelola beserta titik status di dashboard.
- Gunakan palet hijau tua dan netral pada `src/app/redesign.css`, tombol minimalis, angka tabular, serta format Indonesia. Grafik memakai data aktual dengan periode yang jelas, akses keyboard, dan keadaan kosong/gagal yang terpisah.
