-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'KASIR', 'OPERATOR');

-- CreateEnum
CREATE TYPE "SatuanLayanan" AS ENUM ('KG', 'ITEM');

-- CreateEnum
CREATE TYPE "StatusOrder" AS ENUM ('DITERIMA', 'PROSES', 'SELESAI', 'DIAMBIL');

-- CreateEnum
CREATE TYPE "MetodeBayar" AS ENUM ('TUNAI', 'QRIS', 'TRANSFER');

-- CreateEnum
CREATE TYPE "KategoriPengeluaran" AS ENUM ('BAHAN_BAKU', 'GAJI', 'LISTRIK_GAS', 'SEWA', 'TRANSPORTASI', 'PERAWATAN', 'LAIN_LAIN');

-- CreateEnum
CREATE TYPE "KategoriPemasukanLain" AS ENUM ('PENJUALAN_BARANG', 'JASA_TAMBAHAN', 'LAIN_LAIN');

-- CreateEnum
CREATE TYPE "TipeMutasiStok" AS ENUM ('MASUK', 'KELUAR', 'PENYESUAIAN');

-- CreateEnum
CREATE TYPE "SatuanProduk" AS ENUM ('ML', 'L', 'KG', 'PCS');

-- CreateEnum
CREATE TYPE "SumberOrder" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "noHp" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "noHp" TEXT,
    "alamat" TEXT,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "satuan" "SatuanLayanan" NOT NULL,
    "hargaDefault" INTEGER NOT NULL,
    "estimasiHari" INTEGER NOT NULL DEFAULT 1,
    "deskripsi" TEXT,
    "isAktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "customerId" TEXT,
    "namaPelanggan" TEXT NOT NULL,
    "noHp" TEXT,
    "statusOrder" "StatusOrder" NOT NULL DEFAULT 'DITERIMA',
    "sumber" "SumberOrder" NOT NULL DEFAULT 'ONLINE',
    "subtotal" INTEGER NOT NULL,
    "diskon" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "totalDibayar" INTEGER NOT NULL DEFAULT 0,
    "tanggalMasuk" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimasiSelesai" TIMESTAMP(3),
    "tanggalSelesai" TIMESTAMP(3),
    "tanggalDiambil" TIMESTAMP(3),
    "catatan" TEXT,
    "catatanPengerjaan" TEXT,
    "createdById" TEXT NOT NULL,
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidAlasan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "namaService" TEXT NOT NULL,
    "satuan" "SatuanLayanan" NOT NULL,
    "qty" INTEGER NOT NULL,
    "hargaSatuan" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "catatan" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "metode" "MetodeBayar" NOT NULL,
    "nominal" INTEGER NOT NULL,
    "kembalian" INTEGER NOT NULL DEFAULT 0,
    "referensi" TEXT,
    "catatan" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dari" "StatusOrder",
    "ke" "StatusOrder" NOT NULL,
    "olehId" TEXT NOT NULL,
    "catatan" TEXT,
    "pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kategori" "KategoriPengeluaran" NOT NULL,
    "keterangan" TEXT NOT NULL,
    "nominal" INTEGER NOT NULL,
    "metodeBayar" "MetodeBayar" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "other_incomes" (
    "id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kategori" "KategoriPemasukanLain" NOT NULL,
    "keterangan" TEXT NOT NULL,
    "nominal" INTEGER NOT NULL,
    "metodeBayar" "MetodeBayar" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "other_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "satuan" "SatuanProduk" NOT NULL,
    "stokMinimum" INTEGER NOT NULL DEFAULT 0,
    "hargaBeliTerakhir" INTEGER,
    "isAktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tipe" "TipeMutasiStok" NOT NULL,
    "qty" INTEGER NOT NULL,
    "stokSebelum" INTEGER,
    "stokSesudah" INTEGER,
    "refType" TEXT,
    "refId" TEXT,
    "tanggal" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keterangan" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "aksi" TEXT NOT NULL,
    "entitas" TEXT NOT NULL,
    "entitasId" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "customers_kode_key" ON "customers"("kode");

-- CreateIndex
CREATE INDEX "customers_noHp_idx" ON "customers"("noHp");

-- CreateIndex
CREATE INDEX "customers_nama_idx" ON "customers"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "services_kode_key" ON "services"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "orders_nomor_key" ON "orders"("nomor");

-- CreateIndex
CREATE UNIQUE INDEX "orders_clientRequestId_key" ON "orders"("clientRequestId");

-- CreateIndex
CREATE INDEX "orders_tanggalMasuk_idx" ON "orders"("tanggalMasuk");

-- CreateIndex
CREATE INDEX "orders_statusOrder_idx" ON "orders"("statusOrder");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_namaPelanggan_idx" ON "orders"("namaPelanggan");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_pada_idx" ON "order_status_history"("orderId", "pada");

-- CreateIndex
CREATE INDEX "expenses_tanggal_idx" ON "expenses"("tanggal");

-- CreateIndex
CREATE INDEX "expenses_kategori_idx" ON "expenses"("kategori");

-- CreateIndex
CREATE INDEX "other_incomes_tanggal_idx" ON "other_incomes"("tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "products_kode_key" ON "products"("kode");

-- CreateIndex
CREATE INDEX "stock_movements_productId_tanggal_idx" ON "stock_movements"("productId", "tanggal");

-- CreateIndex
CREATE INDEX "stock_movements_tanggal_idx" ON "stock_movements"("tanggal");

-- CreateIndex
CREATE INDEX "audit_logs_entitas_entitasId_idx" ON "audit_logs"("entitas", "entitasId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_olehId_fkey" FOREIGN KEY ("olehId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_incomes" ADD CONSTRAINT "other_incomes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
