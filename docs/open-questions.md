# Pertanyaan Terbuka — ZIP-ZIPS LAUNDRI

**Status:** 8 pertanyaan prioritas-1 **belum dijawab** oleh pemilik.
Sistem saat ini berjalan dengan **rekomendasi default** yang ditandai
"⏳ perlu konfirmasi" di bawah. Default ini cukup untuk MVP, tetapi
beberapa di antaranya mengubah struktur data — jadi makin cepat dijawab,
makin sedikit pekerjaan yang harus dibongkar nanti.

Cara menjawab: tandai ✅ / ubah baris "Jawaban" + isi kolom "Dampak ke skema".

---

## Prioritas 1 — Memblokir struktur data (8 pertanyaan)

### Q-01 · Pricing & satuan layanan

**Pertanyaan:** Bagaimana harga laundry ZIP-ZIPS ditentukan?

> Opsi A — Tetap per satuan (satuan/kg). Structure saat ini sudah cocok.
> Opsi B — Ada tipe layanan lain (mis. "Cuci Bed King" per item, "Cuci Jacket" per item).
> Opsi C — Harga berubah per musim (musim hujan lebih mahal).

**Default yang dipakai sekarang:** Opsi A — `Service.satuan` ∈ {KG, ITEM},
`hargaDefault` per satuan, harga di-snapshot saat pesanan dibuat.

| Opsi | Dampak ke skema |
|---|---|
| A | Tidak ada perubahan |
| B | Tidak ada perubahan schema (cukup tambah data), tapi UI POS butuh pengelompokan |
| C | Perlu tabel `price_tiers` (periode → harga) + perubahan logika snapshot |

**Jawaban:** _…_

---

### Q-02 · Batas override harga satuan

**Pertanyaan:** Kasir boleh mengubah harga satuan di layar? Sampai batas berapa?

> Opsi A — Tidak boleh sama sekali. Harga selalu dari master.
> Opsi B — Boleh, maksimal ±10% dari harga master.
> Opsi C — Boleh, bebas, tapi butuh alasan & dicatat di audit log.
> Opsi D — Boleh, hanya OWNER.

**Default sekarang:** Opsi B — kasir boleh mengubah, divalidasi server
(harga ≥ 0). Batas persentase **belum** dikunci, jadi aturan longgar.

**Dampak:** constraint di `orders.schema.js` + `OrderItem.hargaSatuan` audit.

**Jawaban:** _…_

---

### Q-03 · Field QRIS yang dicatat manual

**Pertanyaan:** Saat kasir mencatat pembayaran QRIS, informasi apa yang perlu disimpan?

> Opsi A — Cukup nominal.
> Opsi B — Nominal + kode/ID transaksi dari aplikasi QRIS.
> Opsi C — Nominal + nama rekening / merchant + waktu transfer.
> Opsi D — Semua di atas + catatan bebas.

**Default sekarang:** Opsi B — ada kolom `payments.referensi` (teks bebas,
maks 200 karakter) untuk kode QRIS / merchant / nama bank.

**Dampak:** kalau perlu bukti transfer berupa gambar → kolom `buktiUrl` baru
(menuntut storage; Render free filesystem ephemeral → perlu Supabase Storage).

**Jawaban:** _…_

---

### Q-04 · Model pembayaran (DP vs bayar saat ambil)

**Pertanyaan:** Apakah ZIP-ZIPS memakai sistem DP (uang muka), atau pelanggan
bayar penuh saat barang diterima, atau bayar saat diambil?

> Opsi A — Bayar penuh saat masuk (umum laundry kiloan).
> Opsi B — DP wajib (mis. 50%) saat masuk, pelunasan saat ambil.
> Opsi C — Bebas: kasir yang memutuskan per transaksi.

**Default sekarang:** Opsi C — sistem mendukung **pembayaran sebagian** tanpa
membatasi. Tidak ada konsep minimal DP, tidak ada pelunasan otomatis saat
status `DIAMBIL`.

**Dampak:**
- Opsi B → perlu kolom `dpMinimal` per layanan + validasi + label "DP" di UI.
- Pelunasan otomatis saat DIAMBIL → trigger saat status berubah.

**Jawaban:** _…_

---

### Q-05 · Stok bahan: jenis, stok minimum, dan rasio konsumsi ⚠️

**Pertanyaan:**
1. Bahan apa saja yang dipakai (deterjen, pewangi, pemutih, dll)?
2. Berapa stok minimum masing-masing?
3. **Apakah ada rasio konsumsi per kg/item?** (mis. 50 ml deterjen per kg cucian)

**Default sekarang:**
- `Product` dengan satuan ML / L / KG / PCS.
- Stok minimum bisa diisi per produk.
- **Pemakaian dicatat manual oleh OWNER** — tidak ada pengurangan otomatis
  per pesanan.

**Dampak:** Opsi 3 (rasio konsumsi) adalah perubahan **paling besar** —
men butuh:
- Tabel baru `service_consumptions` (serviceId × productId → qty per satuan).
- Pengurangan stok otomatis saat pesanan dibuat (di dalam transaksi yang sama).
- Penyesuaian saat pesanan void (stok dikembalikan).
- Contoh: 1 pesanan 3 kg × 50 ml/kg = 150 ml deterjen keluar.

**Status:** ⏳ perlu konfirmasi — fitur ini sengaja **tidak** diaktifkan
di MVP karena aturan consume belum disetujui.

**Jawaban:** _…_

---

### Q-06 · Perlakuan biaya pengeringan (musim hujan)

**Pertanyaan:** Saat musim hujan, cucian tidak bisa dijemur → pakai mesin pengering
→ listrik naik. Biaya ini masuk ke mana?

> Opsi A — Categori `LISTRIK_GAS` sebagai pengeluaran umum.
> Opsi B — Dialokasikan sebagai HPP per pesanan (ikut hilang saat pesanan void).
> Opsi C — Dihitung per kg (mis. Rp300/kg) sebagai "biaya tambahan musim hujan".

**Default sekarang:** Opsi A — dicatat OWNER sebagai pengeluaran kategori
`LISTRIK_GAS`.

**Dampak:** Opsi B/C butuh model biaya per layanan (`service.costOverhead`)
→ masuk HPP → laporan "laba bersih" (P4) menjadi akurat.

**Jawaban:** _…_

---

### Q-07 · Kapasitas harian

**Pertanyaan:** Berapa kg cucian per hari yang bisa ditangani ZIP-ZIPS dengan
2 karangian? Apakah perlu dilimit?

> Opsi A — Tidak ada limit. Terima semua.
> Opsi B — Ada batas harian sebagai peringatan (bukan penolakan).
> Opsi C — Batas keras, tolak di atasnya.

**Default sekarang:** Opsi A — tidak ada limit.

**Dampak:** Opsi B/C butuh tabel `daily_capacity` (tanggal → kg maksimal) +
validasi di pembuatan pesanan + indikator di beranda.

**Jawaban:** _…_

---

### Q-08 · Piutang: tenggat & bunga ⚠️

**Pertanyaan:**
1. Apakah pelanggan boleh menunda bayar? Berapa lama maksimumnya?
2. Kalau terlambat, ada bunga/denda?
3. Siapa yang boleh menagih?

**Default sekarang:** Opsi paling sederhana —
- Pembayaran boleh sebagian, **tanpa tenggat**.
- Tidak ada bunga/denda.
- Piutang = `SUM(total − totalDibayar)` seluruh pesanan aktif, lintas tanggal.
- Tidak ada fitur penagihan otomatis (notifikasi WhatsApp belum ada).

**Dampak:** kalau perlu tenggat → kolom `orders.dueDate` + pengelompokan umur
piutang di laporan. Kalau perlu bunga → kolom `payments.bunga` atau
`orders.bungaNominal` + perhitungan baru.

**Jawaban:** _…_

---

## Prioritas 2 — Penting, tidak memblokir (5 pertanyaan)

### Q-09 · Batas diskon & wewenang diskon

**Pertanyaan:** Siapa boleh memberi diskon? Ada batas persen/nominal?

> Default: kasir boleh memberi diskon nominal, maksimal ≤ subtotal (server
> memvalidasi). Tidak ada batas persentase. Tidak ada promo otomatis.

**Dampak:** kalau ada batas → constraint tambahan + kolom `discountBy`.

---

### Q-10 · Aturan status: boleh mundur?

**Pertanyaan:** Boleh kah status dikoreksi mundur (mis. `SELESAI → PROSES`)?

> Default: tidak boleh, kecuali OWNER dengan alasan (logika transisi di
> service). Transisi lompat (skip) juga ditolak.

**Dampak:** rendah — cukup mengubah aturan transisi.

---

### Q-11 · Piutang & pelanggan walk-in

**Pertanyaan:** Berapa banyak transaksi tanpa nomor HP (walk-in)? Apakah perlu
profil minimal?

> Default: nama saja wajib (bisa "Tanpa Nama"), no HP opsional. Pelanggan
> tetap bisa dibuat dari pesanan.

---

### Q-12 ·nota cetak

**Pertanyaan:** Perlu struk/nota cetak untuk pelanggan?

> Default: belum ada print struk. P7.

---

### Q-13 · Retensi & privasi data

**Pertanyaan:** Data pelanggan (nama + no HP) boleh disimpan berapa lama?
Perlu fitur hapus?

> Default: tidak ada fitur hapus pelanggan. Data disimpan permanen
> (dibutuhkan untuk riwayat & pembukuan). Soft-delete pelanggan belum ada.

---

## Prioritas 3 — Nice to have (5 pertanyaan)

### Q-14 · Metode pembayaran tambahan

Apakah perlu: transfer bank (bisa rekening terpisah?), QRIS kredit (bayar nanti),
ewallet, atau "cicilan tanpa DP"?

> Default: `MetodeBayar` = TUNAI / QRIS / TRANSFER. Tambah enum = 1 baris
> migration.

### Q-15 · Sub-layanan / varian

Apakah satu layanan punya varian (mis. "Cuci Kiloan" vs "Cuci Kiloan +
Setrika" vs "Cuci Kiloan + Pewangi")?

> Default: tidak ada varian; layanan flat. Kalau perlu → tabel `service_variants`
> atau JSON di `services`.

### Q-16 · Layanan tambahan per outlet

Apakah ada layanan ekspres, dry cleaning, atau laundry satuan per lembar
(per item)?

> Default: `SatuanLayanan` = KG / ITEM sudah menutup keduanya.

### Q-17 · laporan yang dibutuhkan pemilik

Apakah laporan tertentu yang paling penting belum ada?

> Default: omzet harian, penerimaan kas, pengeluaran, laba kas, piutang,
> layanan terlaris, jam sibuk. P4 menambah sisanya.

### Q-18 · Multi-user real-time

Apakah perlu melihat perubahan antar kasir secara langsung (tanpa refresh)?

> Default: tidak. Data di-refresh saat pindah halaman atau tombol refresh.

---

## Ringkasan Dampak

| Pertanyaan | Impact | Bisa ditunda? |
|---|---|---|
| Q-01 Pricing | Sedang | Ya |
| Q-02 Batas harga | Rendah | Ya |
| Q-03 Field QRIS | Sedang | Ya |
| Q-04 Model DP | Sedang | Ya |
| **Q-05 Rasio konsumsi** | **Tinggi** | Ya, tapi fitur worthwhile tertunda |
| Q-06 Biaya pengeringan | Sedang | Ya |
| Q-07 Kapasitas | Rendah | Ya |
| **Q-08 Tenggat piutang** | **Tinggi** | Ya |
| Q-09 Batas diskon | Rendah | Ya |
| Q-10 Mundur status | Rendah | Ya |
| Q-11 Walk-in | Rendah | Ya |
| Q-12 Nota cetak | Rendah | Ya (P7) |
| Q-13 Retensi | Rendah | Ya |
| Q-14 Metode bayar | Rendah | Ya |
| Q-15 Varian | Sedang | Ya |
| Q-16 Layanan lain | Rendah | Ya |
| Q-17 Laporan | Rendah | Ya (P4) |
| Q-18 Real-time | Rendah | Ya |

> **Tidak ada yang memblokir MVP.** Semua bisa ditunda; Q-05 dan Q-08 adalah
> yang paling bernilai untuk dijawab lebih awal karena membuka fitur besar.

---

## Catatan Penyimpanan

Dokumen ini sengaja **tidak** mengunci jawaban — begitu dijawab, baris
"Awaban" diisi dan dokumen ini diperbarui, lalu keputusan turunannya
di-trace ke [database-design.md](database-design.md) § 6 (keputusan desain)
dan [requirements.md](requirements.md) § 5 (aturan bisnis terkunci).
