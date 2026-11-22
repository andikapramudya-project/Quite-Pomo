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

- **Timer Pomodoro** dengan mode Pomodoro, Short Break, dan Long Break. Bawaan 25/5/15 menit, interval long break dapat diatur, serta opsi mulai otomatis untuk istirahat dan sesi berikutnya.
- **Tugas** dengan estimasi jumlah pomodoro (1–20), subtugas, dan tugas aktif yang tampil di timer.
- **Statistik dan riwayat fokus** per periode, lengkap dengan **ekspor dan impor** data.
- **Suara latar** (coffee shop, rain, ocean shore, fire burning, library, stream, dan lainnya) dengan pengatur volume.
- **Alarm** dengan sembilan pilihan nada serta **notifikasi browser** dengan teks yang dapat diubah.
- **Tema pribadi:** Paper, Sage, Ink, dan warna kustom.
- **Pencatat waktu berbasis Web Worker** agar hitungan tetap berjalan ketika browser membatasi interval pada tab latar. Tab yang dibekukan atau komputer yang tidur tetap menghentikan timer.
- **Aksesibilitas:** tautan lompat ke timer dan label kontrol yang jelas.

## Menjalankan

Tidak memerlukan build atau dependensi. Sajikan folder ini melalui server HTTP statis:

```sh
python -m http.server 8080
```

Buka `http://localhost:8080`. Folder root dapat langsung dipublikasikan melalui **GitHub Pages**.

## Struktur

```text
index.html       Antarmuka
app.js           Logika aplikasi: timer, tugas, tema, audio
focus-data.js    Fungsi data: riwayat, ekspor/impor, tanggal
timer-worker.js  Timer di Web Worker
styles.css       Gaya dan tema
assets/          Logo, suara latar, dan nada notifikasi
tests/           Pengujian data dan pemeriksaan browser
```

## Pengujian

```sh
npm test    # node --test tests/*.test.cjs
```

Pengujian data/timer (14 tes) lulus, aset kode dan audio lengkap, dan halaman dapat dibuka di Chrome headless tanpa exception JavaScript (22 November 2026). Skrip di `tests/*.mjs` adalah pemeriksaan browser tambahan.

## Data dan privasi

Data tersimpan di `localStorage` browser dan tidak dikirim ke server mana pun. Menghapus data situs akan menghapusnya; gunakan fitur ekspor untuk mencadangkan riwayat. Halaman memuat font Inter dari Google Fonts.
