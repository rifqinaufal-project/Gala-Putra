# Rencana Redesign UI Dashboard (Warna Putih-Coklat + Layout Kartu)

Tujuan: mengubah tampilan dashboard agar mendekati referensi baru (putih bersih + aksen coklat) tanpa mengubah data, KPI, dan logika bisnis ERP seafood.

## Referensi visual baru
- Warna dominan: putih/abu sangat terang untuk konten, bukan rose/pink.
- Aksen: coklat/terakota pada tombol utama dan elemen aksen.
- Sidebar: terang/putih, bukan gelap.
- Topbar: minimalis dengan pencarian di tengah, profil di kanan.
- Kartu: bersih dengan radius lebih halus, bayangan minimal.
- Data: tetap pakai metrik, kartu, dan tabel yang sudah ada.

## File yang perlu diubah
1. `app/globals.css` — token warna dasar, bayangan, gradien latar belakang.
2. `components/app-shell/sidebar.tsx` — desain sidebar terang.
3. `components/app-shell/topbar.tsx` — tata letak pencarian dan avatar.
4. `components/app-shell/dashboard-shell.tsx` — batasan lebar, warna latar area utama.
5. `components/app-shell/page-header.tsx` — gaya judul dan aksi halaman.
6. `components/dashboard/metric-card.tsx` — kartu metrik gaya referensi.
7. `components/reports/report-period-tabs.tsx` — tab filter bergaya terang.
8. `app/(dashboard)/dashboard/page.tsx` — tata letak ulang grid metrik + bagian tabel.

## Prioritas implementasi
### 1. Fondasi warna (`globals.css`)
- Ganti `--background: #f2f2f0` menjadi netral lebih terang/putih hangat.
- Ganti aksen primer dari hitam/abu gelap ke coklat/terakota.
- Perbarui warna sidebar dari gelap ke terang dengan tepi samar.
- Tambah variabel/kelas utilitas untuk kartu, badge, dan bayangan bernada coklat.

### 2. Sidebar terang
- Ubah latar belakang sidebar menjadi putih/abu sangat terang.
- Teks & ikon: gelap dengan aksen coklat untuk item aktif.
- Pertahankan struktur navigasi, peran, dan responsivitas.

### 3. Topbar minimalis
- Taruh field pencarian di tengah seperti referensi.
- Avatar dan nama di kanan.
- Sederhanakan ikon aksi.

### 4. Tampilan kartu metrik
- Buat kartu metrik bersih dengan bayangan halus dan kartu putih.
- Gunakan teks angka besar dengan label kecil di bawahnya.
- Badge tren hijau/merah tetap ada.

### 5. Tata letak dashboard
- Gunakan grid 3 kolom untuk kartu KPI di desktop.
- Di bawahnya, buat tabel atau kartu detail dengan gaya baru.

## Keterbatasan yang harus dijaga
- Jangan mengubah data aktual dari Supabase.
- Jangan mengubah logika peran/otorisasi.
- Pertahankan komponen tabel, grafik, dan fitur yang sudah ada.
- Jangan menambah domain medis; hanya tampilan UI.

## Verifikasi
- Jalankan `npm run lint`.
- Jalankan `npm run build`.
- Periksa tampilan di layar desktop dan pastikan tidak ada rose/pink yang tersisa.
