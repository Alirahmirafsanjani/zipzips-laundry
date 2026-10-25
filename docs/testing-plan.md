# Rencana Pengujian — ZIP-ZIPS LAUNDRI

Status: **P1 selesai — 83 integration test otomatis, semua lulus.**

---

## 1. Strategi

| Lapisan | Alat | Cakupan | Status |
|---|---|---|---|
| **Unit** | — | Diperiksa manual di dalam service; logika murni (wib, order-no, csv) | ⚠️ belum ada file unit test terpisah |
| **Integration (API)** | vitest + supertest | Seluruh endpoint & aturan bisnis | ✅ 83 test, 7 file |
| **Build/type** | `tsc --noEmit` + `vite build` | Kompilasi frontend | ✅ bersih |
| **Manual / UAT** | Checklist | Alur dunia nyata | 📋 lihat § 6 |
| **E2E browser** | — | Alur klik di browser | ❌ belum (P7, kalau waktu memungkinkan) |

Filosofi: **integration test mengukul hal yang paling mungkin rusak** —
payload perhitungan uang, transisi status, idempotensi, dan otorisasi role.
Uji unit untuk kode utilitas murni ditambahkan bila utility tumbuh.

---

## 2. Lingkungan Uji

| Aspek | Nilai |
|---|---|
| Runner | vitest 5 (`backend/vitest.config.js`) |
| HTTP client | supertest (menginjeksi app Express tanpa membuka port) |
| Database | `zipzips_test` — **wajib** terpisah dari database dev/production |
| Pemisahan env | `src/tests/setup.js` override `DATABASE_URL` **sebelum** modul Prisma diimpor |
| Pengaman | `setup.js` melempar error bila `TEST_DATABASE_URL` tidak mengandung kata `"test"` |
| Isolasi | `resetDatabase()` di `beforeEach` setiap file |
| Paralelisme | **Nonaktif** (`fileParallelism: false`) — semua file berbagi satu DB |
| Timeout | 20 detik per test / hook |

### Menyiapkan database uji

```bash
createdb zipzips_test
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zipzips_test?schema=public" \
  npx prisma migrate deploy
```

Override manual:

```bash
TEST_DATABASE_URL="postgresql://.../zipzips_test?schema=public" npm test
```

---

## 3. Cakupan Test yang Ada

### 3.1 `auth.test.js` — 14 test

| # | Skenario | Ekspektasi |
|---|---|---|
| 1 | Login dengan kredensial benar | 200, token dikembalikan, profil ikut, **passwordHash tidak ikut** |
| 2 | Password salah | 401, pesan generik (tidak membocorkan keberadaan akun) |
| 3 | Field wajib tidak lengkap | 422 + `details` |
| 4 | `/auth/me` dengan token valid | 200, profil benar |
| 5 | `/auth/me` tanpa token | 401 |
| 6 | `/auth/me` dengan token ngawur | 401 |
| 7 | Kasir → `/api/finance/ringkasan` | **403** |
| 8 | Owner → `/api/finance/ringkasan` | 200 |
| 9 | Operator buat pesanan | **403** |
| 10 | Operator lihat daftar pesanan | 200 |
| 11 | Kasir void pesanan | **403** |
| 12 | Owner buat user kasir baru | 201, passwordHash tidak dikembalikan |
| 13 | Username ganda | **409** `USERNAME_TAKEN` |
| 14 | Menonaktifkan owner terakhir | **409** `OWNER_TERAKHIR` |

### 3.2 `orders.test.js` — 21 test

| # | Skenario | Ekspektasi |
|---|---|---|
| 1 | Total dihitung dari master harga di server | 3 kg × 7000 = 21000, item punya `hargaSatuan` & `namaService` |
| 2 | Nomor nota | `ZZ-YYYYMMDD-NNNN`, dua pesanan berbeda nomor |
| 3 | **Idempotensi `clientRequestId`** | POST dua kali dengan key sama → **1 pesanan**, id & nomor sama |
| 4 | Diskon | 14000 − 5000 = 9000; diskon > subtotal → 422 `DISKON_TERLALU_BESAR` |
| 5 | Pesanan tanpa item | 422 |
| 6 | Layanan tidak ada | 422 `LAYANAN_TIDAK_ADA` |
| 7 | **Snapshot harga** | Harga master diubah setelahnya → nota lama tetap 14000, `hargaSatuan` tetap 7000 |
| 8 | Snapshot identitas pelanggan | `namaPelanggan` = nama dari profil, `noHp` ikut |
| 9 | Ubah status + riwayat | `PROSES`, riwayat 2 baris (`DITERIMA` → `PROSES`) |
| 10 | Transisi status tidak sah | 422 `TRANSISI_INVALID` |
| 11 | Operator boleh ubah status | 200 |
| 12 | Void oleh owner | `voidedAt` terisi, `statusPembayaran` = `VOID`, **tidak muncul** di daftar default, muncul dengan `includeVoided=true` |
| 13 | Void tanpa alasan memadai | 422 |
| 14 | Void dua kali | **409** `SUDAH_VOID` |
| 15 | Cari pesanan by nomor nota | 1 hasil |
| 16 | Filter status | `PROSES` → 1, `DITERIMA` → 0 |
| 17 | Operator tidak menerima angka keuangan | `total`, `totalDibayar`, `sisaTagihan`, `statusPembayaran`, `payments`, dan harga item tidak ada |
| 18 | Harga satuan di atas master | 422 `HARGA_MELEBIHI_MASTER` |
| 19 | `DIAMBIL` lewat endpoint status | 422 `TRANSISI_INVALID`; wajib lewat `serahkan` |
| 20 | Operator isi catatan pengerjaan | 200; field uang tetap tidak ada |
| 21 | Operator ubah catatan pelanggan | 403 |

### 3.3 `payments.test.js` — 10 test

| # | Skenario | Ekspektasi |
|---|---|---|
| 1 | Pembayaran tunai penuh | 201, `kembalian` 0, `totalDibayar` 14000, status `LUNAS` |
| 2 | **Kembalian tunai** | Bayar 20000 atas tagihan 14000 → `kembalian` 6000, yang dikredit **14000**, status `LUNAS` |
| 3 | QRIS melebihi sisa | **422** `NOMINAL_TERLALU_BESAR` |
| 4 | Pembayaran sebagian | 10000 → `SEBAGIAN`, sisa 11000; lalu 11000 → `LUNAS` |
| 5 | **Idempotensi `idempotencyKey`** | POST dua kali key sama → **1 baris payment**, id sama, `dibuatBaru: false`, `totalDibayar` tetap 14000 |
| 6 | Bayar pada pesanan lunas | **409** `SUDAH_LUNAS` |
| 7 | Bayar pada pesanan void | **409** `PESANAN_VOID` |
| 8 | **Anti-tabrakan (over-payment)** | 2 pembayaran QRIS 10000 bersamaan atas tagihan 14000 → **satu sukses, satu ditolak 422**; `totalDibayar ≤ total` |
| 9 | Nominal ≤ 0 | 422 |
| 10 | Operator catat pembayaran | **403** |

> Test #8 adalah pembuktian bahwa `serializableTransaction` + retry bekerja pada
> kondisi nyata, bukan hanya di atas kertas.

### 3.4 `finance.test.js` — 10 test

| # | Skenario | Ekspektasi |
|---|---|---|
| 1 | **Pisahkan 4 metrik** | Omzet 70000, penerimaan kas 70000, pengeluaran 25000, laba kas 45000, 1 pesanan |
| 2 | **Omzet ≠ penerimaan kas** | Pesanan bergeser 2 hari → omzet hari ini 0, penerimaan hari ini 0 |
| 3 | **Void + refund penuh** | Omzet 0, jumlah pesanan 0, penerimaan kas 70000, pengeluaran REFUND 70000, laba kas 0 |
| 4 | **Piutang lintas tanggal** | Bayar 30000 dari 70000 → piutang 40000 |
| 5 | Pemisahan laundry vs pemasukan lain | `penerimaanLaundry` 7000, `penerimaanLain` 5000, `penerimaanKas` 12000, `perMetode.QRIS` 7000, `perMetode.TUNAI` 5000 |
| 6 | Rincian harian | 1 slot, `tanggal` benar, omzet 14000, jumlah pesanan 1 |
| 7 | Rincian pengeluaran per kategori | BAHAN_BAKU 10000, GAJI 50000, LISTRIK_GAS 15000, total 75000 |
| 8 | Kas masuk berdasarkan tanggal pembayaran | Pembayaran kemarin → omzet hari ini tetap 7000, diterima hari ini 0, sisa tagihan 0 |
| 9 | Ringkasan beranda | Omzet hari ini 28000, diterima 14000, belum dibayar 14000, 1 pesanan, `statusCount.DITERIMA` 1, piutang 14000 |
| 10 | Total pesanan aktif | Pesanan yang sudah `DIAMBIL` tidak dihitung aktif |

### 3.5 `inventory.test.js` — 7 test

| # | Skenario | Ekspektasi |
|---|---|---|
| 1 | Stok awal 0 + mutasi MASUK | `stok` 0 → 10000, `stokSebelum` 0, `stokSesudah` 10000 |
| 2 | **Stok = SUM(mutasi)** | MASUK 10000, KELUAR 2500 → `stok` 7500 |
| 3 | KELUAR melebihi stok | **422** `STOK_TIDAK_CUKUP` |
| 4 | **PENYESUAIAN (opname)** | stok 10000 → opname 9500 → `qty` **−500**, `stokSesudah` 9500 |
| 5 | Stok menipis | stok 3000 ≤ minimum 5000 → `stokMenipis` true |
| 6 | Kasir catat mutasi | **403** |
| 7 | PENYESUAIAN tanpa `stokAkhir` | 422 |

### 3.6 `handover.test.js` — 15 test

| # | Skenario | Ekspektasi |
|---|---|---|
| 1–2 | Berat kiloan desimal | 2,5 kg dihitung benar; desimal ditolak untuk layanan ITEM |
| 3 | Transisi status linear | `DITERIMA → SELESAI` ditolak 422; harus melalui `PROSES` |
| 4–5 | Kontak pelanggan | Hanya setelah `SELESAI`; WhatsApp tanpa nomor HP ditolak |
| 6 | Serah terima sebelum selesai | 422 |
| 7 | Serah terima + bayar lunas | Status `DIAMBIL`, pembayaran tercatat, piutang 0 |
| 8 | Serah terima tanpa bayar | Tetap `DIAMBIL`; sisa menjadi piutang |
| 9–12 | Idempotensi | Retry pesanan/pembayaran tidak menggandakan; key lintas pesanan ditolak |
| 13 | Koreksi OWNER | `SELESAI → PROSES` mereset bukti “sudah dihubungi” |
| 14–15 | Janji bayar | Tersimpan bila masih ada sisa; ditolak bila tanggal masa lalu; tidak disimpan bila lunas |

### 3.7 `refund.test.js` — 6 test

| # | Skenario | Ekspektasi |
|---|---|---|
| 1 | Void pesanan berbayar tanpa keputusan refund | **422** `REFUND_WAJIB_DIPUTUSKAN`; pesanan tetap aktif |
| 2 | Refund penuh | `Expense` kategori `REFUND`; kas masuk tetap 70000; laba kas 0 |
| 3 | Refund 0 eksplisit | Void sukses, tidak ada `Expense`; kas masuk dan laba kas tetap |
| 4 | Refund sebagian | Kas masuk 70000, pengeluaran 30000, laba kas 40000 |
| 5 | Refund melebihi pembayaran | **422** `REFUND_MELEBIHI_PEMBAYARAN` |
| 6 | Void pesanan belum berbayar | Sukses tanpa `Expense` |

---

## 4. Aturan Test yang Berlaku

1. **Test memakai API sungguhan**, bukan mocking service. Yang diuji adalah
   perilaku yang dilihat kasir, termasuk kode status HTTP dan isi `error.code`.
2. **Tidak ada sleep.** Untuk race condition, dua request dikirim via
   `Promise.all` — persis seperti dua kasir menekan tombol bersamaan.
3. **Setiap test berdiri sendiri** (`beforeEach` → reset DB).
4. **Nama test menjelaskan perilaku**, bukan implementasi:
   `"MEMBUKTIKAN idempotensi: clientRequestId yang sama menghasilkan pesanan yang sama"`.
5. **Test yang gagal = bug**, bukan test yang perlu "disesuaikan" agar hijau.
   Bila aturan bisnis memang berubah, dokumentasinya ikut diperbarui.

---

## 5. Test yang Belum Ada (Rencana)

| ID | Test | Fase |
|---|---|---|
| T-01 | Service pelanggan: CRUD, pagination, FK SetNull saat pelanggan dihapus | P2 |
| T-02 | Master layanan: arsipkan, ubah harga, validasi harga ≥ 0 | P2 |
| T-03 | Ringkasan beranda per role (OPERATOR tidak melihat angka) | P2 |
| T-04 | Endpoint settings: publik vs owner, PUT key | P2 |
| T-05 | Audit log:<void catat aksi, void hanya OWNER | P2 |
| T-06 | **Outbox offline**: antrean IndexedDB, sinkron, retry, duplikasi | P3.5 |
| T-07 | Idempotensi end-to-end: client offline → sync → retry → 1 transaksi | P3.5 |
| T-08 | Ekspor CSV: escaping kutip, pemisah `;`, BOM | P2 |
| T-09 | Laporan: rentang tanggal di ujung bulan, tahun kabisat, zona WIB | P4 |
| T-10 | HPP & laba bersih | P4 |
| T-11 | Backup: jalankan `pg_dump`, pulihkan ke DB kosong, bandingkan jumlah baris | P5 |
| T-12 | Render deploy smoke test: `prisma migrate deploy` di startCommand | P5 |

---

## 6. Uji Manual (UAT) — Checklist

Dilakukan pemilik setelah deploy. Target: **semua centang**.

### A. Autentikasi

- [ ] Login dengan benar → masuk ke beranda.
- [ ] Login dengan password salah → pesan "Username atau kata sandi salah".
- [ ] Coba 11× login gagal → muncul pesan rate limit.
- [ ] Logout → kembali ke halaman login, tombol "kembali" tidak melewati guard.
- [ ] Buka URL halaman beranda tanpa login → diarahkan ke login.

### B. POS

- [ ] Buat pesanan 3 kg cuci kiloan → total terhitung benar.
- [ ] Nomor nota tampil `ZZ-YYYYMMDD-0001`, pesanan kedua `0002`.
- [ ] Ganti harga master layanan → nota lama **tidak** berubah.
- [ ] Beri diskon melebihi subtotal → ditolak dengan pesan jelas.
- [ ] Tekan "Simpan" 2× cepat → hanya **1** pesanan (idempotensi).
- [ ] Pesanan tanpa nama pelanggan tetap bisa dibuat.

### C. Status pengerjaan

- [ ] DITERIMA → PROSES → SELESAI berhasil lewat tombol status.
- [ ] SELESAI → DIAMBIL berhasil lewat "Serahkan & Bayar"; coba lewat endpoint status → ditolak.
- [ ] Coba DITERIMA → DIAMBIL langsung → ditolak.
- [ ] Timeline menampilkan riwayat lengkap dengan nama petugas.
- [ ] Login sebagai operator → bisa ubah status sampai SELESAI dan mengisi catatan pengerjaan; tidak bisa membuat pesanan, melihat uang, atau menyerahkan cucian.

### D. Pembayaran

- [ ] Bayar tunai pas → status `LUNAS`, kembalian Rp0.
- [ ] Bayar tunai Rp20.000 untuk tagihan Rp14.000 → kembalian Rp6.000, status `LUNAS`.
- [ ] Bayar QRIS Rp20.000 untuk tagihan Rp14.000 → **ditolak**.
- [ ] Bayar sebagian → status `SEBAGIAN`, sisa tagihan tampil benar.
- [ ] Bayar lagi sampai lunas → status `LUNAS`.
- [ ] Klik "Simpan" 2× cepat → hanya **1** pembayaran tercatat.
- [ ] Coba bayar pesanan yang sudah lunas → ditolak.

### E. Pembatalan

- [ ] Owner membatalkan pesanan belum bayar → alasan wajib, pesanan hilang dari daftar.
- [ ] Owner membatalkan pesanan berbayar → wajib mengisi refund; coba refund 0 dan refund sebagian.
- [ ] Setelah refund penuh, laporan menunjukkan kas masuk dan pengeluaran REFUND yang sama.
- [ ] Menu "Tampilkan yang dibatalkan" → pesanan ada, ditandai.
- [ ] Kasir mencoba membatalkan → tidak ada tombol / ditolak 403.

### F. Keuangan

- [ ] Catat pengeluaran Rp25.000 → laba kas berkurang Rp25.000.
- [ ] Catat pemasukan lain Rp5.000 → penerimaan kas bertambah Rp5.000.
- [ ] Ringkasan hari ini: omzet, diterima, pengeluaran, laba kas, piutang — cocok manual.
- [ ] Ekspor CSV → file terbuka rapi di Excel, angka terbaca.
- [ ] Kasir/operator membuka menu Keuangan → tidak ada / akses ditolak.

### G. Stok

- [ ] Catat pembelian deterjen 10.000 ml → stok 10.000.
- [ ] Catat pemakaian 2.500 → stok 7.500.
- [ ] Catat pengeluaran lebih besar dari stok → ditolak.
- [ ] Opname fisik 9.500 → selisih −500 tercatat.
- [ ] Produk di bawah stok minimum → badge "menipis".

### H. Offline (P3.5)

- [ ] Matikan internet (matikan Wi-Fi HP) → catat pesanan → muncul badge "menunggu sinkron".
- [ ] Nyalakan internet → badge berubah "tersinkron", pesanan muncul di daftar.
- [ ] Matikan internet → catat 3 pesanan → nyalakan → hanya **3** pesanan (bukan 6).

### I. Deployment & Pemeliharaan

- [ ] Buka aplikasi dari HP (bukan laptop) → layout rapi, input lancar.
- [ ] Render Dashboard → tidak ada error di log.
- [ ] Backup GitHub Actions → artifact `.sql.gz` muncul (retensi 14 hari).
- [ ] Pulihkan artifact ke database kosong → jumlah baris cocok.

---

## 7. Perintah

```bash
# Semua test
cd backend && npm test

# Satu file
cd backend && npx vitest run src/tests/payments.test.js

# Mode watch
cd backend && npm run test:watch

# Dengan coverage
cd backend && npx vitest run --coverage

# Type check + build frontend
cd frontend && npx tsc --noEmit && npm run build
```

---

## 8. Status Saat Ini

```
Test Files  7 passed (7)
     Tests  83 passed (83)
  Duration  ~6 detik
```

Yang **belum** diverifikasi otomatis: rendering UI (React), perilaku offline
di browser, dan deployment Render + Supabase. Ketiganya masuk daftar UAT manual.
