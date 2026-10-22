# ZIP-ZIPS LAUNDRI — Sistem Informasi Laundry

Sistem informasi untuk operasional laundry **ZIP-ZIPS LAUNDRI**, outlet Bantul, Yogyakarta.
Dibangun untuk owner + 3 karyawan (1 kasir, 2 karangian) dengan fokus pada:

1. **POS laundry** (poni, kiloan, satuan) — cepat dipakai kasir.
2. **Manajemen pesanan** — status pengerjaan terpisah dari status pembayaran.
3. **Pencatatan pembayaran** — tunai / QRIS / transfer,manual, tanpa integrasi API.
4. **Omzet & laporan keuangan** — omzet, penerimaan kas, pengeluaran, laba kas, piutang.
5. **Inventori bahan** — stok berbasis mutasi (ledger), bukan pengurangan kolom.

Semua uang disimpan sebagai **integer rupiah penuh** (tanpa desimal).

---

## Tumpukan Teknologi

| Lapisan | Teknologi | Alasan |
|---|---|---|
| Backend | Express 5 + Prisma 6 + PostgreSQL 16 | Pola yang sudah terbukti pada STIMBADUTA |
| Frontend | React 19 + Vite 8 + Tailwind CSS 4 | Build cepat, UI ringan, mudah di-maintain |
| Auth | JWT Bearer token (localStorage) | Sederhana untuk MVP satu outlet |
| Hosting | Render Static Site + Render Free Web Service + Supabase Free | Biaya Rp0 |
| Backup | GitHub Actions (jadwal) + `pg_dump` | Supabase Free tidak punya auto-backup |

Referensi: [docs/architecture.md](docs/architecture.md)

---

## Struktur Repo

```
zipzips-laundry/
├── backend/                  # REST API (Express 5 + Prisma)
│   ├── prisma/
│   │   ├── schema.prisma     # sumber kebenaran model data
│   │   ├── migrations/       # SQL migrasi (versioned)
│   │   └── seed.js           # data awal (idempoten)
│   ├── src/
│   │   ├── app.js            # assembly aplikasi + middleware
│   │   ├── server.js         # entry point HTTP
│   │   ├── config/           # konfigurasi dari env
│   │   ├── lib/              # utilitas (prisma, token, audit, wib, transaksi)
│   │   ├── middleware/       # auth, authorize, validate, error-handler
│   │   ├── modules/          # fitur: auth, users, services, orders, payments,
│   │   │                     #         customers, inventory, finance, dashboard,
│   │   │                     #         settings, audit, health
│   │   └── tests/            # integration test (vitest + supertest)
│   ├── .env.example
│   └── vitest.config.js
├── frontend/                 # SPA (React 19 + Vite + Tailwind 4)
│   └── src/
│       ├── app/              # routing + guard
│       ├── components/       # UI kit & layout
│       ├── hooks/            # useAuth
│       ├── lib/              # api client, format, cn
│       ├── pages/            # Login, Dashboard, Pos, Orders, OrderDetail,
│       │                     #   Customers, Finance, Inventory, Users, Settings
│       └── types/
├── docs/                     # dokumentasi (lihat daftar di bawah)
├── scripts/                  # utilitas operasional
├── render.yaml               # Render Blueprint
└── .github/workflows/        # backup terjadwal
```

---

## Menjalankan Secara Lokal

### Prasyarat

- Node.js **v24+** (dibangun & diuji di v24.21.0)
- PostgreSQL **16+** lokal (opsional jika memakai Supabase)
- npm 10+ (npm workspaces)

### 1. Install dependensi

```bash
cd zipzips-laundry
npm install
```

### 2. Siapkan environment backend

```bash
cp backend/.env.example backend/.env
```

Isi minimal `backend/.env`:

```dotenv
NODE_ENV=development
PORT=4000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zipzips?schema=public"
JWT_SECRET="<minimal 32 karakter, buat acak>"
CORS_ORIGIN="http://localhost:5173"
```

> **Tidak ada kredensial yang disimpan di dalam repo.** `.env` sudah masuk `.gitignore`.

### 3. Siapkan database

```bash
cd backend
npx prisma generate          # generate Prisma Client
npx prisma migrate deploy    # terapkan migrasi (aman, non-destruktif)
npm run db:seed              # data awal + cetak kredensial acak
```

`seed.js` **tidak pernah memakai password hardcoded**. Bila `SEED_OWNER_PASSWORD` /
`SEED_KASIR_PASSWORD` / `SEED_OPERATOR_PASSWORD` tidak diisi, seed membuat
password acak lalu **mencetakkannya di terminal**. Catat password itu.

### 4. Jalankan backend

```bash
cd backend
npm run dev                  # nodemon, http://localhost:4000
```

Cek kesehatan:

```bash
curl http://localhost:4000/api/health
```

### 5. Jalankan frontend

```bash
cd frontend
cp .env.example .env         # set VITE_API_URL=http://localhost:4000
npm run dev                  # http://localhost:5173
```

### 6. Jalankan test

```bash
cd backend
npm test                     # 55 integration test, butuh DB `zipzips_test`
```

> Test memakai database **terpisah** (`zipzips_test`) dan menolak jalan bila
> `TEST_DATABASE_URL` tidak mengandung kata "test". Buat sekali:
> `createdb zipzips_test` lalu jalankan `DATABASE_URL="...zipzips_test..." npx prisma migrate deploy`.

---

## Perintah yang Tersedia

| Lokasi | Perintah | Fungsi |
|---|---|---|
| root | `npm run dev` | jalankan backend + frontend bersamaan |
| root | `npm run build` | build frontend |
| root | `npm test` | jalankan test backend |
| backend | `npm run dev` | API dengan nodemon |
| backend | `npm run start` | API mode production |
| backend | `npm run db:migrate` | buat & jalankan migrasi (dev) |
| backend | `npm run db:deploy` | jalankan migrasi (prod/CI) |
| backend | `npm run db:seed` | isi data awal |
| backend | `npm run db:studio` | Prisma Studio |
| frontend | `npm run dev` | Vite dev server |
| frontend | `npm run build` | build produksi → `dist/` |
| frontend | `npm run preview` | pratinjau build |

---

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [docs/requirements.md](docs/requirements.md) | Kebutuhan fungsional & non-fungsional, peran pengguna |
| [docs/business-process.md](docs/business-process.md) | Alur operasional: terima order → laundry → ambil → bayar |
| [docs/architecture.md](docs/architecture.md) | Arsitektur, API, keamanan, deployment |
| [docs/database-design.md](docs/database-design.md) | Model data, relasi, indeks, keputusan skema |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Roadmap fase P1–P9 + status implementasi |
| [docs/testing-plan.md](docs/testing-plan.md) | Strategi dan cakupan pengujian |
| [docs/open-questions.md](docs/open-questions.md) | Pertanyaan bisnis yang **belum** dijawab pemilik |

---

## Ringkasan API

Semua endpoint diawali `/api`. Autentikasi memakai header
`Authorization: Bearer <token>`.

| Metode | Endpoint | Peran |
|---|---|---|
| GET | `/api/health` | publik (tanpa query DB) |
| POST | `/api/auth/login` | publik |
| GET | `/api/auth/me` | semua |
| POST | `/api/auth/change-password` | semua |
| GET/POST | `/api/users`, PATCH `/api/users/:id`, POST `/api/users/:id/reset-password` | OWNER |
| GET/POST | `/api/services`, PATCH `/api/services/:id`, POST `/api/services/:id/arsipkan` | semua (tulis: OWNER) |
| GET/POST | `/api/customers`, PATCH `/api/customers/:id` | semua (tulis: OWNER/KASIR) |
| GET/POST | `/api/orders`, GET `/api/orders/:id` | semua |
| PATCH | `/api/orders/:id/status` | OWNER/KASIR/OPERATOR |
| PATCH | `/api/orders/:id/catatan` | OWNER/KASIR/OPERATOR |
| POST | `/api/orders/:id/void` | OWNER |
| GET/POST | `/api/orders/:id/pembayaran` | OWNER/KASIR |
| GET | `/api/payments` | OWNER |
| GET | `/api/inventory/produk`, `/api/inventory/mutasi` | OWNER/KASIR |
| POST/PATCH | `/api/inventory/produk`, `/api/inventory/mutasi` | OWNER |
| GET | `/api/finance/ringkasan`, `/api/finance/laba-rugi` | OWNER |
| GET/POST | `/api/finance/pengeluaran`, `/api/finance/pemasukan-lain` | OWNER |
| GET | `/api/finance/ekspor/pengeluaran.csv` | OWNER |
| GET | `/api/dashboard/summary` | semua |
| GET | `/api/settings`, PUT `/api/settings/:key` | OWNER (publik: `/publik`) |
| GET | `/api/audit` | OWNER |

---

## Prinsip Desain yang Dihormati

1. **Transaksi tidak pernah dihapus.** Pembatalan = `voidedAt` + alasan + jejak audit.
2. **Status pengerjaan ≠ status pembayaran.** Status bayar diturunkan dari
   `totalDibayar` vs `total`, tidak disimpan sebagai kolom.
3. **Harga di-snapshot** di `OrderItem`. Ubah harga master tidak mengubah nota lama.
4. **Stok = SUM(`StockMovement`).** Tidak ada kolom stok yang dikurangi manual.
5. **Idempotensi bawaan.** `Order.clientRequestId` dan `Payment.idempotencyKey`
   UNIQUE → retry offline & klik ganda tidak menghasilkan transaksi ganda.
6. **Kembalian dihitung server.** Hanya untuk TUNAI; QRIS/transfer tidak boleh
   melebihi sisa tagihan.
7. **Tidak ada kredensial di dalam kode.** Semua lewat environment variable.

---

## Deployment

Ringkas; detail ada di [docs/architecture.md](docs/architecture.md).

1. Buat database Supabase (Free) → salin **Session pooler** (port **5432**),
   bukan transaction pooler (6543).
2. Push repo ke GitHub.
3. Di Render: **New → Blueprint** → arahkan ke repo ini (pakai `render.yaml`).
4. Isi environment variable: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`.
5. Backup otomatis berjalan via GitHub Actions setiap malam.

> Render Free **tidur setelah 15 menit idle**. Aplikasi menangani ini dengan
> pinger 06:00–21:00 WIB (lihat `docs/architecture.md` § Pem resiliency).
