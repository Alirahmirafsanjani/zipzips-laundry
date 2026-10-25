# Kebutuhan Sistem — ZIP-ZIPS LAUNDRI

Versi: 1.0 (draft) · Status: menunggu konfirmasi pemilik untuk 8 pertanyaan prioritas-1
(lihat [open-questions.md](open-questions.md))

---

## 1. Gambaran Umum

ZIP-ZIPS LAUNDRI adalah laundry rumahan di Bantul, Yogyakarta, dengan 1 outlet dan
4 orang pekerja (1 pemilik, 1 kasir, 2 karangian). Sistem ini menggantikan
pencatatan manual berbasis buku/telepon menjadi aplikasi web yang bisa dipakai
lewat HP maupun laptop, **gratis** (free tier), dan tetap bisa dipakai saat
internet tidak stabil.

### Masalah yang diselesaikan

| Masalah saat ini | Dampak | Solusi sistem |
|---|---|---|
| Nota ditulis manual, mudah hilang/kembar | Sulit cek riwayat & tagihan | Nomor nota otomatis + penyimpanan DB |
| Omzet & kas dicampur | Angka income tidak dipercaya | 5 metrik terpisah: omzet / penerimaan kas / pengeluaran / laba kas / piutang |
| Status cucian & status bayar jadi satu | Pelanggan dan karangian sama-sama bingung | Dua status terpisah |
| Stok bahan dicatat di kertas | Salah hitung, tidak ada history | Stok = SUM(mutasi), ada jejak audit |
| Keterlambatan pembayaran | Piutang tidak terlacak | Status pembayaran turunan + laporan piutang |
| Koneksi sering mati (outlet pinggiran) | Transaksi hilang | Idempotensi + antrean offline (P3.5) |

---

## 2. Pengguna & Peran

| Peran | Jumlah | Deskripsi | Akses |
|---|---|---|---|
| **OWNER** (Pemilik) | 1 | Pegang keputusan bisnis | Penuh, termasuk laporan keuangan, pengaturan, pengguna, void pesanan, stok |
| **KASIR** | 1 | Melayani pelanggan di outlet | POS, buat pesanan, catat pembayaran, kelola pelanggan, ubah status |
| **OPERATOR** (Karangian) | 2 | Mencuci dan menyelesaikan cucian | Lihat & ubah status pengerjaan, catat catatan pengerjaan. **Tidak** melihat angka keuangan |

Catatan: satu outlet → **tidak ada** filtering wilayah/cabang.

---

## 3. Kebutuhan Fungsional

Prioritas menunjukkan urutan pengerjaan (lihat [implementation-plan.md](implementation-plan.md)).

### 3.1 [P1] Autentikasi & Manajemen Pengguna

| ID | Kebutuhan |
|---|---|
| F-01 | Sistem menerima login username + password, mengembalikan token JWT. |
| F-02 | Password disimpan sebagai hash (bcrypt), tidak pernah plaintext, tidak pernah dikembalikan API. |
| F-03 | Token yang tidak valid / kedaluwarsa menghasilkan 401 dan memaksa logout di frontend. |
| F-04 | Rate limit login mencegah brute force (10 percobaan / 15 menit / IP). |
| F-05 | Pemilik dapat menambah, mengubah, dan menonaktifkan pengguna. |
| F-06 | Username bersifat unik; konflik menghasilkan 409. |
| F-07 | Minimal satu OWNER aktif harus selalu ada (pemilik terakhir tidak bisa dinonaktifkan). |
| F-08 | Pengguna dapat mengganti passwordnya sendiri. |

### 3.2 [P1] Master Layanan

| ID | Kebutuhan |
|---|---|
| F-10 | Master layanan menyimpan kode, nama, satuan (KG / ITEM), harga default, estimasi hari. |
| F-11 | Layanan dapat diarsipkan (nonaktif) tanpa menghapus — pesanan lama tetap utuh. |
| F-12 | Harga master boleh diubah; pesanan lama **tidak** ikut berubah (snapshot harga). |

### 3.3 [P1] POS & Pembuatan Pesanan

| ID | Kebutuhan |
|---|---|
| F-20 | Kasir memilih layanan, memasukkan jumlah (kg / item), dan memproses pesanan dalam < 10 detik. |
| F-21 | Total dihitung **di server** dari master harga; klien tidak boleh menentukan harga. |
| F-22 | Harga satuan boleh dioverride kasir di layar, tetap divalidasi server (tidak boleh negatif, dan tidak boleh melebihi harga master). Batas persentase yang lebih ketat menunggu jawaban pemilik — lihat Q-02. |
| F-23 | Setiap pesanan mendapat nomor nota otomatis berformat `ZZ-YYYYMMDD-NNNN`, unik per hari, tanpa bentrok walau ada dua kasir bersamaan. |
| F-24 | Pelanggan boleh diisi bebas (tanpa nomor HP) atau dipilih dari master pelanggan. |
| F-25 | Diskon (nominal rupiah) dapat diberikan, tidak boleh melebihi subtotal. |
| F-26 | Pembuatan pesanan bersifat idempoten lewat `clientRequestId` — retry tidak menghasilkan pesanan ganda. |
| F-27 | Identitas pelanggan (nama, no HP) di-snapshot di pesanan agar tetap benar meski profil pelanggan diedit. |

### 3.4 [P1] Status Pengerjaan

| ID | Kebutuhan |
|---|---|
| F-30 | Status pengerjaan: `DITERIMA → PROSES → SELESAI → DIAMBIL`. |
| F-31 | Transisi status yang tidak sah ditolak (mis. DITERIMA → DIAMBIL). |
| F-32 | Setiap perubahan status tercatat dengan pelaku, waktu, dan catatan → tampil sebagai timeline. |
| F-33 | Karangian (OPERATOR) dapat mengubah status. |
| F-34 | Setelah `SELESAI`, admin/kasir dapat mencatat bahwa pelanggan sudah dihubungi (WhatsApp/telepon/langsung), beserta waktu, pelaku, dan jumlah kontak. |
| F-35 | Pesan WhatsApp siap kirim berisi nama toko, nomor nota, total, dan sisa tagihan (deep link `wa.me`, tanpa API WhatsApp). |
| F-36 | Daftar kerja admin menampilkan cucian `SELESAI` yang **belum dihubungi** (`belumDihubungi=true`), diperbarui otomatis di beranda. |
| F-37 | Nota 80 mm dapat dicetak dari POS dan detail pesanan: identitas toko, item/berat, estimasi selesai, total, DP, sisa, dan catatan struk. |
| F-38 | Saat serah terima menyisakan piutang, admin dapat menetapkan tanggal janji bayar; piutang yang lewat tanggal tampil di filter "Jatuh tempo". |

> Catatan implementasi: OPERATOR memakai endpoint status untuk
> `DITERIMA → PROSES → SELESAI`. Perpindahan ke `DIAMBIL` hanya melalui
> `POST /api/orders/:id/serahkan` (OWNER/KASIR) agar pembayaran/piutang dan
> audit serah terima tidak terlewat. OPERATOR tetap dapat mengisi
> `catatanPengerjaan`; catatan pelanggan tetap milik OWNER/KASIR.

### 3.5 [P1] Status Pembayaran

| ID | Kebutuhan |
|---|---|
| F-40 | Status pembayaran **diturunkan**, bukan disimpan: `BELUM_BAYAR` / `SEBAGIAN` / `LUNAS` / `VOID`. |
| F-41 | Perhitungan: `totalDibayar == 0` → BELUM_BAYAR; `0 < totalDibayar < total` → SEBAGIAN; `totalDibayar >= total` → LUNAS; pesanan dibatalkan → VOID. |
| F-42 | Pembayaran dapat dicatat sebagian (DP / cicil). |
| F-43 | Sisa tagihan selalu terlihat di layar kasir. |

### 3.6 [P1] Pencatatan Pembayaran

| ID | Kebutuhan |
|---|---|
| F-50 | Metode: TUNAI / QRIS / TRANSFER. |
| F-51 | Pembayaran TUNAI boleh lebih dari tagihan → sistem menghitung kembalian. |
| F-52 | Pembayaran QRIS/TRANSFER **tidak boleh** melebihi sisa tagihan. |
| F-53 | Kembalian selalu dihitung server, tidak pernah dipercaya dari input klien. |
| F-54 | `idempotencyKey` UNIQUE → klik ganda / retry jaringan tidak menghasilkan pembayaran ganda. |
| F-55 | Pembayaran pada pesanan lunas atau dibatalkan ditolak. |
| F-56 | Referensi QRIS (kode / merchant) dapat dicatat manual — **tanpa integrasi API QRIS**. |
| F-57 | Pembayaran bersamaan pada satu pesanan tidak boleh membuat total dibayar melebihi total (isolasi SERIALIZABLE + retry). |
| F-58 | Serah terima (`serahkan`) mencatat pembayaran (opsional) dan status `DIAMBIL` dalam **satu transaksi**; hanya dari status `SELESAI`. |
| F-59 | Serah terima tanpa pembayaran diperbolehkan; sisa tagihan tetap tercatat sebagai piutang. |

### 3.7 [P1] Pembatalan Pesanan (Void)

| ID | Kebutuhan |
|---|---|
| F-60 | Hanya OWNER yang dapat membatalkan pesanan. |
| F-61 | Pembatalan wajib disertai alasan (min. 3 karakter). |
| F-62 | Pesanan yang dibatalkan **tidak dihapus**, ditandai `voidedAt` + alasan + pelaku. |
| F-63 | Pesanan void dikeluarkan dari omzet, jumlah pesanan, piutang, dan daftar default. Pembayaran yang sudah masuk **tetap** dihitung sebagai penerimaan kas. |
| F-64 | Pesanan void tidak bisa dibayar ulang; void kedua ditolak. |
| F-65 | Void pesanan yang sudah menerima pembayaran wajib menyertakan keputusan refund eksplisit: nominal 0 sampai `totalDibayar`. Refund > 0 dicatat sebagai `Expense` kategori `REFUND` dalam transaksi yang sama. |

### 3.8 [P1] Pengeluaran & Pemasukan Lain

| ID | Kebutuhan |
|---|---|
| F-70 | OWNER mencatat pengeluaran: tanggal, kategori, keterangan, nominal, metode bayar. |
| F-71 | Kategori pengeluaran: BAHAN_BAKU, GAJI, LISTRIK_GAS, SEWA, TRANSPORTASI, PERAWATAN, REFUND, LAIN_LAIN. |
| F-72 | OWNER mencatat pemasukan di luar laundry (mis. jual hanger, jasa tambahan). |
| F-73 | Kategori pemasukan lain: PENJUALAN_BARANG, JASA_TAMBAHAN, LAIN_LAIN. |
| F-74 | Pengeluaran & pemasukan lain dapat diekspor ke CSV (pemisah `;`, BOM Excel-friendly). |

### 3.9 [P1] Laporan Keuangan

Definisi metrik dikunci — lihat [database-design.md](database-design.md) § Metrik.

| ID | Kebutuhan |
|---|---|
| F-80 | **Omzet** = SUM(total pesanan belum void) berdasarkan tanggal pesanan masuk. |
| F-81 | **Penerimaan kas** = SUM(pembayaran − kembalian) + SUM(pemasukan lain) berdasarkan tanggal pembayaran, termasuk pembayaran pada pesanan yang kemudian void. |
| F-82 | **Pengeluaran** = SUM(pengeluaran) berdasarkan tanggal pengeluaran. |
| F-83 | **Piutang** = SUM(total − totalDibayar) seluruh pesanan aktif, lintas tanggal. |
| F-84 | **Laba kas** = penerimaan kas − pengeluaran. **Bukan laba bersih** (HPP belum dihitung). |
| F-85 | Laporan menyediakan rincian harian, rincian per metode bayar, rincian per kategori pengeluaran, dan rincian per kategori pemasukan lain. |
| F-86 | Hanya OWNER yang dapat melihat laporan keuangan. |

### 3.10 [P1] Ringkasan Beranda

| ID | Kebutuhan |
|---|---|
| F-90 | Omzet hari ini (total pesanan masuk hari ini), diterima hari ini (kas masuk berdasarkan tanggal pembayaran, termasuk pembayaran pesanan yang kemudian void), belum dibayar hari ini (sisa tagihan pesanan yang masuk hari ini), jumlah pesanan hari ini. |
| F-91 | Jumlah pesanan per status pengerjaan. |
| F-92 | Total piutang. |
| F-93 | OPERATOR melihat ringkasan **tanpa** angka keuangan. Backend tidak mengirim angka keuangan ke role OPERATOR; UI juga menyembunyikannya. |

### 3.11 [P2] Master Pelanggan

| ID | Kebutuhan |
|---|---|
| F-100 | Pelanggan punya kode otomatis, nama, no HP, alamat, catatan. |
| F-101 | Pencarian pelanggan berdasarkan nama / no HP, dengan paginasi. |
| F-102 | Pelanggan dapat melihat riwayat pesanan dan total transaksi. |
| F-103 | Pelanggan tidak dapat dihapus jika punya pesanan (relasi di-set null). |

### 3.12 [P2] Inventori Bahan

| ID | Kebutuhan |
|---|---|
| F-110 | Master produk habis pakai: kode, nama, satuan, stok minimum, harga beli terakhir. |
| F-111 | Stok = SUM(seluruh mutasi). **Tidak ada** kolom stok yang dikurangi manual. |
| F-112 | Tipe mutasi: MASUK (pembelian), KELUAR (pemakaian), PENYESUAIAN (opname). |
| F-113 | PENYESUAIAN menghitung selisih antara stok sistem dan stok fisik. |
| F-114 | KELUAR melebihi stok tersedia ditolak. |
| F-115 | Produk dengan stok ≤ stok minimum ditandai "stok menipis". |
| F-116 | Setiap mutasi menyimpan stok sebelum & sesudah (denormalisasi untuk audit). |
| F-117 | Pengurangan stok **otomatis** dari setiap pesanan TIDAK diaktifkan di MVP (butuh aturan konsumsi yang belum disetujui — lihat open question Q-05). |

### 3.13 [P3] Mode Offline (P3.5)

| ID | Kebutuhan |
|---|---|
| F-120 | Pesanan & pembayaran yang dicatat saat offline tersimpan di antrean lokal (IndexedDB). |
| F-121 | Antrean tersinkron otomatis saat koneksi kembali. |
| F-122 | Kirim ulang aman: `clientRequestId` / `idempotencyKey` mencegah duplikasi. |
| F-123 | UI menampilkan status sinkron (menunggu / tersinkron / gagal) dan lawmakersnota sementara. |
| F-124 | ORDER BY sinkron: antrean dikirim berurutan per pengguna. |

### 3.14 [P4] Laporan&Bantuan Keputusan

| ID | Kebutuhan |
|---|---|
| F-130 | Omzet harian/mingguan/bulanan + rata-rata. |
| F-131 | Layanan paling laris (per unit dan per nilai). |
| F-132 | Jam sibuk (antrean pesanan per jam). |
| F-133 | Rasio pembayaran sebagian → piutang menumpuk. |
| F-134 | Ringkasan rasio beban kerja vs kapasitas harian (kapasitas = open question Q-07). |

### 3.15 [P5] Pengaturan

| ID | Kebutuhan |
|---|---|
| F-140 | Nama toko, alamat, nomor WhatsApp, catatan kaki pada nota. |
| F-141 | Pengaturan tersimpan sebagai key-value JSON. |
| F-142 | Sebagian pengaturan dapat dibaca publik (mis. nama toko di halaman login). |

### 3.16 [P6] Audit

| ID | Kebutuhan |
|---|---|
| F-150 | Aksi penting (void, ubah harga master, reset password, catat pengeluaran) tercatat di audit log. |
| F-151 | Audit log menyimpan pelaku, aksi, entitas, id, detail JSON, waktu. |
| F-152 | Audit log tidak dapat dihapus dari UI. |

---

## 4. Kebutuhan Non-Fungsional

| ID | Kategori | Kebutuhan |
|---|---|---|
| N-01 | Biaya | Seluruh sistem berjalan di **free tier**: Render Static + Render Free Web Service + Supabase Free. Biaya target Rp0/bulan. |
| N-02 | Performa | Halaman POS merespons < 1 detik pada jaringan normal; p95 API < 500 ms. |
| N-03 | Skala | Cukup untuk 1 outlet, ~50–150 pesanan/hari, 4 user aktif. |
| N-04 | Keamanan | Password di-hash bcrypt. JWT dengan secret dari environment. Helmet. CORS whitelist. Rate limit. Tidak ada kredensial di dalam repo. |
| N-05 | Keandalan | Transaksi tidak pernah hilang: idempotensi di creation order & payment. Transaksi DB tidak pernah dihapus. |
| N-06 | Zona waktu | Seluruh Stored date-time dicatat dalam UTC; konversi ke **WIB (UTC+7)** di layer aplikasi/laporan. |
| N-07 | Zona waktu | Tanggal bisnis (hari) selalu dihitung dalam WIB, bukan UTC — pesanan jam 23:30 WIB masuk ke hari yang sama. |
| N-08 | Usability | Bahasa antarmuka **Bahasa Indonesia**. Angka uang format rupiah. Bisa dipakai di HP (kasir sering di HP). |
| N-09 | Maintainability | Struktur modular per fitur. Dokumentasi selalu mutakhir. Code simple, tanpa over-engineering. |
| N-10 | Observability | Error API memberi kode + pesan dalam Bahasa Indonesia yang bisa ditindaklanjuti. |
| N-11 | Backup | Backup database otomatis harian (Supabase Free tidak menyediakan auto-backup). |
| N-12 | Portabilitas | Bisa dijalankan di Railway / VPS / lokal tanpa perubahan kode besar (hanya env var). |
| N-13 | Aksesibilitas | Label form, kontras warna memadai, target sentuh ≥ 40px di layar kasir. |
| N-14 | Data privacy | Data pelanggan (nama, no HP) tidak dibagikan ke pihak ketiga. Tidak ada analytics pihak ketiga. |

---

## 5. Aturan Bisnis yang Terkunci

Aturan berikut **sudah diputuskan** dan tidak boleh diubah tanpa persetujuan pemilik:

1. Status pengerjaan dan status pembayaran adalah dua hal berbeda.
2. Transaksi tidak pernah dihapus — hanya dibatalkan (void) dengan alasan.
3. Harga pesanan bersifat snapshot.
4. Stok dihitung dari mutasi, tidak ada pengurangan otomatis di MVP.
5. Uang disimpan sebagai integer rupiah.
6. Omzet ≠ penerimaan kas ≠ laba. Laba kas bukan laba bersih.
7. Pembayaran QRIS dicatat manual, tidak ada integrasi API.
8. Laporan keuangan hanya untuk OWNER.
9. Tidak ada pengarah wilayah/cabang (satu outlet).
10. Skema `idempotencyKey` UNIQUE pada Payment dan `clientRequestId` UNIQUE pada Order.

---

## 6. Di Luar Lingkup (MVP)

Fitur berikut **sengaja tidak** dibangun di MVP:

- Integrasi API QRIS / payment gateway otomatis.
- Pengurangan stok otomatis per pesanan (butuh aturan konsumsi).
- Multi-cabang / multi-wilayah.
- E-commerce / pemesanan online pelanggan.
- Aplikasi mobile native.
- Akuntansi penuh (HPP, jurnal, akun, periode tutup buku).
- Multi-user real-time collaboration.
- Notifikasi WhatsApp otomatis.
- Barcode / QR label cucian.
- Program loyalitas / poin.
- Multi-mata uang.

---

## 7. Kriteria Penerimaan MVP

MVP dinyatakan selesai bila:

1. Semua test integrasi backend lulus (`npm test` di `backend/`).
2. Alur POS lengkap berjalan: login → buat pesanan → ubah status → catat pembayaran → lihat di beranda.
3. Laporan keuangan menampilkan 5 metrik dengan angka yang benar pada skenario uji manual (lihat [testing-plan.md](testing-plan.md) § Uji Manual).
4. Aplikasi dapat di-deploy ke Render + Supabase dan diakses dari HP.
5. Backup harian berhasil dan dapat dipulihkan (minimal 1 uji restore).
6. 8 pertanyaan prioritas-1 di [open-questions.md](open-questions.md) sudah dijawab pemilik dan struktur data disesuaikan bila perlu.

---

## 8. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Render Free tidur (idle 15 menit) | Kasir lambat pada request pertama | Pinger 06:00–21:00 WIB; endpoint `/api/health` tanpa query DB; UI "menyambung…" |
| Supabase Free pause setelah 7 hari idle | Dev downtime | Jadwalkan ping harian (GitHub Actions) agar DB tidak idle |
| Internet tidak stabil di outlet | Transaksi tidak tersimpan | Antrean offline P3.5 + idempotensi |
| Render Free limited 750 jam/bulan | Service mati | 1 web service saja, static site gratis; usage monitoring |
| Supabase Free 500MB & tanpa auto-backup | Kehilangan data | Backup harian via GitHub Actions (N-11) |
| Harga master berubah tanpa pemberitahuan | Salah hitung kas | Snapshot harga di OrderItem |
| Salah input tanggal (WIB vs UTC) | Laporan meleset | Semua konversi tanggal terpusat di `lib/wib.js` |
