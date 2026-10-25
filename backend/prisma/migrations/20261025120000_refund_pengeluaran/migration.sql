-- Refund adalah arus kas keluar, bukan penghapusan penerimaan sebelumnya.
-- Nilainya dicatat sebagai Expense berkategori REFUND agar laporan kas tetap
-- jujur: uang yang pernah masuk tidak hilang dari riwayat.
ALTER TYPE "KategoriPengeluaran" ADD VALUE IF NOT EXISTS 'REFUND';
