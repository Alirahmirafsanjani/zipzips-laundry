# Arsitektur — ZIP-ZIPS LAUNDRI

Versi: 1.0 · Dewasa: MVP (P1–P5)

---

## 1. Prinsip Arsitektur

| Prinsip | Penerapan |
|---|---|
| **Sederhana** | Monorepo 2 app (backend + frontend). Tidak ada microservices, tidak ada message broker, tidak ada Redis. |
| **Ruang lingkup fitur (feature-scoped)** | Backend dibagi per modul: `src/modules/<fitur>/{routes,service,schema}.js`. Menambah fitur = menambah 1 folder. |
| **Logika bisnis di server** | Client hanya mengirim niat ("buat pesanan 3 kg"); server yang menghitung harga, total, kembalian, status. |
| **Money as Int** | Semua nominal rupiah adalah integer. Tidak ada float. |
| **Kebenaran di database** | Idempotensi, counter, dan agregasi stok dijamin constraint/transaksi DB, bukan oleh kode aplikasi saja. |
| **Satu sumber kebenaran** | `backend/prisma/schema.prisma` adalah definisi data. Frontend punya tipe TypeScript yang dicerminkan dari sana. |
| **Gratis tapi unearthable** | Hanya layanan free tier; tidak ada fitur yang butuh paket berbayar. |

---

## 2. Diagram Sistem

```
┌──────────────────────────────┐
│  Browser / HP (kasir, owner) │
│  React 19 SPA (Vite 8)      │
│  - localStorage: token       │
│  - IndexedDB: outbox (P3.5)  │
└──────────────┬───────────────┘
               │ HTTPS  (JSON + Bearer token)
               ▼
┌──────────────────────────────┐
│  Render Static Site          │
│  (frontend, CDN gratis)      │
└──────────────┬───────────────┘
               │ fetch /api/*
               ▼
┌──────────────────────────────────────────────┐
│  Render Free Web Service  (backend)         │
│  Express 5                                   │
│  helmet · CORS · rate limit                  │
│  /api/auth  /api/orders  /api/payments ...   │
└──────────────┬───────────────────────────────┘
               │ Prisma (session pooler :5432)
               ▼
┌──────────────────────────────────────────────┐
│  Supabase Free (PostgreSQL 16)               │
│  14 tabel · 10 enum                          │
└──────────────────────────────────────────────┘

GitHub Actions (cron 02:00 WIB) ──pg_dump──▶ Artifact backup (retensi 14 hari)
```

---

## 3. Backend

### 3.1 Tumpukan

| Komponen | Versi | Alasan |
|---|---|---|
| Node.js | 24 LTS | Runtime server & build |
| Express | 5.x | HTTP framework minimal, matang, mudah dibaca |
| Prisma | 6.x | Type-safe ORM + migrasi versioned + client generator |
| PostgreSQL | 16 | Database relasional, JSONB, transaksi SERIALIZABLE |
| Zod | 4.x | Validasi input di satu tempat (body/query/params) |
| jsonwebtoken | 9.x | JWT HS256 |
| bcryptjs | 3.x | Hash password (pure JS, tanpa native build) |
| helmet / cors / express-rate-limit | — | Keamanan dasar HTTP |
| vitest + supertest | — | Integration test terhadap API sungguhan |

### 3.2 Struktur Modul

```
src/
├── app.js              # assembly: middleware → routes → error handler
├── server.js           # entry point, graceful shutdown
├── config/index.js     # semua env dibaca di satu tempat
├── lib/
│   ├── prisma.js       # singleton PrismaClient
│   ├── http.js         # pembungkus response { data, meta } / { error }
│   ├── errors.js       # HttpError + kode error
│   ├── token.js        # issue & verify JWT
│   ├── serialize.js    # serialisasi Prisma → JSON (Date → ISO, Decimal → number)
│   ├── wib.js          # konversi & rentang tanggal WIB
│   ├── transaction.js  # serializableTransaction + retry P2034
│   ├── order-no.js     # nomor nota atomik via Counter
│   └── audit.js        # tulis AuditLog
├── middleware/
│   ├── auth.js         # verifikasi Bearer token → req.user
│   ├── authorize.js    # cek role
│   ├── validate.js     # Zod → req.valid.{body,query,params}
│   ├── not-found.js    # 404
│   └── error-handler.js# pemetaan error → JSON konsisten
├── modules/<fitur>/
│   ├── <fitur>.routes.js
│   ├── <fitur>.service.js
│   └── <fitur>.schema.js
└── tests/              # integration test
```

### 3.3 Kontrak Response

**Sukses:**

```json
{ "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

`meta` hanya ada pada endpoint berpaginasi.

**Gagal:**

```json
{
  "error": {
    "code": "NOMINAL_TERLALU_BESAR",
    "message": "Nominal pembayaran melebihi sisa tagihan.",
    "details": [{ "field": "nominal", "message": "...", "code": "too_big" }]
  }
}
```

`details` hanya ada pada error validasi (422).

### 3.4 Kode Error

| HTTP | Kode | Arti |
|---|---|---|
| 400 | `BAD_REQUEST` | Permintaan tidak valid secara umum |
| 401 | `UNAUTHORIZED` | Token hilang / invalid / kedaluwarsa |
| 403 | `FORBIDDEN` | Role tidak berwenang |
| 404 | `NOT_FOUND` | Data tidak ada |
| 409 | `CONFLICT` / `SUDAH_LUNAS` / `PESANAN_VOID` / `SUDAH_VOID` / `USERNAME_TAKEN` / `OWNER_TERAKHIR` | Konflik state |
| 422 | `VALIDATION_ERROR` | Gagal validasi Zod (dengan `details`) |
| 422 | `LAYANAN_TIDAK_ADA` / `DISKON_TERLALU_BESAR` / `NOMINAL_TERLALU_BESAR` / `STOK_TIDAK_CUKUP` / `TRANSISI_INVALID` / `TANGGAL_INVALID` | Gagal aturan bisnis |
| 429 | `RATE_LIMITED` | Terlalu banyak request |
| 500 | `INTERNAL_ERROR` | Bug server (detail disembunyikan di produksi) |

### 3.5 Catatan Penting Express 5

- **`req.query` adalah getter.** Menugasinya langsung akan error
  (`Cannot set property query of #<IncomingMessage> which has only a getter`).
  Karena itu hasil validasi disimpan di `req.valid.query` dan `req.valid.params`,
  bukan ditimpa ke `req.query`.
- **Body parser otomatis.** `express.json()` sudah parsing JSON.
- **Async error tertangani.** Error di handler async otomatis diteruskan ke
  error handler Express 5.

### 3.6 Transaksi & Konsistensi

**`lib/transaction.js`** menyediakan `serializableTransaction(fn)`:

```js
export async function serializableTransaction(fn) {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      // P2034 = write conflict / serialization failure → aman diulang
      if (error.code === 'P2034' && attempt < MAX_RETRY) {
        await sleep(backoff(attempt))
        continue
      }
      throw error
    }
  }
}
```

Dipakai di:
- `payments.service.js` — mencegah over-payment saat 2 kasir bayar bersamaan.
- `orders.service.js` — pembuatan pesanan + counter nomor nota + item.

**Idempotensi:**

| Mekanisme | Field | Perilaku |
|---|---|---|
| Idempotent create | `Order.clientRequestId` (UNIQUE) | POST ulang dengan key sama → pesanan lama dikembalikan |
| Idempotent create | `Payment.idempotencyKey` (UNIQUE) | POST ulang dengan key sama → pembayaran lama dikembalikan, `dibuatBaru: false` |

Keduanya memungkinkan mode offline-first tanpa menghasilkan transaksi ganda.

**Nomor nota** (`lib/order-no.js`): `Counter` di-`upsert` + `increment` di dalam
transaksi yang sama → nomor `ZZ-YYYYMMDD-NNNN` selalu unik, bahkan bila dua kasir
membuat pesanan pada detik yang sama.

### 3.7 Zona Waktu

Aturan: **database menyimpan UTC, aplikasi menghitung hari dalam WIB.**

`lib/wib.js` menyediakan:
- `todayWib()` → `YYYY-MM-DD` hari ini menurut WIB.
- `wibDate(date)` → konversi `Date` → `YYYY-MM-DD` WIB.
- `wibRange(dari, sampai)` → rentang `Date` (UTC) yang mencakup 1 hari penuh WIB.

Semua query laporan memakai `wibRange`, sehingga pesanan jam 23:30 WIB masuk ke
hari yang benar dan bukan ke hari berikutnya.

---

## 4. Frontend

### 4.1 Tumpukan

| Komponen | Versi |
|---|---|
| React | 19.x |
| Vite | 8.x |
| TypeScript | 5.x |
| Tailwind CSS | 4.x (`@theme` di `index.css`) |
| React Router | 7.x |
| @tanstack/react-query | 5.x |

Tanpa `react-hook-form` / `@hookform/resolvers` — form memakai **controlled state
plain** + validasi Zod di sisi klien. Alasannya: hanya ada handful form sederhana,
dan menambah 2 dependensi tidak sebanding dengan beban pemelihatannya.

### 4.2 Struktur

```
src/
├── main.tsx
├── index.css               # Tailwind 4 + tema brand
├── app/
│   ├── routes.tsx          # definisi route
│   └── guard.tsx           # proteksi route by role
├── components/
│   ├── layout/AppLayout.tsx# sidebar + header + <Outlet />
│   └── ui/                 # Button, Card, Input, Badge, Modal, Toast, EmptyState
├── hooks/useAuth.tsx       # context auth + login/logout
├── lib/
│   ├── api.ts              # client + envelope handling + 401 auto-logout
│   ├── format.ts           # rupiah, tanggal, status label
│   └── cn.ts               # class merger
├── pages/                  # 11 halaman
└── types/index.ts          # tipe yang mencerminkan API
```

### 4.3 Client API

`lib/api.ts`$:
- Menyisipkan `Authorization: Bearer <token>` otomatis.
- Membungkus respons `{ data, meta }` → langsung mengembalikan `data`.
- Menangani `{ error }` → melempar `ApiError` dengan `code` + `message` + `details`.
- **401 → hapus token + redirect ke login** secara otomatis.
- Menyediakan `ApiError` untuk penanganan error per-field di form.

### 4.4 State & Penyimpanan

| Data | Tempat | Alasan |
|---|---|---|
| Token | `localStorage` | MVP, satu outlet, perangkat milik toko |
| Data server | React Query cache | invalidasi per mutasi |
| Antrean offline | IndexedDB | survives reload, kapasitas besar |
| Preferensi UI (filter terakhir) | `localStorage` | kecil, sering dipakai |

---

## 5. Keamanan

| Lapisan | Measures |
|---|---|
| Password | bcrypt (cost default), tidak pernah dikembalikan API, tidak pernah di-log |
| Sesi | JWT HS256, secret dari env, expire 12 jam |
| Otorisasi | Middleware `authorize('OWNER','KASIR')` per rute |
| Input | Zod di setiap body/query/params; output di-escape React |
| HTTP | helmet (header keamanan), CORS whitelist origin, `express.json({ limit: '1mb' })` |
| Rate limit | Global 300/menit (prod) + login 10/15 menit/IP |
| Kredensial | Hanya di env. `.env` di-ignore git. `seed` membuat password acak & mencetaknya. |
| Data sensitif | `passwordHash` tidak pernah masuk response (dicek di serializer) |
| SQL injection | Prisma parameterized query; tidak ada SQL mentah dari input user |
| Transaksi bisnis | Void butuh OWNER + alasan; semua perubahan sensitif masuk `AuditLog` |

### 5.1 Kenapa Bearer token di localStorage (MVP) & risiko thereof

Kelebihan: sederhana, tidak ada cookie, tidak ada CSRF, logout instan di semua tab.

Risiko yang ada: XSS bisa membaca token. Mitigasi yang dipakai:
- React meng-escape output secara default.
- helmet+CSP (CSP dimatikan karena API murni JSON, frontend di origin terpisah).
- Tidak ada `dangerouslySetInnerHTML` di mana pun.
- dependencies di-audit (npm audit) sebelum deploy.

Rencana ke depan (P7+): pindah ke cookie `httpOnly` + `sameSite=strict` bila
diminta secara sadar. Ini **tidak** dikerjakan di MVP agar kompleksitas tetap rendah.

---

## 6. Deployment

### 6.1 Komponen

| Komponen | Layanan | Paket | Catatan |
|---|---|---|---|
| Frontend | Render Static Site | Free | Bangun otomatis dari repo, di-host di CDN Render |
| Backend | Render Web Service | Free | Web service tunggal, sleep setelah 15 menit idle |
| Database | Supabase | Free | PostgreSQL 16, 500 MB, pause setelah 7 hari idle |
| Backup | GitHub Actions | Free | Cron harian, artifact 14 hari |

### 6.2 Environment Variables

**Backend (Render):**

| Key | Nilai | Catatan |
|---|---|---|
| `NODE_ENV` | `production` | Mengaktifkan validasi JWT_SECRET & CORS ketat |
| `PORT` | `4000` | Render meng-inject `PORT` sendiri |
| `DATABASE_URL` | `postgresql://...@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=5&pool_timeout=20` | **WAJIB** session pooler port 5432 |
| `JWT_SECRET` | acak ≥ 32 karakter | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_EXPIRES_IN` | `12h` | |
| `CORS_ORIGIN` | URL static site Render | Dipisah koma bila multi origin |
| `LOGIN_RATE_LIMIT` | `10` | |

**Frontend (Render Static):**

| Key | Nilai |
|---|---|
| `VITE_API_URL` | URL API **tanpa** `/api` di akhir, contoh `https://zipzips-api.onrender.com` |

> Frontend menyertakan `/api` di setiap path (`/api/orders`, `/api/auth/login`),
> jadi `VITE_API_URL` hanya berisi origin. Menulis `.../api` akan menghasilkan
> `/api/api/orders` dan semua request 404.

> `VITE_*` di-inline saat build. Mengubahnya butuh **rebuild**, bukan restart.

### 6.3 Kenapa Session Pooler (5432), bukan Transaction Pooler (6543)

Prisma Migrate dan `$transaction` interaktif membutuhkan **session state** dan
**prepared statement**. Transaction mode PgBouncer tidak mendukung keduanya —
hasilnya error saat migrasi atau saat transaksi berserial. Karena itu
`DATABASE_URL` selalu ke port 5432.

### 6.4 Render Free "Tidur" (Sleep)

Render Free_scale_free measured instance tidur setelah 15 menit idle. Dampak:
request pertama setelah tidur lambat (bisa 30–50 detik).

Mitigasi:
1. **Pinger keep-alive** — kecil di frontend, memanggil `/api/health` tiap 10 menit
   antara 06:00–21:00 WIB. Di luar jam itu, service boleh tidur (tidak ada transaksi).
2. **`/api/health` tanpa query DB** — stay fast, tidak membebani Supabase.
3. **UI "Menyambung…"** — saat request lambat, frontend menampilkan indikator
   bahwa koneksi sedang dibangun, bukan error.

### 6.5 Supabase Free "Pause"

Supabase Free me-pause project setelah 7 hari tanpa koneksi. Mitigasi:
- GitHub Actions cron harian melakukan ping ke `DATABASE_URL` (atau ke endpoint
  `/api/health` yang menyentuh DB) → project tetap aktif.

### 6.6 Backup

Supabase Free **tidak menyediakan** auto-backup. Karena itu:

`.github/workflows/backup.yml`:
- Cron `0 19 * * *` UTC (= 02:00 WIB).
- `pg_dump` → gzip → artifact GitHub (retensi 14 hari).
- Secret: `DATABASE_URL`.

Catatan: artifact GitHub punya retensi maksimal 90 hari dan kuota. Untuk data
< 500 MB, 14 hari sudah cukup. Backup **off-site** (drive/Bucket) adalah
langkah berikutnya yang disarankan setelah sistem stabil.

---

## 7. Troubleshooting

### 7.1 `Error: DEPTH_ZERO_SELF_SIGNED_CERT: self signed certificate`

**Arti:** Node/Prisma menolak sertifikat server karena sertifikat itu
self-signed (ditandatangani sendiri) atau chain-nya tidak dipercaya.

**Paling sering terjadi pada:**
- PostgreSQL remote / VM yang mengaktifkan TLS dengan sertifikat buatan sendiri.
- Proxy atau load balancer internal di depan database.
- Session pooler Supabase pada sebagian konfigurasi / region.

**Jalankan diagnostik:**

```bash
node scripts/check-db-connection.js
# atau dengan URL tertentu:
DATABASE_URL="postgresql://..." node scripts/check-db-connection.js
```

Skrip menguji DNS → TCP → negosiasi SSL PostgreSQL → query Prisma, lalu
menyprinting detail sertifikat (subject, issuer, berlaku sampai) dan
rekomendasi perbaikannya.

**Fix:**

| Solusi | Cara | Catatan |
|---|---|---|
| A. Nonaktifkan verifikasi CA (paling umum) | Tambahkan `&sslmode=no-verify` ke `DATABASE_URL` | Koneksi tetap **terenkripsi TLS**; hanya pemeriksaan sertifikat yang dilewati. Rekomendasi resmi Supabase untuk Prisma. Aman untuk free tier. |
| B. Ganti host | Pakai host yang sertifikatnya ditandatangani CA tepercaya | Contoh: session pooler Supabase (port 5432) |
| C. Kasih tahu Node tentang CA Anda | `NODE_EXTRA_CA_CERTS=/path/ke/ca.crt` | Untuk sertifikat self-signed milik sendiri |
| D. PostgreSQL lokal | `sslmode=disable` atau tanpa parameter sslmode | Aman karena lewat loopback |

Contoh untuk Supabase:

```
postgresql://postgres.PROJECTREF:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=no-verify&connection_limit=5&pool_timeout=20
```

> **Jangan** pakai `sslmode=no-verify` hanya untuk "`menghemat waktu`". Pastikan
> dulu bahwa yang Anda lewati memang hanya verifikasi CA, bukan sinyal bahwa
> Anda unknowingly terhubung ke host yang salah.

### 7.2 `P1001: Can't reach database server`

- Server DB mati? → nyalakan.
- Port salah? → session pooler = **5432**, transaction pooler = 6543.
- Firewall / IP whitelist → Supabase: Settings → Database → Connection.

### 7.3 `P1002: The database server was reached but timed out`

- `connection_limit=5` & `pool_timeout=20` sudah disetel.
- Kurangi `MAX_POOL_SIZE` di `lib/prisma.js` bila Render Free squeezer keras.

### 7.4 `P3005` / migrasi gagal

```bash
cd backend
npx prisma migrate status          # status migrasi
npx prisma migrate deploy          # terapkan yang tertunda
```

Jangan pernah `migrate reset` di produksi — itu menghapus data.

### 7.5 Render: "Service did not start"

Cek Render Dashboard → Logs. Penyebab umum:
- `JWT_SECRET` kurang dari 32 karakter → app menolak start (sesuai desain).
- `DATABASE_URL` kosong → app menolak start di produksi.
- `startCommand` gagal → pastikan `npm ci` && `prisma migrate deploy` && `npm start`.

### 7.6 Frontend: "Network Error" / CORS

- `CORS_ORIGIN` backend harus **persis sama** dengan origin frontend (tanpa trailing slash).
- `VITE_API_URL` salah → rebuild static site.

### 7.7 Token sering logout sendiri

- `JWT_EXPIRES_IN` terlalu pendek.
- Systime server Render ≠ jam lokal → toleransi_clock_skew tidak dikonfigurasi.

---

## 8. Batas & Utang Teknis yang Diketahui

| Utang | Dampak | Rencana |
|---|---|---|
| Token di `localStorage` | XSS bisa mencuri token | P7: cookie `httpOnly` |
| Stok tidak berkurang otomatis | OWNER catat manual | P4/P5: aturan konsumsi (Q-05) |
| HPP belum dihitung | "Laba kas" ≠ laba bersih | P4: input HPP per layanan |
| Kapasitas harian belum ada | Tidak bisa proyeksi beban | P4 (Q-07) |
| Offline baru untuk order & payment | Modul lain butuh online | P3.5 lanjutan |
| Backup hanya di artifact GitHub | Bukan off-site jangka panjang | Setelah stabil: Bucket / drive |
| Render Free 750 jam/bulan | Usage perlu dipantau | Alert di workflow |

---

## 9. Referensi

- Model data: [database-design.md](database-design.md)
- Proses bisnis: [business-process.md](business-process.md)
- Kebutuhan: [requirements.md](requirements.md)
- Rencana pengerjaan: [implementation-plan.md](implementation-plan.md)
- Pengujian: [testing-plan.md](testing-plan.md)
- Pertanyaan terbuka: [open-questions.md](open-questions.md)
