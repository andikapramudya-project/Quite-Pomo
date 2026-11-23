# Quiet Pomo — "Quiet Desk"

Quiet Pomo adalah ruang untuk mengerjakan satu hal pada satu waktu. Arah desain "Quiet Desk" memperlakukan layar seperti meja kerja yang rapi. Timer dan pekerjaan aktif berada di tengah, sedangkan alat pendukung tersimpan di laci yang mudah dibuka. Prinsip keterbacaan dan presisi diambil dari Apple dan Linear. Identitas sendiri dibangun dari angka timer yang tipis, judul berhuruf serif, dan **penggaris menit** sebagai penanda progres.

## Susunan informasi

| Lebar | Navigasi | Isi |
| --- | --- | --- |
| ≥ 1024 px | Navigasi atas: Fokus · Statistik · Pengaturan | **Fokus** terdiri dari dua kolom. Kiri: panggung timer yang *sticky*. Kanan: daftar tugas yang selalu terlihat. Statistik dan Pengaturan adalah view tersendiri. |
| < 1024 px | Navigasi bawah: Fokus · Tugas · Statistik · Pengaturan | Setiap bagian adalah view penuh yang dirancang untuk ibu jari. Badge di Tugas menunjukkan jumlah tugas aktif. |

Drawer lama dihapus. Drawer menutupi timer dan meng-*inert* seluruh halaman, sementara tugas (dipakai setiap sesi) setara bobotnya dengan pengaturan (jarang dipakai). Sebagai gantinya:

- **Mini-timer** muncul di header saat timer berjalan atau dijeda dan kamu sedang di view lain. Isinya waktu, mode, dan tombol jeda/lanjut.
- **Sheet** (bawah di mobile, tengah di desktop) dipakai untuk tindakan cepat yang tidak perlu meninggalkan timer: *Pilih tugas untuk fokus* dan *Suara latar* (pilihan + volume).
- **Dialog konfirmasi** hanya muncul untuk tindakan berdampak: arsipkan hari ini, hapus arsip permanen, impor, dan pindah mode saat sesi fokus berjalan. Setiap dialog menjelaskan dampaknya.

### Panggung fokus (urutan)

1. Pilihan mode (Fokus · Rehat singkat · Rehat panjang), berupa radio dengan *thumb* yang bergeser.
2. Status, ditandai bentuk *dan* teks:

   | Status | Penanda |
   | --- | --- |
   | Siap | ○ cincin |
   | Berjalan | ● titik |
   | Dijeda | ‖ dua batang |
   | Selesai | ● bercincin + "Sesi fokus selesai" |

3. Angka timer: Inter 300, `tabular-nums`, lebar tetap.
4. Penggaris menit: satu garis per menit (per 5 menit untuk durasi di atas 60 menit), garis tebal setiap 5. Saat rehat, garis berubah menjadi titik. Keterangan di bawahnya menunjukkan "Selesai pukul …" atau "Dijeda · sisa …".
5. Konteks:
   - Fokus: tugas aktif, pomodoro ke-n dari estimasi, dan progres subtugas.
   - Rehat: ajakan istirahat dan "Berikutnya: tugas".
   - Tanpa tugas: "Fokus bebas".
6. Kontrol: Ulang · **Mulai/Jeda/Lanjutkan** · Lewati. Tombol utama menjadi garis tepi saat timer berjalan.
7. Chip suara latar.
8. Ringkasan hari ini: sesi, waktu fokus, perkiraan selesai, dan titik siklus menuju rehat panjang.

### Tugas

- **Pilih untuk fokus** dan **centang selesai** dibedakan dengan tegas:
  - Kotak centang ada di kiri.
  - Badan tugas adalah tombol "Fokuskan" dengan ikon target.
  - Tugas aktif diberi chip "Sedang fokus" dan garis aksen di tepi kiri.
- Estimasi, subtugas, dan Hapus disimpan di panel detail yang bisa dibuka (chevron), sehingga baris tetap ringkas.
- Tugas selesai dikelompokkan di "Selesai (n)" yang bisa dilipat.
- Hapus tugas langsung berlaku dan bisa dibatalkan lewat toast **Urungkan**.
- Centang manual tidak menambah statistik fokus. Progres pomodoro hanya bertambah dari sesi yang selesai.

### Statistik

- Kartu **Penghitung aktif** berisi "Arsipkan hari ini…". Tombol ini dipindahkan dari header supaya tidak tertukar dengan Ulang timer.
- Pilihan periode (Hari ini · 7 hari · 30 hari · Semua) dan filter tanggal.
- Empat metrik: waktu fokus, sesi, rata-rata per hari aktif, dan hari terbaik.
- Grafik batang dengan garis skala maksimum. Hari ini ditandai label tebal.
- Riwayat dengan pilih/hapus, serta kartu Cadangan (ekspor/impor).

### Pengaturan

Pengaturan dikelompokkan menjadi Timer, Suara, Notifikasi, dan Tampilan.

- Durasi divalidasi. Nilai di luar batas disimpan pada batas terdekat, dan alasannya ditampilkan.
- Notifikasi menampilkan status izin (aktif / belum / diblokir / tidak didukung / butuh HTTPS) beserta tindakan yang sesuai.
- Tema ditampilkan sebagai pratinjau kecil dari palet aslinya.

## Tokens

Sumber: `:root` di `styles.css`. Warna tema di-*resolve* oleh `renderTheme()` di `app.js`.

| Peran | Token |
| --- | --- |
| Warna | `--bg`, `--surface` (kartu), `--surface-2` (track/inset), `--surface-3`, `--text`, `--muted` (≥ 4,5:1), `--field-line` (batas input ≥ 3:1), `--line`, `--line-strong`, `--control`, `--on-control`, `--focus`, `--tone-focus`, `--tone-rest` (grafis ≥ 3:1), `--danger` (≥ 4,5:1), `--scrim` |
| Tipografi | `--font-ui` Inter (fallback sistem), `--font-display` Newsreader (fallback Georgia). Skala 11/12/13/14/15/17/22/30 px. Timer `min(10.5rem, 23vw)` berbobot 300. |
| Spasi | `--s-1 … --s-16` (kelipatan 4 px). Area sentuh `--hit` 44 px. |
| Radius | `--r-xs` 6 · `--r-sm` 10 · `--r-md` 14 · `--r-lg` 20 · `--r-pill` |
| Elevasi | Garis terlebih dahulu. `--shadow-1` untuk kontrol terpilih, `--shadow-2` untuk toast dan hover tombol utama, `--shadow-3` untuk sheet dan dialog. Tema gelap memakai bayangan lebih pekat. |
| Motion | `--dur-instant` 90 · `--dur-quick` 160 · `--dur-base` 240 · `--dur-slow` 360 · `--dur-calm` 600 ms. `--ease-out` untuk masuk, `--ease-in` untuk keluar, `--ease-in-out` untuk berpindah tempat, `--ease-soft` untuk umpan balik taktil kecil. Nilai yang sama ada di `motion.js`. |

### Tema

Paper, Sage, dan Ink diracik manual di `THEME_TOKENS`:

- **Paper:** kertas hangat dengan tinta hampir hitam. Rehat memakai hijau tua.
- **Sage:** hijau lama dengan kontrol hijau hutan. Rehat memakai biru-teal.
- **Ink:** arang dengan teks gading. Rehat memakai mint lembut.

Palet custom melewati `resolveCustomTokens()`. Teks dibuat hitam atau putih murni, permukaan turunan bergerak *menjauhi* warna teks, lalu `muted`, `field-line`, dan `danger` dicampur ke arah teks sampai target kontrasnya tercapai di semua permukaan. `tests/design-review.mjs` menguji 237 palet, termasuk titik silang terang/gelap.

## Bahasa motion

| Momen | Gerak | Alasan |
| --- | --- | --- |
| Mulai / Jeda / Lanjutkan | Ikon play↔pause muncul dengan skala; tombol utama berubah menjadi garis tepi; angka meredup ke 55% saat dijeda | Status terbaca dari kejauhan tanpa animasi berulang |
| Progres | Penggaris meluncur linear 1 detik per tick melalui `@property --p` (clip-path + transform). Tidak ada kedip per detik. | Gerak sangat lambat terasa tenang |
| Ulang | Penggaris mundur ke nol (360 ms in-out); ikon ulang berputar saat hover | Sebab-akibat terlihat |
| Ganti mode / Lewati | Fokus→rehat: angka turun 10 px dan memudar masuk ("mengendap"). Rehat→fokus: naik ("bangkit"). Garis penggaris berubah menjadi titik. | Arah memberi makna |
| Sesi selesai | Penggaris berdenyut sekali (600 ms), titik siklus *pop*, status "Sesi fokus selesai", dan toast | Penanda singkat tanpa partikel |
| View | Konten masuk 16 px dari arah navigasi (360 ms) | Orientasi maju/mundur |
| Sheet / dialog | Mobile: naik dari bawah. Desktop: skala 0,985→1 + fade. Keluar 160 ms ease-in. Fokus kembali ke pemicu. | Asal-usul jelas |
| Daftar tugas | FLIP: baris lain bergeser, baris baru masuk, baris terhapus menjadi *ghost* inert yang memudar. Centang tergambar (stroke). Garis aksen tugas aktif tumbuh. | State sudah final sebelum animasi; tidak menunda |
| Tema | Crossfade View Transitions (bila didukung) | Satu perubahan global, satu gerak |
| Kontrol | Tombol menekan ke 0,97 (90 ms), toggle meluncur dengan sedikit pegas, pilihan audio memberi *pop* pada tanda centang | Umpan balik taktil |

Aturannya: animasi hanya memakai transform dan opacity (ditambah warna untuk transisi status). Animasi tidak pernah menunda perubahan state, tidak berulang terus-menerus, dan angka timer tidak dianimasikan per detik. `prefers-reduced-motion` mengganti semua gerak dengan fade ≤ 120 ms. Penggaris dan crossfade dimatikan, sedangkan perubahan warna/status, centang, dan toast tetap memberi umpan balik.

## Aksesibilitas

- Mode memakai pola radio dengan panah/Home/End. Spasi memulai/menjeda saat fokus keyboard tidak berada di kontrol.
- Dialog dan sheet memakai `<dialog>` native: fokus terkurung, Escape menutup, dan fokus kembali ke pemicu.
- Semua kontrol interaktif minimal 44 × 44 px (diuji otomatis di lima lebar dan tiga tema).
- Status tidak bergantung pada warna saja: ada bentuk penanda, label, dan garis vs titik pada penggaris.
- Toast memakai `role=status` dan mengumumkan selesainya sesi. Angka timer memakai `aria-live=off` supaya tidak berisik.
- Layout tetap bisa dipakai pada teks 200% di lebar 320/390/768 px tanpa scroll horizontal.

## Batas perubahan

- `focus-data.js` dan `timer-worker.js` tidak diubah.
- Fungsi domain di `app.js` dipindahkan apa adanya: timer berbasis timestamp, Worker, penjadwalan/pembatalan alarm, progres tugas otomatis, arsip/pergantian hari, dan impor/ekspor.
- Integrasi presentasi yang ditambahkan:
  - Satu *hook* `markCompletion()` di `completeMode()`.
  - Konfirmasi saat pindah mode ketika sesi fokus berjalan.
  - Validasi rentang durasi di form.
  - Urungkan hapus tugas/palet.
- Kunci `quiet-pomo-state-v1` dan format cadangan v1–v3 tetap sama.
- Tidak ada build step atau dependency baru. Font dimuat dari Google Fonts dengan fallback sistem.
