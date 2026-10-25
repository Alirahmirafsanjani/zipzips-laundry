# Rencana Implementasi — ZIP-ZIPS LAUNDRI

Metode: fase (phase), bukan sprint. Setiap fase menghasilkan **nilai yang bisa
dipakai pemilik** — bukan sekadar kode. Tidak ada fase yang menunggu fase
berikutnya untuk "berguna".

Status per 25 Oktober 2026: **P1 selesai & terverifikasi (83 test lulus); P5 siap deploy, menunggu remote Git.**

---

## 1. Peta Fase

```
P1 Foundation  ✅ Selesai   ─┐
P2 Pelanggan & Master  ✅ ─┤
P3 Offline (P3.5)      ⬜ ─┤
P4 Laporan & Keputusan ⬜ ─┤── 2 minggu pemakaian nyata ──┐
P5 Deployment & Backup  🟡 ─┘                              │
P6 Polish & UX          ⬜ ◀──────────────────────────────┘
P7 Pelaporan & Ekspor   ⬜
P8 Optimasi & Skala     ⬜
P9 Dokumentasi Final    ⬜
```

> **Jeda 2 minggu (P4 → P6)** bukan jeda kosong. Owner memakai sistemnya
> setiap hari. Temuan nyata selama 2 minggu itu lebih berharga daripada
> fitur baru.

---

## 2. Rincian Fase

### P1 — Foundation ✅

**Tujuan:** landasan yang bisa diuji dan dipakai lebih dulu, agar P2–P5
hanya menambahkan fitur di atas fondasi yang sudah benar.

**Deliverable:**
- ✅ Monorepo npm workspaces: `backend/`, `frontend/`, `docs/`, `scripts/`.
- ✅ Backend Express 5: `app.js`, `server.js`, config, middleware, lib.
- ✅ 12 modul: health, auth, users, services, customers, orders, payments,
  inventory, finance, dashboard, settings, audit.
- ✅ Prisma schema 14 model + 11 enum + migrasi awal + seed idempoten.
- ✅ Frontend React 19: 11 halaman, UI kit 7 komponen, routing + guard.
- ✅ Tailwind 4 dengan tema brand.
- ✅ 83 integration test, semuanya lulus.
- ✅ `tsc --noEmit` bersih, `vite build` sukses.

**Verifikasi:**
```
Test Files  7 passed (7)
     Tests  83 passed (83)
```

**Keputusan yang dikunci di fase ini:**
| # | Keputusan |
|---|---|
| D-01 | Stack: Express 5 + Prisma 6 + PostgreSQL + React 19 + Vite 8 + Tailwind 4 |
| D-04 | Struktur repo monorepo |
| D-06 | Prisma satu `DATABASE_URL` (session pooler), tanpa `directUrl` |
| D-07 | Nomor nota via `Counter` atomik → `ZZ-YYYYMMDD-NNNN` |
| D-08 | `Order.clientRequestId` UNIQUE + `Payment.idempotencyKey` UNIQUE |
| D-09 | Model `OrderStatusHistory` untuk timeline |
| D-12 | Model `OtherIncome` |
| D-13 | Model `Setting` (JSON) + `AuditLog` (JSON detail) |

---

### P2 — Pelanggan & Master Data ✅ (sebagian)

**Tujuan:** data induk yang rapi supaya P3/P4 tidak menebak.

| Item | Status |
|---|---|
| Master pelanggan (CRUD, cari, riwayat) | ✅ API selesai · ⏳ UI menyusul |
| Master layanan (CRUD, arsip, harga) | ✅ API selesai · ✅ UI |
| Halaman pengaturan (nama toko, alamat, WA) | ✅ API + UI |
| Manajemen pengguna | ✅ API + UI |
| Audit log viewer | ✅ API · ⏳ UI |
| Laporan keuangan UI | ✅ |
| Ringkasan beranda | ✅ |
| Ekspor CSV | ✅ |

**Sisa P2:** halaman pelanggan (sudah ada `CustomersPage.tsx` — perlu diverifikasi
terhadap API terbaru), audit log viewer, unit test T-01…T-05, T-08.

---

### P3 — Offline-First (ditempel sebagai P3.5)

**Tujuan:** transaksi tetap tercatat meski internet mati. Ini kebutuhan nyata
di Bantul, bukan fitur nice-to-have.

**Alasan ditunda ke P3.5:** idempotensi (`clientRequestId`, `idempotencyKey`)
harus ada dulu. P3.5 adalah pemisahan dari P3 yang "dibuat setelah P1" —
jadi urutan mining: P3 → P4 → P3.5 → P5.

> Catatan: urutan aktual yang dikerjakan = P1 → P2 → **P3.5** → P4 → P5 …

**Komponen:**

| Komponen | Isi |
|---|---|
| `src/lib/offline/db.ts` | IndexedDB wrapper (outbox, cache order) |
| `src/lib/offline/outbox.ts` | Antrean antarmuka: enqueue, flush, retry |
| `src/hooks/useOnlineStatus.ts` | Deteksi online/offline |
| `src/lib/offline/sync.ts` | Pemicu sinkron (online event, interval, saat buka app) |
| UI | Badge status sinkron di header POS, nota sementara |
| Backend | `Order.sumber` = `OFFLINE` untuk menandai order yang tersinkron dari antrean |

**Alur:**
1. Offline → `POST /api/orders` gagal → simpan ke outbox dengan `clientRequestId` UUID.
2. UI menampilkan badge "Menunggu sinkron (1)" + nomor nota sementara.
3. Online → flush antrean berurutan → server idempoten → response → hapus dari outbox.
4. Gagal → tetap di antrean, tandai "gagal" + alasan, bisa di-retry manual.

**Test:** T-06, T-07 (lihat [testing-plan.md](testing-plan.md) § 5).

---

### P4 — Laporan & Bantuan Keputusan

**Tujuan:** pemilik bisa mengambil keputusan dari data, bukan dari perasaan.

| Fitur | Detail |
|---|---|
| Omzet harian/mingguan/bulanan | Grafik + tabel, export CSV |
| Layanan paling laris | Per unit & per nilai |
| Jam sibuk | Distribusi pesanan per jam |
| Umur piutang | < 3 hari, 3–7 hari, > 7 hari |
| HPP per layanan | Input biaya bahan per kg/item → laba bersih |
| Beban kerja vs kapasitas | Kapasitas harian (butuh Q-07) |

> HPP & kapasitas bergantung pada jawaban **Q-05** dan **Q-07**
> (lihat [open-questions.md](open-questions.md)). Bagian laporan lain bisa
> dikerjakan tanpa menunggu.

---

### P5 — Deployment & Operasional

**Tujuan:** sistem hidup di internet dan aman dari kehilangan data.

| Item | Deliverable |
|---|---|
| Supabase | Project Free dibuat, `DATABASE_URL` session pooler, schema di-migrate |
| Render Blueprint | `render.yaml`: static site + free web service, migrasi di `startCommand`, `initialDeployHook` seed, rewrite SPA |
| Environment | `JWT_SECRET` dibuat Render, `CORS_ORIGIN` divalidasi saat start, `SEED_*_PASSWORD` sekali pakai |
| Keep-alive | `.github/workflows/keep-alive.yml`, 10 menit, 06:00–21:00 WIB, endpoint `/api/health` tanpa query DB |
| Backup | GitHub Actions cron → `pg_dump` → artifact, retensi 14 hari |
| Uji restore | Pulihkan artifact ke DB kosong, bandingkan jumlah baris |
| Dokumentasi deploy | Langkah di [architecture.md](architecture.md) § 6 + README |

**Checklist:**
- [ ] Supabase project dibuat (region Singapore)
- [ ] `DATABASE_URL` dengan `sslmode=require` (atau `no-verify` bila sertifikat self-signed)
- [ ] `npx prisma migrate deploy` sukses
- [ ] `SEED_*_PASSWORD` diisi; `initialDeployHook` membuat 3 user
- [ ] `render.yaml` di-commit → Blueprint ter-deploy
- [ ] Static site terbuka, login berhasil dari HP
- [ ] `curl https://<api>/api/health` → `{"status":"ok"}`
- [ ] Secret `API_URL` diisi; workflow keep-alive sukses 1×
- [ ] Cron backup jalan 1×, artifact muncul
- [ ] Uji restore berhasil

---

### P6 — Polish & UX

**Tujuan:** pemakaian harian terasa nyaman. Dilakukan **setelah** 2 minggu
pemakaian nyata.

| Area | Bina |
|---|---|
| Loading & empty state | Sudah ada; disempurnakan |
| Optimasi HP | Ukuran tombol, kontras, mode gelap opsional |
| Validasi form inline |-Zod per field, pesan di bawah input |
| Halaman pelanggan | Rapi, pencarian cepat, riwayat |
| Audit log viewer | Untuk menelusuri perubahan penting |
| Notifikasi | Toast untuk aksi penting |
| Cetak nota | Struk Thermal-friendly (print CSS) |

---

### P7 — Pelaporan & Ekspor Lanjutan

| Fitur | Detail |
|---|---|
| Ekspor master | Pelanggan, pesanan, pembayaran → CSV |
| Laporan periodik | Ringkasan bulanan siap kirim (WhatsApp/print) |
| Struk/nota | Cetak nota pesanan + nota pembayaran |
| Impor awal | CSV → pelanggan, layanan (migrasi dari buku) |

---

### P8 — Optimasi & Skala

**Hanya bila data atau beban demanding:**

| Area | Tindakan |
|---|---|
| Query lambat | Index tambahan,EXPLAIN ANALYZE |
| Arsip audit | Pindahkan `audit_logs` > 2 tahun ke arsip |
| Database penuh | Upgrade Supabase (bukan free lagi) |
| Beban API | Pagination stricter, cache |
| Auth | Pindah ke cookie `httpOnly` (menghilangkan risiko XSS) |

---

### P9 — Dokumentasi Final & Serah Terima

| Item | Deliverable |
|---|---|
| README |lify up-to-date |
| Docs | 8 dokumen review & disinkronkan dengan kode |
| Panduan operasional | Cara pakai kasir (1 halaman A4) |
| Panduan pemilik | Apa angka yang dilihat, apa artinya |
| Runbook | Apa yang dilakukan kalau ada masalah (server tidur, DB penuh, backup gagal) |
| Serah terima | Review bersama + checklist UAT |

---

## 3. Ketergantungan Antar Fase

```
P1 ──► P2 ──► P3.5 ──► P4 ──► P5 ──► (jeda 2 minggu) ──► P6 ──► P7 ──► P8 ──► P9
 │            │          │        │        │                                        │
 │            │          │        │        └── render.yaml, backup.yml              │
 │            │          │        └─────────── Supabase + Render + pinger           │
 │            │          └──────────────────── IndexedDB outbox + sync               │
 │            └─────────────────────────────── master pelanggan, layanan, pengaturan │
 └──────────────────────────────────────────── auth, order, payment, laporan, stok  │
```

**Pola penting:** P5 (deployment) bisa dikerjakan **sebelum** P4/P6 selesai.
Sistem bisa dipakai pemilik sejak P2 — lebih baik dipakai dengan fitur 80%
daripada dipakai sempurna setelah 6 bulan.

---

## 4. Pembatasan & Aturan Main

1. **Tidak ada fitur yang belum diverifikasi.** Setiap fase ditutup dengan
   `npm test` hijau + `tsc --noEmit` bersih + `vite build` sukses.
2. **Tidak ada migrations destruktif.** `migrate reset` dilarang di produksi.
3. **Tidak ada kredensial di dalam repo.** Semua lewat env var.
4. **Tidak ada dependensi baru tanpa alasan.** Prinsip "simple, cheap,
   maintainable" berlaku juga untuk dependency.
5. **Tidak ada over-engineering.** Microservice, message broker, cache
   terdistribusi — tidak ada di rencana ini.
6. **Dokumen diperbarui bersamaan dengan kode.** Angka, nama endpoint, dan
   keputusan harus selalu cocok dengan implementasi.

---

## 5. Estimasi Waktu (ingkaran, bukan komitmen)

| Fase | Estimasi | Catatan |
|---|---|---|
| P1 | ✅ selesai | ~1–2 hari kerja efektif |
| P2 | ✅ 80% | ~1 hari |
| P3.5 | 2–3 hari | IndexedDB + retry + UI status |
| P4 | 2–3 hari | Tergantung Q-05/Q-07 |
| P5 | 1–2 hari | Sebagian besar konfigurasi |
| Jeda | 2 minggu | Pemakaian nyata |
| P6 | 2–3 hari | Hasil dari feedback 2 minggu |
| P7 | 1–2 hari | |
| P8 | Tergantung kebutuhan | Hanya bila perlu |
| P9 | 1 hari | |

Total MVP +\~ P6: **8–13 hari kerja efektif**, plus jeda 2 minggu pemakaian.

---

## 6. Risiko Fase

| Risiko | Fase impacted | Mitigasi |
|---|---|---|
| 8 pertanyaan bisnis belum terjawab | P2, P4 | Rekomendasi default sudah disiapkan di [open-questions.md](open-questions.md) — sistem jalan dengan default, disetel ulang nanti |
| Render Free tidur | P5, P6 | Pinger + UI "menyambung…" |
| Supabase pause | P5 | Cron ping harian |
| Kehilangan data | P5 | Backup harian + uji restore |
| Perubahan mendadak dari 2 minggu pemakaian | P6 | Jeda dijadwalkan, bukan ditunda diam-diam |
| Scope creep | semua | Fitur baru harus masuk daftar backlog tertulis dulu |
