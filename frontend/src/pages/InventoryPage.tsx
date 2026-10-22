import { useCallback, useEffect, useState } from 'react'
import { Boxes, Plus } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { Product, StockMovement } from '@/types'

export function InventoryPage() {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'produk' | 'mutasi'>('mutasi')
  const [kode, setKode] = useState('')
  const [nama, setNama] = useState('')
  const [satuan, setSatuan] = useState<'ML' | 'L' | 'KG' | 'PCS'>('ML')
  const [stokMinimum, setStokMinimum] = useState(0)
  const [productId, setProductId] = useState('')
  const [tipe, setTipe] = useState<'MASUK' | 'KELUAR' | 'PENYESUAIAN'>('MASUK')
  const [qty, setQty] = useState('')
  const [stokAkhir, setStokAkhir] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const [daftarProduk, daftarMutasi] = await Promise.all([
        api.get<Product[]>('/api/inventory/produk'),
        api.get<StockMovement[]>('/api/inventory/mutasi?limit=40'),
      ])
      setProducts(daftarProduk)
      setMovements(daftarMutasi)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal memuat data stok.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void muat()
  }, [muat])

  const simpanProduk = async () => {
    if (kode.trim().length < 2 || nama.trim().length < 2) {
      toast.error('Kode dan nama produk wajib diisi.')
      return
    }
    setMenyimpan(true)
    try {
      await api.post<Product>('/api/inventory/produk', {
        kode: kode.trim().toUpperCase(),
        nama: nama.trim(),
        satuan,
        stokMinimum,
      })
      setOpen(false)
      setKode('')
      setNama('')
      await muat()
      toast.success('Produk ditambahkan.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menambah produk.')
    } finally {
      setMenyimpan(false)
    }
  }

  const simpanMutasi = async () => {
    if (!productId) {
      toast.error('Pilih produk terlebih dahulu.')
      return
    }
    setMenyimpan(true)
    try {
      await api.post<StockMovement>('/api/inventory/mutasi', {
        productId,
        tipe,
        qty: tipe === 'PENYESUAIAN' ? undefined : Number(qty.replace(/\D/g, '')),
        stokAkhir: tipe === 'PENYESUAIAN' ? Number(stokAkhir.replace(/\D/g, '')) : undefined,
        keterangan: keterangan.trim() || null,
      })
      setOpen(false)
      setQty('')
      setStokAkhir('')
      setKeterangan('')
      await muat()
      toast.success('Mutasi stok tercatat.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal mencatat mutasi.')
    } finally {
      setMenyimpan(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Stok Bahan"
        subtitle="Stok dihitung dari riwayat mutasi — tidak ada pengurangan otomatis."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setMode('produk'); setOpen(true) }}>
              <Plus className="size-4" />
              Produk
            </Button>
            <Button onClick={() => { setMode('mutasi'); setOpen(true) }}>
              <Plus className="size-4" />
              Mutasi Stok
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-7 text-brand-700" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Daftar produk" />
            <CardBody className="p-0">
              {products.length === 0 ? (
                <EmptyState title="Belum ada produk" icon={<Boxes className="size-6" />} />
              ) : (
                <div className="divide-y divide-slate-100">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {product.nama}{' '}
                          <span className="text-xs font-normal text-slate-400">
                            {product.kode}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Minimum {product.stokMinimum} {product.satuan}
                          {product.hargaBeliTerakhir
                            ? ` · harga beli ${formatRupiah(product.hargaBeliTerakhir)}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular text-sm font-semibold text-slate-800">
                          {product.stok ?? 0} {product.satuan}
                        </span>
                        {product.stokMenipis && (
                          <Badge tone="amber">Menipis</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Mutasi terakhir" />
            <CardBody className="p-0">
              {movements.length === 0 ? (
                <EmptyState title="Belum ada mutasi" />
              ) : (
                <div className="divide-y divide-slate-100">
                  {movements.map((movement) => (
                    <div
                      key={movement.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {movement.product?.nama ?? '-'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatTanggal(movement.tanggal)} · {movement.tipe}
                          {movement.keterangan ? ` · ${movement.keterangan}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`tabular text-sm font-semibold ${
                            movement.qty > 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {movement.qty > 0 ? '+' : ''}
                          {movement.qty}
                        </p>
                        {movement.stokSesudah !== null &&
                          movement.stokSesudah !== undefined && (
                            <p className="tabular text-xs text-slate-500">
                              sisa {movement.stokSesudah}
                            </p>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={mode === 'produk' ? 'Tambah Produk' : 'Catat Mutasi Stok'}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={mode === 'produk' ? simpanProduk : simpanMutasi}
              loading={menyimpan}
            >
              Simpan
            </Button>
          </>
        }
      >
        {mode === 'produk' ? (
          <div className="space-y-3">
            <Field label="Kode" required>
              {({ id }) => (
                <Input
                  id={id}
                  value={kode}
                  onChange={(event) => setKode(event.target.value)}
                  placeholder="mis. DET"
                  autoFocus
                />
              )}
            </Field>
            <Field label="Nama produk" required>
              {({ id }) => (
                <Input
                  id={id}
                  value={nama}
                  onChange={(event) => setNama(event.target.value)}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Satuan" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={satuan}
                    onChange={(event) =>
                      setSatuan(event.target.value as 'ML' | 'L' | 'KG' | 'PCS')
                    }
                  >
                    <option value="ML">ML</option>
                    <option value="L">Liter</option>
                    <option value="KG">Kilogram</option>
                    <option value="PCS">Buah</option>
                  </Select>
                )}
              </Field>
              <Field label="Stok minimum">
                {({ id }) => (
                  <Input
                    id={id}
                    value={stokMinimum}
                    onChange={(event) => setStokMinimum(Number(event.target.value))}
                    inputMode="numeric"
                  />
                )}
              </Field>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Produk" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  <option value="">Pilih produk…</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.nama} (sisa {product.stok ?? 0} {product.satuan})
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Jenis mutasi" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={tipe}
                  onChange={(event) =>
                    setTipe(event.target.value as 'MASUK' | 'KELUAR' | 'PENYESUAIAN')
                  }
                >
                  <option value="MASUK">Masuk (pembelian / openeran)</option>
                  <option value="KELUAR">Keluar (pemakaian)</option>
                  <option value="PENYESUAIAN">Penyesuaian (opname)</option>
                </Select>
              )}
            </Field>

            {tipe === 'PENYESUAIAN' ? (
              <Field
                label="Stok fisik hasil hitungan"
                required
                hint="Sistem menghitung selisihnya otomatis."
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={stokAkhir}
                    onChange={(event) => setStokAkhir(event.target.value)}
                    inputMode="numeric"
                    className="tabular text-right"
                  />
                )}
              </Field>
            ) : (
              <Field label="Jumlah" required>
                {({ id }) => (
                  <Input
                    id={id}
                    value={qty}
                    onChange={(event) => setQty(event.target.value)}
                    inputMode="numeric"
                    className="tabular text-right"
                  />
                )}
              </Field>
            )}

            <Field label="Keterangan">
              {({ id }) => (
                <Input
                  id={id}
                  value={keterangan}
                  onChange={(event) => setKeterangan(event.target.value)}
                  placeholder="mis. Pemakaian 2 kg deterjen"
                />
              )}
            </Field>
          </div>
        )}
      </Modal>
    </>
  )
}

export default InventoryPage
