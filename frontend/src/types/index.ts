export type Role = 'OWNER' | 'KASIR' | 'OPERATOR'

export type StatusOrder = 'DITERIMA' | 'PROSES' | 'SELESAI' | 'DIAMBIL'

export type MetodeBayar = 'TUNAI' | 'QRIS' | 'TRANSFER'

export type MetodeHubungi = 'WHATSAPP' | 'TELEPON' | 'LANGSUNG'

export type SatuanLayanan = 'KG' | 'ITEM'

export type StatusPembayaran = 'BELUM_BAYAR' | 'SEBAGIAN' | 'LUNAS' | 'VOID'

export interface User {
  id: string
  nama: string
  username: string
  role: Role
  noHp?: string | null
  aktif: boolean
  createdAt?: string
  updatedAt?: string
}

export interface AuthUser {
  id: string
  nama: string
  username: string
  role: Role
}

export interface Customer {
  id: string
  kode: string
  nama: string
  noHp?: string | null
  alamat?: string | null
  catatan?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface Service {
  id: string
  kode: string
  nama: string
  satuan: SatuanLayanan
  hargaDefault: number
  estimasiHari: number
  deskripsi?: string | null
  isAktif: boolean
}

export interface OrderItem {
  id: string
  orderId: string
  serviceId: string
  namaService: string
  satuan: SatuanLayanan
  qty: number
  /** Field harga dihapus dari respons untuk OPERATOR. */
  hargaSatuan?: number
  subtotal?: number
  catatan?: string | null
}

export interface Payment {
  id: string
  orderId: string
  metode: MetodeBayar
  nominal: number
  kembalian: number
  referensi?: string | null
  catatan?: string | null
  createdById: string
  createdAt: string
  createdBy?: { id: string; nama: string; username: string }
}

export interface OrderStatusHistory {
  id: string
  dari?: StatusOrder | null
  ke: StatusOrder
  catatan?: string | null
  pada: string
  oleh?: { id: string; nama: string; username: string }
}

export interface Order {
  id: string
  nomor: string
  clientRequestId?: string | null
  customerId?: string | null
  namaPelanggan: string
  noHp?: string | null
  statusOrder: StatusOrder
  sumber: 'ONLINE' | 'OFFLINE'
  /** Field keuangan dihapus dari respons untuk OPERATOR. */
  subtotal?: number
  diskon?: number
  total?: number
  totalDibayar?: number
  sisaTagihan?: number
  statusPembayaran?: StatusPembayaran
  tanggalMasuk: string
  estimasiSelesai?: string | null
  tanggalSelesai?: string | null
  tanggalDiambil?: string | null
  /** Janji bayar sisa tagihan (piutang) saat cucian diambil. */
  jatuhTempo?: string | null
  /** Bukti pelanggan sudah dikabari saat cucian selesai. */
  dihubungiAt?: string | null
  dihubungiVia?: MetodeHubungi | null
  dihubungiOlehId?: string | null
  dihubungiOleh?: { id: string; nama: string } | null
  jumlahDihubungi?: number
  catatan?: string | null
  catatanPengerjaan?: string | null
  voidedAt?: string | null
  voidAlasan?: string | null
  items: OrderItem[]
  payments?: Payment[]
  statusHistory?: OrderStatusHistory[]
  customer?: Pick<Customer, 'id' | 'kode' | 'nama' | 'noHp'> | null
  createdBy?: { id: string; nama: string; username: string }
}

export interface Product {
  id: string
  kode: string
  nama: string
  satuan: 'ML' | 'L' | 'KG' | 'PCS'
  stokMinimum: number
  hargaBeliTerakhir?: number | null
  isAktif: boolean
  stok?: number
  stokMenipis?: boolean
}

export interface StockMovement {
  id: string
  productId: string
  tipe: 'MASUK' | 'KELUAR' | 'PENYESUAIAN'
  qty: number
  stokSebelum?: number | null
  stokSesudah?: number | null
  tanggal: string
  keterangan?: string | null
  product?: { id: string; kode: string; nama: string; satuan: string }
  createdBy?: { id: string; nama: string }
}

export type KategoriPengeluaran =
  | 'BAHAN_BAKU'
  | 'GAJI'
  | 'LISTRIK_GAS'
  | 'SEWA'
  | 'TRANSPORTASI'
  | 'PERAWATAN'
  | 'REFUND'
  | 'LAIN_LAIN'

export interface Expense {
  id: string
  tanggal: string
  kategori: KategoriPengeluaran
  keterangan: string
  nominal: number
  metodeBayar: MetodeBayar
  createdBy?: { id: string; nama: string }
}

export interface OtherIncome {
  id: string
  tanggal: string
  kategori: 'PENJUALAN_BARANG' | 'JASA_TAMBAHAN' | 'LAIN_LAIN'
  keterangan: string
  nominal: number
  metodeBayar: MetodeBayar
  createdBy?: { id: string; nama: string }
}

export interface FinanceSummary {
  rentang: { dari: string | null; sampai: string | null }
  omzet: number
  penerimaanKas: number
  penerimaanLaundry: number
  penerimaanLain: number
  pengeluaran: number
  labaKas: number
  piutang: number
  jumlahPesanan: number
  perMetode: Record<string, number>
  perKategoriPengeluaran: Record<string, number>
  perKategoriPemasukanLain: Record<string, number>
  harian: Array<{
    tanggal: string
    omzet: number
    penerimaan: number
    pengeluaran: number
    jumlahPesanan: number
  }>
  catatan: Record<string, string>
}

export interface DashboardSummary {
  hariIni: string
  /** Field keuangan hanya dikirim untuk OWNER & KASIR. */
  omzetHariIni?: number
  diterimaHariIni?: number
  belumDibayarHariIni?: number
  piutang?: number
  jumlahPesananHariIni: number
  totalPesananAktif: number
  pesananSedangDikerjakan: number
  /** Cucian SELESAI yang pelanggannya belum dikabari. */
  belumDihubungi: number
  /** Piutang yang sudah melewati tanggal janji bayar. */
  piutangJatuhTempo: number
  /** Nominal piutang jatuh tempo (hanya untuk OWNER/KASIR). */
  piutangJatuhTempoNominal?: number
  statusCount: Record<StatusOrder, number>
  omzetTujuhHari?: Array<{ tanggal: string; omzet: number; jumlahPesanan: number }>
}

export interface Paginated<T> {
  items: T[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
    totalNominal?: number
    totalKembalian?: number
    totalDiterima?: number
  }
}

export interface Setting {
  namaToko: string
  alamat: string
  noWhatsapp: string
  catatanStruk: string
  estimasiHariKiloan: number
  estimasiHariSatuan: number
  estimasiHariExpress: number
  [key: string]: unknown
}
