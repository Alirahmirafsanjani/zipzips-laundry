# Desain Basis Data — ZIP-ZIPS LAUNDRI

Sumber kebenaran: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma)
Migrasi: [`backend/prisma/migrations/`](../backend/prisma/migrations/)

---

## 1. Ringkasan

| Aspek | Nilai |
|---|---|
| Engine | PostgreSQL 16 |
| Tabel | 14 |
| Enum | 10 |
| Skema | `public` (default) |
| Tipe uang | `Int` (rupiah penuh) |
| Waktu | `timestamptz` (UTC), konversi ke WIB di aplikasi |
| ID | `uuid` v4, dibuat oleh Prisma (`@default(uuid())`) |
| Hapus data | **Tidak pernah.**soft-delete via `voidedAt` / `aktif` |

---

## 2. Entity Relationship Diagram

```
                        ┌────────────┐
                        │    User    │  OWNER / KASIR / OPERATOR
                        └─────┬──────┘
          ┌───────────────────┼───────────────────┬──────────────┐
          │                   │                   │              │
          │ 1:N               │ 1:N               │ 1:N          │ 1:N
          ▼                   ▼                   ▼              ▼
   ┌─────────────┐   ┌─────────────┐     ┌───────────┐  ┌────────────┐
   │   Order     │   │  Payment    │     │  Expense  │  │ AuditLog   │
   └──────┬──────┘   └─────────────┘     └───────────┘  └────────────┘
          │ 1:N                    │
          ├──────────┐             │
          ▼          ▼             │
 ┌─────────────┐ ┌────────────────────┐
 │  OrderItem  │ │ OrderStatusHistory │
 └──────┬──────┘ └────────────────────┘
        │ N:1
        ▼
 ┌─────────────┐        ┌──────────────┐
 │   Service   │        │   Customer   │──1:N──▶ Order
 └─────────────┘        └──────────────┘

 ┌─────────────┐        ┌──────────────────┐
 │   Product   │──1:N──▶│ StockMovement    │
 └─────────────┘        └──────────────────┘

 ┌──────────────┐   ┌─────────────────┐   ┌───────────┐
 │ OtherIncome  │   │     Setting     │   │  Counter  │
 └──────────────┘   └─────────────────┘   └───────────┘
```

---

## 3. Daftar Tabel

### 3.1 `users`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | uuid | PK | |
| `nama` | text | NOT NULL | Nama tampilan |
| `username` | text | **UNIQUE** NOT NULL | Login, case-insensitive di service |
| `passwordHash` | text | NOT NULL | bcrypt hash |
| `role` | Role | NOT NULL | OWNER / KASIR / OPERATOR |
| `noHp` | text | NULL | |
| `aktif` | boolean | NOT NULL default `true` | Nonaktif = tidak bisa login |
| `createdAt` / `updatedAt` | timestamptz | | |

Relasi: 1:N ke `orders` (createdBy), `orders` (voidedBy), `payments`, `expenses`,
`other_incomes`, `stock_movements`, `order_status_history`, `audit_logs`.

### 3.2 `customers`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | uuid | PK | |
| `kode` | text | **UNIQUE** NOT NULL | `C0001`, `C0002`, … |
| `nama` | text | NOT NULL | |
| `noHp` | text | NULL | |
| `alamat` | text | NULL | |
| `catatan` | text | NULL | |
| `createdAt` / `updatedAt` | timestamptz | | |

Index: `noHp`, `nama`.
Relasi: 1:N ke `orders` (`onDelete: SetNull` — hapus pelanggan tidak menghapus pesanan).

> **Keputusan:** pelanggan **tidak** bisa dihapus dari sistem, hanya dinonaktifkan
> secara logis bila perlu. Ini menjaga integritas riwayat transaksi.

### 3.3 `services`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | uuid | PK | |
| `kode` | text | **UNIQUE** NOT NULL | `KILO`, `SATUAN`, `EXPRESS` |
| `nama` | text | NOT NULL | |
| `satuan` | SatuanLayanan | NOT NULL | KG / ITEM |
| `hargaDefault` | int | NOT NULL | Rupiah per satuan |
| `estimasiHari` | int | NOT NULL default `1` | Estimasi pengerjaan |
| `deskripsi` | text | NULL | |
| `isAktif` | boolean | NOT NULL default `true` | Arsip = `false` |
| `createdAt` / `updatedAt` | timestamptz | | |

### 3.4 `orders` — tabel pusat

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | uuid | PK | |
| `nomor` | text | **UNIQUE** NOT NULL | `ZZ-20261021-0007` |
| `clientRequestId` | text | **UNIQUE**, NULL | Idempotensi pembuatan pesanan |
| `customerId` | uuid | FK → `customers`, NULL, SetNull | |
| `namaPelanggan` | text | NOT NULL | **Snapshot** identitas saat transaksi |
| `noHp` | text | NULL | **Snapshot** |
| `statusOrder` | StatusOrder | NOT NULL default `DITERIMA` | DITERIMA/PROSES/SELESAI/DIAMBIL |
| `sumber` | SumberOrder | NOT NULL default `ONLINE` | ONLINE / OFFLINE |
| `subtotal` | int | NOT NULL | Σ item sebelum diskon |
| `diskon` | int | NOT NULL default `0` | |
| `total` | int | NOT NULL | `subtotal − diskon` |
| `totalDibayar` | int | NOT NULL default `0` | Dijumlahkan server dari `payments` |
| `tanggalMasuk` | timestamptz | NOT NULL default `now()` | Dasar perhitungan **omzet** |
| `estimasiSelesai` | timestamptz | NULL | |
| `tanggalSelesai` | timestamptz | NULL | |
| `tanggalDiambil` | timestamptz | NULL | |
| `catatan` | text | NULL | Catatan kasir |
| `catatanPengerjaan` | text | NULL | Catatan karangian |
| `createdById` | uuid | FK → `users`, NOT NULL | |
| `voidedById` | uuid | FK → `users`, NULL | |
| `voidedAt` | timestamptz | NULL | **Soft delete** |
| `voidAlasan` | text | NULL | Wajib bila void |
| `createdAt` / `updatedAt` | timestamptz | | |

Index: `tanggalMasuk`, `statusOrder`, `customerId`, `namaPelanggan`.

**Status pembayaran TIDAK disimpan.** Diturunkan:

```js
if (order.voidedAt) return 'VOID'
if (order.totalDibayar === 0) return 'BELUM_BAYAR'
if (order.totalDibayar < order.total) return 'SEBAGIAN'
return 'LUNAS'
```

### 3.5 `order_items`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | uuid | PK | |
| `orderId` | uuid | FK → `orders`, **Cascade** | |
| `serviceId` | uuid | FK → `services`, NOT NULL | |
| `namaService` | text | NOT NULL | **Snapshot** |
| `satuan` | SatuanLayanan | NOT NULL | **Snapshot** |
| `qty` | int | NOT NULL | Kg / jumlah item |
| `hargaSatuan` | int | NOT NULL | **Snapshot** |
| `subtotal` | int | NOT NULL | `qty × hargaSatuan` |
| `catatan` | text | NULL | |

> **Mengapa snapshot?** Kalau hanya `serviceId` yang disimpan dan harga diambil
> dari master saat render, maka nota lama ikut berubah harga ketika master
> diperbarui — dan laporan omzet tahun lalu jadi bohong. Snapshot harga
> disimpan per item.

### 3.6 `payments`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | uuid | PK | |
| `orderId` | uuid | FK → `orders`, Cascade | |
| `metode` | MetodeBayar | NOT NULL | TUNAI / QRIS / TRANSFER |
| `nominal` | int | NOT NULL | Uang yang diterima (TUNAI = uang di tangan) |
| `kembalian` | int | NOT NULL default `0` | **Selalu dihitung server** |
| `referensi` | text | NULL | Kode QRIS / merchant / nama bank |
| `catatan` | text | NULL | |
| `idempotencyKey` | text | **UNIQUE** NOT NULL | Anti-duplikasi |
| `createdById` | uuid | FK → `users`, NOT NULL | |
| `createdAt` | timestamptz | NOT NULL default `now()` | Dasar perhitungan **penerimaan kas** |

Index: `orderId`, `createdAt`.

> **Penting:** `nominal` = uang yang diterima; `kembalian` = kembalian ke pelanggan.
> Yang dikredit ke `order.totalDibayar` adalah `nominal − kembalian`.
> **Penting:** kalau `nominal` > `total` untuk TUNAI, `nominal` tetap `nominal`
> (uang masuk ke tangan), tapi hanya selisihnya yang mengurangi piutang.

### 3.7 `order_status_history`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | uuid | PK | |
| `orderId` | uuid | FK → `orders`, Cascade | |
| `dari` | StatusOrder | NULL | NULL = pembuatan awal |
| `ke` | StatusOrder | NOT NULL | |
| `olehId` | uuid | FK → `users`, NOT NULL | |
| `catatan` | text | NULL | |
| `pada` | timestamptz | NOT NULL default `now()` | |

Index: `(orderId, pada)`.

### 3.8 `expenses`

| Kolom | Tipe | Constraint |
|---|---|---|
| `id` | uuid | PK |
| `tanggal` | timestamptz | NOT NULL default `now()` |
| `kategori` | KategoriPengeluaran | NOT NULL |
| `keterangan` | text | NOT NULL |
| `nominal` | int | NOT NULL |
| `metodeBayar` | MetodeBayar | NOT NULL |
| `refType` / `refId` | text | NULL — tautan ke purchase order / mutasi stok |
| `createdById` | uuid | FK → `users`, NOT NULL |
| `createdAt` | timestamptz | NOT NULL default `now()` |

Index: `tanggal`, `kategori`.

### 3.9 `other_incomes`

| Kolom | Tipe | Constraint |
|---|---|---|
| `id` | uuid | PK |
| `tanggal` | timestamptz | NOT NULL default `now()` |
| `kategori` | KategoriPemasukanLain | NOT NULL |
| `keterangan` | text | NOT NULL |
| `nominal` | int | NOT NULL |
| `metodeBayar` | MetodeBayar | NOT NULL |
| `createdById` | uuid | FK → `users`, NOT NULL |
| `createdAt` | timestamptz | NOT NULL default `now()` |

Index: `tanggal`.

### 3.10 `products`

| Kolom | Tipe | Constraint |
|---|---|---|
| `id` | uuid | PK |
| `kode` | text | **UNIQUE** NOT NULL |
| `nama` | text | NOT NULL |
| `satuan` | SatuanProduk | NOT NULL — ML / L / KG / PCS |
| `stokMinimum` | int | NOT NULL default `0` |
| `hargaBeliTerakhir` | int | NULL |
| `isAktif` | boolean | NOT NULL default `true` |
| `createdAt` / `updatedAt` | timestamptz | |

> **Tidak ada kolom `stok`.** Stok = `SUM(stock_movements.qty)`.

### 3.11 `stock_movements`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `id` | uuid | PK | |
| `productId` | uuid | FK → `products`, Cascade | |
| `tipe` | TipeMutasiStok | NOT NULL | MASUK / KELUAR / PENYESUAIAN |
| `qty` | int | NOT NULL | **Bertanda**: MASUK `+`, KELUAR/PENYESUAIAN `−` |
| `stokSebelum` | int | NULL | Denormalisasi untuk audit |
| `stokSesudah` | int | NULL | Denormalisasi untuk audit |
| `refType` / `refId` | text | NULL | Tautan sumber mutasi |
| `tanggal` | timestamptz | NOT NULL default `now()` | |
| `keterangan` | text | NULL | |
| `createdById` | uuid | FK → `users`, NOT NULL | |
| `createdAt` | timestamptz | NOT NULL default `now()` | |

Index: `(productId, tanggal)`, `tanggal`.

**Perhitungan stok:**

```sql
SELECT p.id, p.nama, COALESCE(SUM(m.qty), 0) AS stok
FROM products p
LEFT JOIN stock_movements m ON m."productId" = p.id
GROUP BY p.id;
```

> **Mengapa ledger, bukan kolom stok?** Karena kolom stok bisa menyimpang tanpa
> jejak (selalu ada bug yang lupa mengurangi). Dengan ledger, setiap perubahan
> stok bisa ditelusuri ke siapa & kapan, dan opname (`PENYESUAIAN`) menjadi
> entri biasa yang bisa diaudit.

### 3.12 `audit_logs`

| Kolom | Tipe | Constraint |
|---|---|---|
| `id` | uuid | PK |
| `userId` | uuid | FK → `users`, NULL, SetNull |
| `aksi` | text | NOT NULL — mis. `VOID_ORDER` |
| `entitas` | text | NOT NULL — mis. `Order` |
| `entitasId` | text | NOT NULL |
| `detail` | jsonb | NULL |
| `createdAt` | timestamptz | NOT NULL default `now()` |

Index: `(entitas, entitasId)`, `createdAt`, `userId`.

### 3.13 `settings`

| Kolom | Tipe | Constraint |
|---|---|---|
| `key` | text | PK |
| `value` | jsonb | NOT NULL |
| `updatedAt` | timestamptz | |
| `updatedBy` | text | NULL |

### 3.14 `counters`

| Kolom | Tipe | Constraint |
|---|---|---|
| `key` | text | PK — mis. `nota:20261021` |
| `value` | int | NOT NULL default `0` |
| `updatedAt` | timestamptz | |

---

## 4. Enum

| Enum | Nilai |
|---|---|
| `Role` | OWNER, KASIR, OPERATOR |
| `SatuanLayanan` | KG, ITEM |
| `StatusOrder` | DITERIMA, PROSES, SELESAI, DIAMBIL |
| `MetodeBayar` | TUNAI, QRIS, TRANSFER |
| `KategoriPengeluaran` | BAHAN_BAKU, GAJI, LISTRIK_GAS, SEWA, TRANSPORTASI, PERAWATAN, LAIN_LAIN |
| `KategoriPemasukanLain` | PENJUALAN_BARANG, JASA_TAMBAHAN, LAIN_LAIN |
| `TipeMutasiStok` | MASUK, KELUAR, PENYESUAIAN |
| `SatuanProduk` | ML, L, KG, PCS |
| `SumberOrder` | ONLINE, OFFLINE |

---

## 5. Definisi Metrik (terkunci)

```
OMZET        = SUM(orders.total)
                WHERE orders.voidedAt IS NULL
                  AND orders.tanggalMasuk BETWEEN wibRange(dari, sampai)

PENERIMAAN KAS = SUM(payments.nominal - payments.kembalian)
                + SUM(other_incomes.nominal)
                WHERE payments.order.voidedAt IS NULL
                  AND payments.createdAt BETWEEN wibRange(dari, sampai)
                  AND other_incomes.tanggal BETWEEN wibRange(dari, sampai)

PENGELUARAN  = SUM(expenses.nominal)
                WHERE expenses.tanggal BETWEEN wibRange(dari, sampai)

PIUTANG      = SUM(orders.total - orders.totalDibayar)
                WHERE orders.voidedAt IS NULL
                -- TIDAK dibatasi rentang tanggal

LABA KAS     = PENERIMAAN KAS - PENGELUARAN
```

**Konsekuensi yang harus dipahami:**

| Pertanyaan | Dijawab oleh |
|---|---|
| "Berapa omzet hari ini?" | `omzet` |
| "Berapa uang yang benar-benar masuk hari ini?" | `penerimaanKas` |
| "Berapa uang yang keluar hari ini?" | `pengeluaran` |
| "Sisa tagihan pelanggan yang belum bayar?" | `piutang` |
| "Berapa sisa kas setelah semua pengeluaran?" | `labaKas` |

> `labaKas` **bukan** laba bersih. HPP (deterjen, listrik per kg, gaji karangian)
> belum dialokasikan ke pesanan. Untuk MVP ini disengaja agar angkanya jujur
> dan mudah dipercaya pemilik.

---

## 6. Keputusan Desain & Alasannya

| # | Keputusan | Alasan | Alternatif yang ditolak |
|---|---|---|---|
| DD-01 | Uang `Int` | Rupiah tidak punya sen; `Float`/`Decimal` bikin pembulatan | `Decimal(12,2)` — overkill |
| DD-02 | Snapshot harga di `OrderItem` | Nota lama tidak boleh berubah | Normalisasi harga → laporan bohong |
| DD-03 | `totalDibayar` di-update server | Sumber tunggal, tidak bisa dimanipulasi klien | Hitung on-the-fly → lambat & prone |
| DD-04 | Stok = ledger, bukan kolom | Jejak audit + tidak bisa "hilang" | Kolom stok → sering selisih |
| DD-05 | Soft delete (`voidedAt`) | Data keuangan tidak boleh hilang | `DELETE` → rusak laporan |
| DD-06 | `clientRequestId` UNIQUE di Order | Idempotensi offline | Timestamp → duplikat saat retry |
| DD-07 | `idempotencyKey` UNIQUE di Payment | Klik ganda / retry tidak menggandakan kas | Cek manual → human error |
| DD-08 | Nomor nota via `Counter` atomik | Bebas bentrok tanpa lock table | `SELECT MAX(nomor)+1` → race condition |
| DD-09 | Status bayar turunan | Tidak bisa tidak sinkron dengan `totalDibayar` | Kolom status → bisa basi |
| DD-10 | `OrderStatusHistory` terpisah | Timeline siap tanpa log parsing | Log di `catatan` → tidak terstruktur |
| DD-11 | `Setting` JSON key-value | Konfigurasi sparse, tidak perlu tabel per setting | Tabel `settings` dengan kolom tetap → sering kosong |
| DD-12 | `AuditLog` JSONB detail | Bentuk detail varies per aksi | Kolom tetap → 90% NULL |
| DD-13 | `OtherIncome` terpisah dari `Expense` | Arus masuk & arus keluar punya jenis, kategori, dan tanda yang berbeda | Satu tabel `transactions` → laporan jadi rumit |
| DD-14 | Single `DATABASE_URL` (session pooler) | Prisma Migrate butuh session state | Transaction pooler → migrasi gagal |
| DD-15 | UUID v4 sebagai PK | Tidak perlu nomor urut, tidak membocorkan jumlah data | Integer auto-increment → bisa ditebak |
| DD-16 | `Customer` dipetakan ke tabel `customers` | Konsisten dengan naming tabel lain (lowercase plural) | — |

---

## 7. Integritas Referensial

| Relasi | On Delete | Alasan |
|---|---|---|
| `orders.customerId` → `customers.id` | `SetNull` | Pelanggan dihapus ≠ pesanan hilang |
| `orders.createdById` → `users.id` | `Restrict` | Order harus selalu punya pembuat |
| `orders.voidedById` → `users.id` | `SetNull` | — |
| `order_items.orderId` → `orders.id` | `Cascade` | Item tak bermakna tanpa order |
| `order_items.serviceId` → `services.id` | `Restrict` | Jangan sampai master hilang |
| `payments.orderId` → `orders.id` | `Cascade` | — |
| `order_status_history.orderId` → `orders.id` | `Cascade` | — |
| `expenses.createdById` → `users.id` | `Restrict` | — |
| `stock_movements.productId` → `products.id` | `Cascade` | — |
| `audit_logs.userId` → `users.id` | `SetNull` | Log tetap ada walau user dihapus |

---

## 8. Migrasi

- Satu migrasi awal: `20260101000000_init/migration.sql`.
- Dibuat dengan `prisma migrate diff --from-empty --to-schema-datamodel` agar
  persis mengikuti skema.
- Lock file: `prisma/migrations/migration_lock.toml` (`provider = "postgresql"`).

**Aturan:**

1. Migration baru = `npx prisma migrate dev --name <deskripsi>`.
2. Production = `npx prisma migrate deploy` (dipanggil otomatis di `startCommand` Render).
3. **Dilarang** `migrate reset` di produksi.
4. Migration yang mengubah data (bukan struktur) harus ditulis manual di SQL
   dan diberi `prisma migrate resolve` bila perlu.

---

## 9. Kapasitas & Performa

| Data | Perkiraan | Catatan |
|---|---|---|
| Pesanan | 15.000/tahun (50/hari) | ≈ 2 MB/tahun di `orders` + `order_items` |
| Payment | 20.000/tahun | |
| StockMovement | 5.000/tahun | |
| AuditLog | 50.000/tahun | Pertimbangkan retensi setelah 2 tahun |
| **Total** | **< 100 MB/tahun** | Jauh di bawah batas Supabase Free 500 MB |

Pertumbuhan **linear**, tidak eksponensial. Batas Supabase Free akan tercapai
pada ~4–5 tahun pemakaian normal, atau lebih cepat bila log audit bertumbuh.
Mitigasi bila perlu: arsipkan `audit_logs`older dari 2 tahun.

Indeks untuk setiap query utama sudah tersedia
(`tanggalMasuk`, `statusOrder`, `createdAt`, `tanggal`). Dengan ukuran data ini,
belum ada kebutuhan index tambahan atau partitioning.

---

## 10. Pertanyaan yang Belum Terjawab (dampak ke skema)

| # | Pertanyaan | Dampak ke skema |
|---|---|---|
| Q-02 | Batas override harga satuan | Constraint aplikasi (sudah ada batas kasar) |
| Q-03 | Field QRIS manual | `payments.referensi` sudah ada; mungkin perlu kolom tambahan |
| Q-04 | boleh kah status mundur / koreksi | Logika transisi di service |
| Q-05 | Rasio konsumsi bahan per kg/item | Tabel baru `service_consumptions` + trigger stok |
| Q-06 | Perlakuan biaya pengeringan | Kategori expense atau HPP per layanan |
| Q-07 | Kapasitas harian | Tabel/setting `kapasitas_harian` |
| Q-08 | Tenggat & bunga piutang | Kolom `dueDate` di `orders` |
| Q-09 | Batas diskon & wewenang | Constraint service |

Detail & opsi jawaban: [open-questions.md](open-questions.md)
