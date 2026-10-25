-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "jatuhTempo" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "orders_jatuhTempo_idx" ON "orders"("jatuhTempo");
