<p align="center"><img src="assets/logo.svg" width="72" alt="Logo Quiet Pomo" /></p>

<h1 align="center">Quiet Pomo</h1>

<p align="center">Ruang tenang untuk fokus: timer Pomodoro, daftar tugas, statistik, suara latar, dan tema pribadi.</p>

<p align="center">
  <img alt="Stack" src="https://img.shields.io/badge/HTML%20%C2%B7%20CSS%20%C2%B7%20JavaScript-tanpa%20build-f0db4f?style=flat-square" />
  <img alt="Data" src="https://img.shields.io/badge/data-lokal-555?style=flat-square" />
  <img alt="Pengujian" src="https://img.shields.io/badge/uji-node%20--test-2d9d78?style=flat-square" />
  <img alt="Hosting" src="https://img.shields.io/badge/hosting-GitHub%20Pages-555?style=flat-square" />
</p>

<p align="center">
  <a href="#fitur">Fitur</a> ·
  <a href="#menjalankan">Menjalankan</a> ·
  <a href="#struktur">Struktur</a> ·
  <a href="#pengujian">Pengujian</a>
</p>

---

## Ringkasan

Quiet Pomo adalah aplikasi Pomodoro berbasis web yang tenang dan tidak memerlukan akun. Semua data (tugas, pengaturan, riwayat fokus) disimpan di browser. Repositori ini bernama **Quite-Pomo**, sedangkan nama di dalam aplikasi adalah **Quiet Pomo**; keduanya merujuk ke proyek yang sama.

## Fitur

- **Timer Pomodoro** dengan mode Fokus, Rehat singkat, dan Rehat panjang. Bawaan 25/5/15 menit, interval rehat panjang dapat diatur, serta mulai otomatis untuk rehat dan sesi berikutnya.
- **Status yang jelas.** Siap, berjalan, dijeda, dan selesai dibedakan lewat label, penanda bentuk, dan *penggaris menit* yang terisi perlahan.
- **Tugas** dengan estimasi pomodoro (1–20), subtugas, dan tugas aktif yang tampil di timer. Memilih tugas untuk fokus terpisah dari mencentang selesai. Hapus tugas bisa diurungkan.
- **Statistik**: hari ini, 7 hari, 30 hari, semua data, filter tanggal, rata-rata per hari aktif, hari terbaik, grafik harian, arsip, serta **ekspor dan impor** (cadangan v1–v3, tanpa data ganda).
- **Suara latar** (kedai kopi, hujan, tepi pantai, api unggun, dan lainnya) dengan volume. Bisa diubah cepat dari timer.
- **Alarm** dengan sembilan nada dan **notifikasi browser** dengan pesan yang dapat diubah, serta status izin yang jelas.
- **Tema** Paper, Sage, Ink, dan palet pribadi yang kontrasnya disesuaikan otomatis.
- **Timer berbasis timestamp dan Web Worker** agar hitungan tetap berjalan ketika browser membatasi interval pada tab latar. Tab yang dibekukan atau komputer yang tidur tetap menghentikan timer.
- **Aksesibilitas:** navigasi keyboard penuh, fokus kembali setelah dialog, area sentuh 44 px, dukungan *reduced motion*, dan teks 200%.

## Navigasi

| Layar | Cara pakai |
| --- | --- |
| Desktop (≥ 1024 px) | Timer di kiri dan daftar tugas di kanan. **Statistik** dan **Pengaturan** ada di navigasi atas. Saat kamu di sana, mini-timer di header menampilkan waktu dan tombol jeda. |
| Tablet & ponsel | Navigasi bawah: **Fokus · Tugas · Statistik · Pengaturan**. Tombol *Ganti* di timer membuka daftar tugas, dan chip suara membuka pemilih suara latar. |
| Pintasan | **Spasi** memulai atau menjeda timer (saat kursor tidak berada di kontrol). **Esc** menutup dialog dan sheet. |

*Ulang* hanya mengembalikan waktu sesi saat ini. *Arsipkan hari ini* (di Statistik) menyimpan progres hari ini ke Riwayat, lalu memulai hitungan baru setelah konfirmasi.

## Menjalankan

Tidak memerlukan build atau dependensi. Sajikan folder ini melalui server HTTP statis:

```sh
python -m http.server 8080
```

Buka `http://localhost:8080`. Folder root dapat langsung dipublikasikan melalui **GitHub Pages**.

## Struktur

```text
index.html       Struktur antarmuka: view Fokus, Tugas, Statistik, Pengaturan, sheet, dan dialog
styles.css       Design tokens, tema, layout responsif, dan motion
app.js           Logika aplikasi (timer, tugas, audio, notifikasi, impor/ekspor) dan render tampilan
motion.js        Helper animasi (enter, pop, FLIP daftar, crossfade) dengan dukungan reduced motion
focus-data.js    Fungsi data: riwayat, ekspor/impor, tanggal
timer-worker.js  Timer di Web Worker
assets/          Logo, suara latar, dan nada notifikasi
tests/           Pengujian data dan pemeriksaan browser
DESIGN.md        Arah desain, tokens, dan bahasa motion
```

## Pengujian

```sh
npm test    # node --test tests/*.test.cjs (14 tes data/timer)
```

Pemeriksaan browser memakai Playwright yang sudah terpasang di sistem. Sajikan folder di `http://127.0.0.1:5173`, lalu jalankan:

```sh
python -m http.server 5173 --bind 127.0.0.1
node tests/browser-smoke.mjs        # arsip/reset, persistensi, filter, tema, migrasi, ekspor, tengah malam
node tests/task-timer-import.mjs    # break, tugas/subtugas, impor v2/v3, alarm, Worker
node tests/header-icons.mjs         # ikon, izin notifikasi, file://
node tests/design-review.mjs        # state timer, keyboard, sheet/dialog, 5 lebar × 3 tema, kontras palet, teks 200%, motion
```

Tambahkan `PLAYWRIGHT_CHANNEL=chromium` bila Chrome tidak terpasang. Argumen pertama boleh berisi path `playwright/index.mjs`.

## Data dan privasi

Data tersimpan di `localStorage` browser dan tidak dikirim ke server mana pun. Menghapus data situs akan menghapusnya; gunakan fitur ekspor untuk mencadangkan riwayat. Halaman memuat font Inter dan Newsreader dari Google Fonts; tanpa koneksi, font sistem dipakai.
