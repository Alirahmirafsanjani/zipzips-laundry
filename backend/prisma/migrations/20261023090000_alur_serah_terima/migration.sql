-- CreateEnum
CREATE TYPE "MetodeHubungi" AS ENUM ('WHATSAPP', 'TELEPON', 'LANGSUNG');

-- AlterTable: bukti pelanggan sudah dihubungi saat cucian selesai
ALTER TABLE "orders"
    ADD COLUMN "dihubungiAt" TIMESTAMP(3),
    ADD COLUMN "dihubungiVia" "MetodeHubungi",
    ADD COLUMN "dihubungiOlehId" TEXT,
    ADD COLUMN "jumlahDihubungi" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: qty desimal agar berat kiloan tidak dibulatkan (mis. 2,5 kg)
ALTER TABLE "order_items"
    ALTER COLUMN "qty" SET DATA TYPE DECIMAL(10, 2);

-- AddForeignKey
ALTER TABLE "orders"
    ADD CONSTRAINT "orders_dihubungiOlehId_fkey"
    FOREIGN KEY ("dihubungiOlehId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
