# Proses Bisnis — ZIP-ZIPS LAUNDRI

Dokumen ini menjelaskan alur operasional harian ZIP-ZIPS LAUNDRI, dari pelanggan
menyerahkan cucian sampai uang masuk ke kas, plus alur pendukung (stok, pengeluaran,
laporan). Alur ini yang menjadi acuan fitur mana yang dibangun lebih dulu.

Diagram memakai notasi sederhana:

```
[Pelaku] --aksinya--> [Sistem] --memengaruhi--> [Data]
```

---

## 1. Peta Proses Utama

```
                    ┌──────────────────────────────────────────┐
                    │  PESANAN MASUK (POS)                      │
                    │  Kasir: pilih layanan + jumlah            │
                    │  → sistem hitung total dari master harga  │
                    └───────────────┬──────────────────────────┘
                                    │ Order (DITERIMA)
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │  PENCUCIAN                                │
                    │  Karangian: DITERIMA → PROSES → SELESAI   │
                    └───────────────┬──────────────────────────┘
                                    │
                        ┌───────────┴───────────┐
                        │                       │
                        ▼                       ▼
            ┌───────────────────┐   ┌──────────────────────┐
            │ PEMBAYARAN        │   │ DIAMBIL              │
            │ (saat masuk ATAU  │   │ Pelanggan ambil →     │
            │  saat ambil)      │   │ status DIAMBIL       │
            │ TUNAI/QRIS/       │   └──────────────────────┘
            │ TRANSFER          │
            └─────────┬─────────┘
                      │ Payment
                      ▼
            ┌──────────────────────────────────────────┐
            │ LAPORAN (harian)                         │
            │ omzet · penerimaan kas · pengeluaran     │
            │ laba kas · piutang                       │
            └──────────────────────────────────────────┘
```

---

## 2. Proses A — Login

| Langkah | Pelaku | Sistem | Data |
|---|---|---|---|
| 1. Kasir membuka aplikasi | Kasir | — | — |
| 2. | Kasir | Validasi username + password (bcrypt compare) | — |
| 3. | | Tolak jika salah / rate limit tercapai | `AuditLog` (percobaan gagal, P2) |
| 4. | | Terbitkan JWT (12 jam) + profil pengguna | `User` dibaca |
| 5. | | Simpan token di `localStorage` | — |

**Aturan:**
- Minimal 1 OWNER aktif selalu ada (F-07).
- Token invalid/expired → 401 → frontend otomatis logout dan ke halaman login.

---

## 3. Proses B — Menerima Pesanan (POS)

**Pelaku:** Kasir · **Sistem:** Backend · **Waktu target:** < 10 detik

| # | Langkah | Detail |
|---|---|---|
| B1 | Kasir memilih pelanggan | Dari master pelanggan (opsional) atau tulis nama bebas. Tanpa no HP pun boleh. |
| B2 | Kasir memilih layanan | Cuci kiloan (satuan KG) / cuci satuan (ITEM) / express. |
| B3 | Kasir memasukkan jumlah | Contoh: 3 KG, atau 5 item. |
| B4 | Sistem mengambil harga | **Dari master layanan di server.** Harga master tidak dikirim dari klien. |
| B5 | Kasir boleh mengubah harga satuan | Hanya OWNER/KASIR. Server memvalidasi rentang (lihat open question Q-02). |
| B6 | Sistem menghitung | `subtotal = Σ(qty × hargaSatuan)` → `total = subtotal − diskon`. Diskon tidak boleh melebihi subtotal. |
| B7 | Kasir menekan "Simpan" | Permintaan `POST /api/orders` dengan `clientRequestId` (UUID, dibuat klien). |
| B8 | **Pemeriksaan idempotensi** | Jika `clientRequestId` sudah ada → kembalikan pesanan yang **sama**, bukan membuat baru. Ini yang membuatnya aman saat offline/retry. |
| B9 | Nomor nota dibuat | `ZZ-YYYYMMDD-NNNN` via counter atomik di dalam transaksi DB. Nomor urut per hari, tanpa bentrok. |
| B10 | Snapshot disimpan | `OrderItem` menyimpan `namaService`, `satuan`, `hargaSatuan`, `subtotal` saat itu. Perubahan harga master tidak mengubah nota lama. |
| B11 | Identitas pelanggan disalin | `namaPelanggan` & `noHp` disalin ke Order. |
| B12 | Riwayat status dibuat | `OrderStatusHistory`: null → `DITERIMA`. |
| B13 | Response | Pesanan lengkap + status pembayaran `BELUM_BAYAR`. |

**Kasus khusus:**
- Layanan tidak aktif / tidak ditemukan → 422 `LAYANAN_TIDAK_ADA`.
- Item kosong → 422.
- Diskon > subtotal → 422 `DISKON_TERLALU_BESAR`.

**Pemetaan ke requirement:** F-20 … F-27.

---

## 4. Proses C — Pengerjaan Cucian

**Pelaku:** Karangian (OPERATOR), kadang Kasir

| # | Langkah | Detail |
|---|---|---|
| C1 | Karangian melihat daftar | Filter default: status bukan `DIAMBIL`, diurutkan lama dulu (FIFO). |
| C2 | Karangian membuka detail | Melihat item, nama pelanggan, catatan, dan mengisi catatan pengerjaan bila perlu. |
| C3 | Karangian menandai `PROSES` | Dicuci / dijemur. |
| C4 | Karangian menandai `SELESAI` | Siap diambil. `tanggalSelesai` terisi. |
| C5 | **Admin menghubungi pelanggan** | Admin/kasir mengirim WhatsApp (pesan otomatis berisi nomor nota, total, dan sisa tagihan) atau menelepon. Sistem mencatat `dihubungiAt`, `dihubungiVia`, pelaku, dan `jumlahDihubungi`. Beranda memperbarui daftar "siap diambil" tiap 30 detik dan menyediakan tombol muat ulang. |
| C6 | Pelanggan mengambil & membayar | Satu aksi "Serahkan &amp; Bayar": sistem mencatat pembayaran (opsional) **dan** mengubah status → `DIAMBIL` dalam satu transaksi. Bila belum dibayar, sisa tetap tercatat sebagai piutang dan tanggal janji bayar (`jatuhTempo`) disimpan. |
| C7 | Setiap langkah | `OrderStatusHistory` mencatat: status asal, status baru, pelaku, waktu, catatan. |
| C7.1 | Nota pelanggan | Nota 80 mm dapat dicetak dari POS setelah pesanan dibuat atau dari detail pesanan. Berisi item, berat, estimasi selesai, total, DP, sisa, dan catatan struk. |
| C7.2 | Catatan pengerjaan | Karangian dapat menyimpan catatan kondisi cucian lewat `PATCH /api/orders/:id/catatan` (`catatanPengerjaan`). Catatan pelanggan tetap diedit OWNER/KASIR. |

**Tugas admin (daftar kerja):** beranda menampilkan jumlah cucian `SELESAI`
yang **belum dihubungi**. Daftar pesanan punya filter "Belum dihubungi"
(`GET /api/orders?belumDihubungi=true`) sehingga tidak ada cucian selesai yang
terlupakan.

**Aturan transisi:**

```
DITERIMA ──→ PROSES ──→ SELESAI ──→ DIAMBIL
    │           │           │
    └───────────┴───────────┴──→ (VOID, oleh OWNER)
```

Transisi lain (mis. `DITERIMA → DIAMBIL`) **ditolak** dengan 422 `TRANSISI_INVALID`.
Perubahan ke `DIAMBIL` tidak memakai endpoint status biasa; langkah itu wajib
melalui `POST /api/orders/:id/serahkan` agar pembayaran/piutang ikut tercatat.
Status tidak boleh mundur (mis. `SELESAI → PROSES`) kecuali OWNER yang
mengoreksi secara sengaja (open question Q-04).

**Pemetaan ke requirement:** F-30 … F-36.

### C8. Serah terima (pelanggan menjemput)

| # | Langkah | Detail |
|---|---|---|
| C8.1 | Admin membuka pesanan `SELESAI` | Tombol utama: **Serahkan & Bayar**. |
| C8.2 | Sistem menampilkan sisa tagihan | Total, sudah dibayar, sisa. |
| C8.3 | Pelanggan membayar (opsional) | Metode TUNAI/QRIS/TRANSFER. Kembalian dihitung server. |
| C8.4 | Admin menekan "Serahkan" | `POST /api/orders/:id/serahkan` mencatat pembayaran **dan** status `DIAMBIL` dalam satu transaksi SERIALIZABLE. |
| C8.5 | Bila belum dibayar | Boleh — sisa menjadi piutang. Sistem menampilkan peringatan sebelum menyerahkan dan meminta tanggal janji bayar (`jatuhTempo`). |
| C8.6 | Penagihan | Piutang yang melewati `jatuhTempo` muncul di beranda dan filter "Jatuh tempo" (`GET /api/orders?jatuhTempo=true`); hanya piutang yang benar-benar belum lunas. |
| C8.7 | Retry aman | `idempotencyKey` yang sama tidak menambah pembayaran/riwayat. |

Serah terima hanya boleh dari status `SELESAI`; status lain ditolak
`BELUM_SELESAI`. Serah terima kedua ditolak `SUDAH_DIAMBIL`.

---

## 5. Proses D — Pencatatan Pembayaran

**Pelaku:** Kasir (OWNER juga boleh) · **Waktu target:** < 5 detik

### D1. Memilih pesanan

Kasir mencari pesanan lewat nomor nota (`ZZ-20261021-0007`) atau nama pelanggan.
Layar langsung menampilkan: total, sudah dibayar, sisa tagihan, status pembayaran.

### D2. Memilih metode

| Metode | Kelebihan | Kendala |
|---|---|---|
| **TUNAI** | Uang diterima fisik | Boleh lebih → hitung kembalian |
| **QRIS** | Saldo langsung masuk | **Tidak boleh** melebihi sisa tagihan |
| **TRANSFER** | Transfer bank | **Tidak boleh** melebihi sisa tagihan |

> QRIS dicatat **manual** — tidak ada integrasi API. Kasir melihat pembayaran
> di aplikasi QRIS/HP-nya lalu mengetik nominalnya. Field `referensi` untuk
> mencatat kode/merchant (open question Q-03).

### D3. Menghitung kembalian (server-side)

```
sisaTagihan = total − totalDibayar

TUNAI:
  kembalian  = max(0, nominal − sisaTagihan)
  dikredit   = nominal − kembalian

QRIS / TRANSFER:
  jika nominal > sisaTagihan → TOLAK (422 NOMINAL_TERLALU_BESAR)
  kembalian  = 0
  dikredit   = nominal
```

Kembalian **tidak pernah** diambil dari input klien. Kasir mengetik uang yang
diterima; server yang menentukan kembalian dan yang meng-credit pesanan.

### D4. Keamanan transaksi (anti-tabrakan)

Dua kasir bisa menekan "Simpan" pada saat bersamaan untuk pesanan yang sama.
Perlindungan berlapis:

1. **Idempotensi** — `idempotencyKey` UNIQUE di `Payment`. Kirim ulang dengan key
   yang sama → pembayaran **tidak** diduplikasi; response mengembalikan pembayaran
   lama dengan flag `dibuatBaru: false`.
2. **Isolasi SERIALIZABLE** — transaksi pembayaran dijalankan pada level
   `SERIALIZABLE`; PostgreSQL mendeteksi write conflict dan membatalkan salah satu.
3. **Retry otomatis** — helper `serializableTransaction` mengulang sampai 3 kali
   untuk error `P2034` (serialization failure) sebelum menyerah.
4. **Validasi di dalam transaksi** — sisa tagihan dicek ulang *setelah* lock,
   sehingga total terbayar tidak mungkin melebihi total.

### D5. Memperbarui status pembayaran

Diturunkan, tidak disimpan:

| Kondisi | Status |
|---|---|
| `totalDibayar == 0` | `BELUM_BAYAR` |
| `0 < totalDibayar < total` | `SEBAGIAN` |
| `totalDibayar >= total` | `LUNAS` |
| pesanan void | `VOID` |

### D6. Aturan penolakan

| Situasi | Hasil |
|---|---|
| Pesanan sudah LUNAS | 409 `SUDAH_LUNAS` |
| Pesanan void | 409 `PESANAN_VOID` |
| Nominal ≤ 0 | 422 |
| QRIS/TRANSFER melebihi sisa | 422 `NOMINAL_TERLALU_BESAR` |
| OPERATOR yang mencoba | 403 |

**Pemetaan ke requirement:** F-40 … F-57.

---

## 6. Proses E — Pembatalan Pesanan (Void)

**Pelaku:** OWNER saja

| # | Langkah | Detail |
|---|---|---|
| E1 | OWNER membuka pesanan | — |
| E2 | OWNER memilih "Batalkan pesanan" | — |
| E3 | OWNER mengisi alasan | Wajib, min. 3 karakter. |
| E4 | Sistem memvalidasi | Pesanan belum void, alasan minimal 3 karakter. |
| E5 | Bila sudah ada pembayaran | OWNER **wajib** menentukan nominal refund (0 bila uang tidak dikembalikan) dan metode refund. Refund tidak boleh melebihi `totalDibayar`. |
| E6 | Sistem menandai void | `voidedAt`, `voidAlasan`, `voidedById` terisi. **Data tidak dihapus.** Bila refund > 0, `Expense` kategori `REFUND` dibuat dalam transaksi yang sama. |
| E7 | Dampak laporan | Pesanan dikeluarkan dari omzet, jumlah pesanan, dan piutang. Pembayaran yang pernah masuk **tetap** dihitung sebagai penerimaan kas; refund mengurangi laba kas sebagai pengeluaran. |
| E8 | Jejak audit | `AuditLog` mencatat aksi `VOID_PESANAN` beserta alasan dan keputusan refund. |

Dengan aturan ini, pembatalan tidak bisa dipakai untuk “menghilangkan” uang
yang sudah diterima. Contoh: pesanan Rp70.000 dibayar tunai lalu dibatalkan
dengan refund penuh → penerimaan kas Rp70.000, pengeluaran Rp70.000, laba kas
Rp0, omzet Rp0, piutang Rp0.

**Pemetaan ke requirement:** F-60 … F-65.

---

## 7. Proses F — Pengeluaran & Pemasukan Lain

**Pelaku:** OWNER

### F1. Pengeluaran

1. OWNER membuka menu Pengeluaran → "Catat Pengeluaran".
2. Memilih kategori (BAHAN_BAKU, GAJI, LISTRIK_GAS, SEWA, TRANSPORTASI, PERAWATAN, REFUND, LAIN_LAIN).
3. Mengisi keterangan, nominal, metode bayar, dan tanggal.
4. Sistem menyimpan + mencatat audit.
5. Pengeluaran langsung mengurangi **laba kas** pada hari tersebut.

> Biaya listrik/gas akibat menjemur saat musim hujan ikut dicatat sebagai
> LISTRIK_GAS (lihat open question Q-06).

### F2. Pemasukan Lain

1. OWNER membuka menu Keuangan → "Pemasukan Lain".
2. Kategori: PENJUALAN_BARANG (mis. jual hanger/sapu), JASA_TAMBAHAN, LAIN_LAIN.
3. Pengisian serupa; menambah **penerimaan kas**.

### F3. Ekspor

OWNER dapat mengekspor daftar pengeluaran ke CSV (pemisah `;`, BOM UTF-8 → rapi di Excel).

**Pemetaan ke requirement:** F-70 … F-74.

---

## 8. Proses G — Inventori Bahan

**Pelaku:** OWNER

| # | Langkah | Tipe Mutasi | Stok Bertanda |
|---|---|---|---|
| G1 | Beli deterjen, catat | `MASUK` | `+` |
| G2 | Pakai deterjen untuk cucian | `KELUAR` | `−` |
| G3 | Opname: hitung fisik vs sistem | `PENYESUAIAN` | `−` atau `+` (selisih) |

**Prinsip:** `stok = SUM(qty seluruh mutasi)`. Tidak ada kolom stok yang dikurangi.
Tiap mutasi menyimpan `stokSebelum` & `stokSesudah` untuk-jejak audit.

`KELUAR` melebihi stok → 422 `STOK_TIDAK_CUKUP`.
Stok ≤ `stokMinimum` → ditandai "stok menipis" di daftar.

> Di MVP, pemakaian bahan **tidak** otomatis terpotong dari setiap pesanan.
> Yang mencatat pemakaian adalah OWNER secara manual.
> (open question Q-05 — aturan rasio konsumsi belum disetujui.)

**Pemetaan ke requirement:** F-110 … F-117.

---

## 9. Proses H — Laporan Harian & Pemantauan Arus Kas

**Pelaku:** OWNER

Alur pemeriksaan kas oleh pemilik setiap malam:

1. Buka **Keuangan** → pilih rentang tanggal (default: hari ini).
2. Baca angka:
   - **Omzet** — nilai pekerjaan yang diterima hari ini.
   - **Penerimaan kas** — uang yang benar-benar masuk hari ini (tunai + QRIS + transfer + pemasukan lain).
   - **Pengeluaran** — uang yang keluar hari ini.
   - **Laba kas** = penerimaan kas − pengeluaran. *(Bukan laba bersih — HPP belum dihitung.)*
   - **Piutang** — sisa tagihan seluruh pesanan aktif, lintas tanggal.
3. Cocokkan **rincian per metode bayar** dengan setoran Tunai/QRIS harian.
4. Cocokkan **rincian per kategori pengeluaran** dengan nota belanja.
5. Ekspor CSV bila perlu untuk pembukuan.

### Kenapa Omzet ≠ Penerimaan Kas

Contoh nyata:

| Hari | Events | Omzet hari itu | Penerimaan kas hari itu |
|---|---|---|---|
| 21 Okt | Pesanan 70.000 diterima | **70.000** | 0 |
| 22 Okt | Pelanggan bayar 70.000 | 0 | **70.000** |

Kalau hanya ada satu angka, pemilik tidak tahu apakah "omzet hari ini nol" berarti
cucian belum laku atau uangnya masuk tetapi tercatat di hari lain. Dua angka
memisahkan **pekerjaan** dari **uang**.

**Pemetaan ke requirement:** F-80 … F-86.

---

## 10. Proses I — Mode Offline (P3.5)

**Pelaku:** Kasir (saat internet mati)

| # | Langkah | Detail |
|---|---|---|
| I1 | Kasir mencatat pesanan | Gagal kirim → tersimpan di **antrean lokal** (IndexedDB) dengan `clientRequestId` UUID. |
| I2 | UI memberi umpan balik | Badge "Menunggu sinkron (1)" + nota sementara bernomor lokal. |
| I3 | Koneksi kembali | Antrean dikirim berurutan. |
| I4 | Server memproses | Idempotensi mencegah duplikasi. Response di-cache agar antrean bisa dihapus. |
| I5 | UI memperbarui | Badge jadi "Tersinkron". |
| I6 | Gagal sinkron | Item tetap di antrean, tandai "gagal" + alasan (mis. timeout, 422). Bisa dicoba ulang manual. |

**Batas MVP offline:** hanya **pembuatan pesanan** dan **pencatatan pembayaran**
yang didukung offline. Pembayaran offline memakai `idempotencyKey` lokal; server
tetap memvalidasi nominal terhadap sisa tagihan, sehingga antrean bisa ditolak
server (mis. QRIS melebihi sisa) — UI menjelaskan alasannya.

**Pemetaan ke requirement:** F-120 … F-124.

---

## 11. Proses J — Otomatisasi & Pemeliharaan

| Proses | Pemicu | Perilaku |
|---|---|---|
| Migrasi database | Deploy | `prisma migrate deploy` dijalankan otomatis di `startCommand` Render. Tidak destruktif. |
| Backup database | Cron 02:00 WIB harian | GitHub Actions → `pg_dump` → artifact (retensi 14 hari). |
| Keep-alive API | Setiap 10 menit, 06:00–21:00 WIB | Pinger ke `/api/health` (tanpa query DB) agar Render Free tidak tidur. |
| Pemeliharaan DB Supabase | mingguan | Pinging mencegah project Free ter-pause setelah 7 hari idle. |

---

## 12. Ringkasan Peran vs Proses

| Proses | OWNER | KASIR | OPERATOR |
|---|:--:|:--:|:--:|
| Login | ✅ | ✅ | ✅ |
| B — Buat pesanan (POS) | ✅ | ✅ | ❌ |
| C — Ubah status pengerjaan | ✅ | ✅ | ✅ |
| D — Catat pembayaran | ✅ | ✅ | ❌ |
| E — Void pesanan | ✅ | ❌ | ❌ |
| F — Pengeluaran / pemasukan lain | ✅ | ❌ | ❌ |
| G — Mutasi stok (API) | ✅ | ❌ | ❌ |
| H — Laporan keuangan | ✅ | ❌ | ❌ (UI sembunyikan angka) |
| I — Antrean offline | ✅ | ✅ | ❌ |
| Kelola pengguna & layanan | ✅ | ❌ | ❌ |

---

## 13. Metrik Proses (untuk perbaikan nanti)

| Metrik | Target | Cara Ukur |
|---|---|---|
| Waktu input pesanan | < 10 detik | waktu input layar POS |
| Waktu pencatatan pembayaran | < 5 detik | waktu isi form pembayaran |
| Jumlah pesanan per kasir per jam | ≥ 8 | jumlah pesanan / jam shift |
| Tingkat kegagalan sinkron offline | < 2% | item gagal / total antrean |
| Piutang menumpuk > 7 hari | 0 | laporan piutang per umur |

---

## 14. Alur yang Belum Terdefinisikan (menunggu jawaban pemilik)

Bagian-bagian ini **sengaja** ditandai di dokumen, karena jawabannya mengubah
struktur data:

1. **Harga & satuan** — apakah ada tipe layanan lain (mis. satuan per item)?
   Apakah harga/kg bisa berubah harian (mis. musim)?
2. **Model pembayaran** — apakah ada DP wajib? Berapa minimal DP?
3. **Field QRIS** — apa yang perlu dicatat manual (kode QR, merchant, nama bank)?
4. **Stok** — jenis bahan apa saja, stok minimum berapa, dan apakah ada rasio
   konsumsi per kg/item?
5. **Musim hujan** — biaya pengeringan masuk kategori biaya laundry (HPP) atau
   sebagai biaya umum (LISTRIK_GAS)?
6. **Kapasitas harian** — berapa kg/hari yang bisa dicuci? Perlu untuk proyeksi.
7. **Piutang** — apakah ada tenggat pembayaran & bunga?
8. **Promosi** — siapa yang boleh memberi diskon, dan apakah ada batasannya?

Detail dan opsi jawaban ada di [open-questions.md](open-questions.md).
