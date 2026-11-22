# Quite-Pomo

Aplikasi Pomodoro web. Quiet Focus adalah rancangan proyek yang sama; nama proyek dipertahankan sebagai Quite-Pomo.

## Menjalankan

```sh
python -m http.server 8080
node --test tests/*.test.*
```

Buka localhost:8080. Sumber utama mencakup `app.js`, `focus-data.js`, `timer-worker.js`, HTML/CSS, serta aset audio dan notifikasi yang dipakai aplikasi. Aset audio tetap disertakan karena merupakan fitur aplikasi, bukan rekaman draft. Paket update telah cocok dengan sumber utama. Root dapat dipublikasikan melalui GitHub Pages.

## Rilis dan repositori

Tidak ditemukan rilis jadi yang sesuai dalam sumber terpilih. Paket ini berisi sumber; hasil build baru dapat dibuat sesuai lingkungan dan konfigurasi masing-masing.

Gunakan folder ini sebagai root repositori baru. Kredensial, riwayat Git lama, data pribadi, cache, rancangan agent, dan draft tidak disertakan. Metadata yang masih bertanda `REPLACE_WITH_...` perlu diisi sesuai hosting tujuan.

## Pemeriksaan paket sumber — 22 November 2026

14 tes data/timer lulus; aset kode dan audio lengkap. Halaman dibuka di Chrome headless tanpa exception JavaScript.
