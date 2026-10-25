import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, Check, Minus, Plus, Printer, ShoppingBag, Trash2, User } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { formatQty, formatRupiah, formatTanggal, parseNominal } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { Receipt, DEFAULT_STORE, type StoreSettings } from '@/components/Receipt'
import type { Customer, MetodeBayar, Order, Service } from '@/types'

interface CartItem {
  serviceId: string
  nama: string
  satuan: 'KG' | 'ITEM'
  hargaSatuan: number
  qty: number
}

export function PosPage() {
  const toast = useToast()
  const navigate = useNavigate()

  const [services, setServices] = useState<Service[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE)
  const [loading, setLoading] = useState(true)

  const [cart, setCart] = useState<CartItem[]>([])
  const [customerId, setCustomerId] = useState('')
  const [namaPelanggan, setNamaPelanggan] = useState('')
  const [noHp, setNoHp] = useState('')
  const [diskon, setDiskon] = useState(0)
  const [catatan, setCatatan] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [orderDibuat, setOrderDibuat] = useState<Order | null>(null)
  // Satu ID untuk satu percobaan simpan. Bila jaringan putus dan kasir
  // menekan Simpan lagi, server mengenali ID ini dan tidak membuat nota ganda.
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID())

  // Dialog pembayaran
  const [payOpen, setPayOpen] = useState(false)
  const [metode, setMetode] = useState<MetodeBayar>('TUNAI')
  const [nominal, setNominal] = useState('')
  const [referensi, setReferensi] = useState('')
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID())
  const [membayar, setMembayar] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [daftarLayanan, daftarPelanggan, pengaturan] = await Promise.all([
          api.get<Service[]>('/api/services?includeInactive=false'),
          api.get<Customer[]>('/api/customers?limit=100'),
          api.get<StoreSettings>('/api/settings').catch(() => DEFAULT_STORE),
        ])
        if (cancelled) return
        setServices(daftarLayanan)
        setCustomers(daftarPelanggan)
        setSettings({ ...DEFAULT_STORE, ...pengaturan })
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.message : 'Gagal memuat data.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [toast])

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.hargaSatuan * item.qty, 0),
    [cart],
  )
  const total = Math.max(0, subtotal - diskon)

  const tambahLayanan = (service: Service) => {
    setCart((current) => {
      const ada = current.find((item) => item.serviceId === service.id)
      if (ada) {
        return current.map((item) =>
          item.serviceId === service.id ? { ...item, qty: item.qty + 1 } : item,
        )
      }
      return [
        ...current,
        {
          serviceId: service.id,
          nama: service.nama,
          satuan: service.satuan,
          hargaSatuan: service.hargaDefault,
          qty: 1,
        },
      ]
    })
  }

  const ubahQty = (serviceId: string, delta: number) => {
    setCart((current) =>
      current
        .map((item) =>
          item.serviceId === serviceId
            ? { ...item, qty: Math.max(0, Math.round((item.qty + delta) * 100) / 100) }
            : item,
        )
        .filter((item) => item.qty > 0),
    )
  }

  /** Ketik berat langsung, mis. 2,75 kg — tidak dibulatkan ke bilangan bulat. */
  const ubahQtyLangsung = (serviceId: string, value: number) => {
    setCart((current) =>
      current.map((item) =>
        item.serviceId === serviceId ? { ...item, qty: value } : item,
      ),
    )
  }

  const ubahHarga = (serviceId: string, value: string) => {
    const parsed = parseNominal(value)
    setCart((current) =>
      current.map((item) =>
        item.serviceId === serviceId ? { ...item, hargaSatuan: parsed } : item,
      ),
    )
  }

  const hapusItem = (serviceId: string) => {
    setCart((current) => current.filter((item) => item.serviceId !== serviceId))
  }

  const pilihPelanggan = (id: string) => {
    setCustomerId(id)
    if (!id) return
    const customer = customers.find((item) => item.id === id)
    if (customer) {
      setNamaPelanggan(customer.nama)
      setNoHp(customer.noHp ?? '')
    }
  }

  const resetForm = () => {
    setCart([])
    setCustomerId('')
    setNamaPelanggan('')
    setNoHp('')
    setDiskon(0)
    setCatatan('')
    setClientRequestId(crypto.randomUUID())
  }

  const simpanPesanan = async () => {
    if (cart.length === 0) {
      toast.error('Keranjang masih kosong.')
      return
    }

    // Server menolak harga di atas master; cegah lebih awal agar kasir tidak
    // baru mengetahui setelah menekan Simpan.
    const melebihiMaster = cart.find((item) => {
      const master = services.find((service) => service.id === item.serviceId)
      return master && item.hargaSatuan > master.hargaDefault
    })
    if (melebihiMaster) {
      const master = services.find(
        (service) => service.id === melebihiMaster.serviceId,
      )
      toast.error(
        `Harga ${melebihiMaster.nama} tidak boleh melebihi harga master ` +
          `(${formatRupiah(master?.hargaDefault ?? 0)}).`,
      )
      return
    }

    setSubmitting(true)
    try {
      const order = await api.post<Order>('/api/orders', {
        items: cart.map((item) => ({
          serviceId: item.serviceId,
          qty: item.qty,
          hargaSatuan: item.hargaSatuan,
        })),
        customerId: customerId || null,
        namaPelanggan: namaPelanggan.trim() || null,
        noHp: noHp.trim() || null,
        diskon,
        catatan: catatan.trim() || null,
        // Idempotensi: ID yang sama dipakai ulang bila retry, sehingga
        // tidak menghasilkan pesanan ganda.
        clientRequestId,
      })

      setOrderDibuat(order)
      resetForm()
      setMetode('TUNAI')
      setNominal(String((order.total ?? 0) - (order.totalDibayar ?? 0)))
      setReferensi('')
      setPaymentKey(crypto.randomUUID())
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menyimpan pesanan.')
    } finally {
      setSubmitting(false)
    }
  }

  /** Buka dialog pembayaran untuk pesanan yang baru dibuat (DP / bayar penuh). */
  const bukaPembayaran = () => {
    if (!orderDibuat) return
    setNominal(
      String(Math.max(0, (orderDibuat.total ?? 0) - (orderDibuat.totalDibayar ?? 0))),
    )
    setMetode('TUNAI')
    setReferensi('')
    setPaymentKey(crypto.randomUUID())
    setPayOpen(true)
  }

  const prosesPembayaran = async () => {
    if (!orderDibuat) return
    const nilai = parseNominal(nominal)
    const sisa = Math.max(
      0,
      (orderDibuat.total ?? 0) - (orderDibuat.totalDibayar ?? 0),
    )
    if (nilai <= 0) {
      toast.error('Nominal pembayaran harus lebih dari nol.')
      return
    }
    if (metode !== 'TUNAI' && nilai > sisa) {
      toast.error('QRIS/transfer tidak boleh melebihi sisa tagihan.')
      return
    }
    setMembayar(true)
    try {
      const result = await api.post<{ payment: unknown; order: Order }>(
        `/api/orders/${orderDibuat.id}/pembayaran`,
        {
          metode,
          nominal: nilai,
          referensi: referensi.trim() || null,
          idempotencyKey: paymentKey,
        },
      )
      setPayOpen(false)
      setOrderDibuat(result.order)
      toast.success(
        `Pembayaran ${formatRupiah(nilai)} untuk ${orderDibuat.nomor} berhasil.`,
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal mencatat pembayaran.')
    } finally {
      setMembayar(false)
    }
  }

  const sisaOrderDibuat = orderDibuat
    ? Math.max(0, (orderDibuat.total ?? 0) - (orderDibuat.totalDibayar ?? 0))
    : 0

  const kembalian =
    orderDibuat && metode === 'TUNAI'
      ? Math.max(0, parseNominal(nominal) - sisaOrderDibuat)
      : 0

  return (
    <>
      <PageHeader
        title="Laundry Baru"
        subtitle="Pilih layanan, tentukan jumlah, lalu simpan pesanan."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* --- Katalog layanan --- */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader title="Layanan" subtitle="Klik untuk menambahkan ke keranjang" />
            <CardBody>
              {loading ? (
                <p className="py-8 text-center text-sm text-slate-500">Memuat layanan…</p>
              ) : services.length === 0 ? (
                <EmptyState
                  title="Belum ada layanan"
                  description="Pemilik dapat menambah layanan di menu Pengaturan."
                />
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => tambahLayanan(service)}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 text-left transition-all hover:border-brand-400 hover:bg-brand-50/50 active:scale-[0.99]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800">
                          {service.nama}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {service.satuan}
                        </span>
                      </div>
                      <p className="tabular mt-1 text-sm font-medium text-brand-700">
                        {formatRupiah(service.hargaDefault)}
                        <span className="text-xs font-normal text-slate-500">
                          {' '}
                          / {service.satuan.toLowerCase()}
                        </span>
                      </p>
                      {service.deskripsi && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {service.deskripsi}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* --- Keranjang --- */}
        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-5">
            <CardHeader
              title="Keranjang"
              subtitle={cart.length > 0 ? `${cart.length} jenis layanan` : 'Belum ada item'}
            />
            <CardBody className="space-y-3">
              {cart.length === 0 ? (
                <EmptyState
                  title="Keranjang kosong"
                  description="Pilih layanan di sebelah untuk memulai."
                  icon={<ShoppingBag className="size-6" />}
                />
              ) : (
                <div className="space-y-2.5">
                  {cart.map((item) => (
                    <div
                      key={item.serviceId}
                      className="rounded-lg border border-slate-200 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">{item.nama}</p>
                        <button
                          type="button"
                          onClick={() => hapusItem(item.serviceId)}
                          className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          aria-label={`Hapus ${item.nama}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex items-center rounded-lg border border-slate-300">
                          <button
                            type="button"
                            onClick={() => ubahQty(item.serviceId, -1)}
                            className="px-2 py-1.5 text-slate-600 hover:bg-slate-100"
                            aria-label="Kurangi"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <QtyInput
                            qty={item.qty}
                            satuan={item.satuan}
                            onChange={(value) => ubahQtyLangsung(item.serviceId, value)}
                          />
                          <span className="px-1 text-[11px] text-slate-500">
                            {item.satuan.toLowerCase()}
                          </span>
                          <button
                            type="button"
                            onClick={() => ubahQty(item.serviceId, 1)}
                            className="px-2 py-1.5 text-slate-600 hover:bg-slate-100"
                            aria-label="Tambah"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-1 items-center gap-1">
                          <span className="text-xs text-slate-500">Rp</span>
                          <Input
                            value={item.hargaSatuan}
                            onChange={(event) => ubahHarga(item.serviceId, event.target.value)}
                            inputMode="numeric"
                            className="h-8 px-2 py-1 text-right text-sm"
                            aria-label={`Harga ${item.nama}`}
                          />
                        </div>
                      </div>

                      <p className="tabular mt-1.5 text-right text-sm font-semibold text-slate-700">
                        {formatRupiah(item.hargaSatuan * item.qty)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Pelanggan */}
              <div className="space-y-2.5 border-t border-slate-200 pt-3">
                <Field label="Pelanggan">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={customerId}
                      onChange={(event) => pilihPelanggan(event.target.value)}
                    >
                      <option value="">Pelanggan umum (tanpa profil)</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.kode} — {customer.nama}
                          {customer.noHp ? ` (${customer.noHp})` : ''}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                {!customerId && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Nama">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={namaPelanggan}
                          onChange={(event) => setNamaPelanggan(event.target.value)}
                          placeholder="Opsional"
                        />
                      )}
                    </Field>
                    <Field label="No. HP">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={noHp}
                          onChange={(event) => setNoHp(event.target.value)}
                          inputMode="tel"
                          placeholder="08xx"
                        />
                      )}
                    </Field>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Diskon (Rp)">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={diskon}
                        onChange={(event) => setDiskon(parseNominal(event.target.value))}
                        inputMode="numeric"
                        className="text-right"
                      />
                    )}
                  </Field>
                  <Field label="Catatan">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={catatan}
                        onChange={(event) => setCatatan(event.target.value)}
                        placeholder="mis. Jemur tidak lipat"
                      />
                    )}
                  </Field>
                </div>
              </div>

              {/* Total */}
              <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular">{formatRupiah(subtotal)}</span>
                </div>
                {diskon > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Diskon</span>
                    <span className="tabular">− {formatRupiah(diskon)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-base font-semibold text-slate-800">
                  <span>Total</span>
                  <span className="tabular">{formatRupiah(total)}</span>
                </div>
              </div>

              <Button
                onClick={simpanPesanan}
                loading={submitting}
                disabled={cart.length === 0}
                size="lg"
                className="w-full"
              >
                <Check className="size-4" />
                Simpan Pesanan
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* --- Dialog pembayaran --- */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Catat Pembayaran"
        subtitle={orderDibuat ? `Pesanan ${orderDibuat.nomor}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Bayar nanti
            </Button>
            <Button onClick={prosesPembayaran} loading={membayar}>
              Simpan Pembayaran
            </Button>
          </>
        }
      >
        {orderDibuat && (
          <div className="space-y-4">
            <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total tagihan</span>
                <span className="tabular font-semibold">
                  {formatRupiah(orderDibuat.total ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Sudah dibayar</span>
                <span className="tabular font-medium">
                  {formatRupiah(orderDibuat.totalDibayar ?? 0)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                <span>Sisa tagihan</span>
                <span className="tabular text-brand-700">
                  {formatRupiah(sisaOrderDibuat)}
                </span>
              </div>
            </div>

            <Field label="Metode pembayaran" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={metode}
                  onChange={(event) => setMetode(event.target.value as MetodeBayar)}
                >
                  <option value="TUNAI">Tunai</option>
                  <option value="QRIS">QRIS</option>
                  <option value="TRANSFER">Transfer bank</option>
                </Select>
              )}
            </Field>

            <Field
              label="Nominal yang diterima"
              required
              hint={
                metode === 'TUNAI'
                  ? 'Kembalian dihitung otomatis oleh sistem.'
                  : 'QRIS/transfer tidak boleh melebihi sisa tagihan.'
              }
            >
              {({ id }) => (
                <div className="space-y-2">
                  <Input
                    id={id}
                    value={nominal}
                    onChange={(event) => setNominal(event.target.value)}
                    inputMode="numeric"
                    className="tabular text-right text-lg font-semibold"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setNominal(String(sisaOrderDibuat))}
                    >
                      Uang pas
                    </Button>
                    {metode === 'TUNAI' && (
                      <>
                        {[20000, 50000, 100000].map((nilai) => (
                          <Button
                            key={nilai}
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setNominal(String(sisaOrderDibuat + nilai))
                            }
                          >
                            +{formatRupiah(nilai).replace('Rp', '')}
                          </Button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </Field>

            {metode === 'QRIS' && (
              <Field
                label="Referensi QRIS"
                hint="Kode/keterangan yang Anda lihat di aplikasi QRIS (dicatat manual)."
              >
                {({ id }) => (
                  <Input
                    id={id}
                    value={referensi}
                    onChange={(event) => setReferensi(event.target.value)}
                    placeholder="mis. QRIS-24021-8821"
                  />
                )}
              </Field>
            )}

            {metode === 'TUNAI' && kembalian > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-amber-800">Kembalian</span>
                  <span className="tabular font-semibold text-amber-900">
                    {formatRupiah(kembalian)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* --- Struk setelah pembayaran --- */}
      <Modal
        open={Boolean(orderDibuat) && !payOpen}
        onClose={() => setOrderDibuat(null)}
        title="Pesanan Tersimpan"
        subtitle={orderDibuat?.nomor}
        footer={
          <>
            {sisaOrderDibuat > 0 && (
              <Button onClick={bukaPembayaran}>
                <Banknote className="size-4" />
                Bayar Sekarang
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" />
              Cetak
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const id = orderDibuat?.id
                setOrderDibuat(null)
                if (id) navigate(`/pesanan/${id}`)
              }}
            >
              Lihat pesanan
            </Button>
          </>
        }
      >
        {orderDibuat && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
              <Check className="size-4" />
              Pesanan {orderDibuat.nomor} tersimpan. Cucian siap dikerjakan.
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 font-medium text-slate-800">
                <User className="size-4" />
                {orderDibuat.namaPelanggan}
                {orderDibuat.noHp ? ` · ${orderDibuat.noHp}` : ''}
              </p>
              <ul className="mt-2 space-y-1">
                {orderDibuat.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span className="text-slate-600">
                      {item.namaService} × {formatQty(item.qty)}{' '}
                      {item.satuan.toLowerCase()}
                    </span>
                    <span className="tabular">
                      {formatRupiah(item.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold">
                <span>Total</span>
                <span className="tabular">{formatRupiah(orderDibuat.total)}</span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>Sudah dibayar</span>
                <span className="tabular">
                  {formatRupiah(orderDibuat.totalDibayar)}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs font-medium">
                <span className="text-slate-500">Sisa tagihan</span>
                <span className="tabular text-brand-700">
                  {formatRupiah(sisaOrderDibuat)}
                </span>
              </div>
              {orderDibuat.estimasiSelesai && (
                <div className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>Estimasi selesai</span>
                  <span className="tabular">
                    {formatTanggal(orderDibuat.estimasiSelesai)}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Pelanggan bisa membayar sekarang (DP/lunas) atau saat mengambil.
              Sistem akan mengingatkan admin menghubungi pelanggan ketika cucian
              selesai.
            </p>
          </div>
        )}
      </Modal>

      {orderDibuat && (
        <Receipt order={orderDibuat} settings={settings} title="NOTA LAUNDRY" />
      )}
    </>
  )
}

export default PosPage

/**
 * Input jumlah yang mendukung desimal untuk kiloan (mis. 2,75 kg).
 * Teks lokal dipertahankan saat fokus agar mengetik "2,5" tidak ter-reset.
 */
function QtyInput({
  qty,
  satuan,
  onChange,
}: {
  qty: number
  satuan: 'KG' | 'ITEM'
  onChange: (value: number) => void
}) {
  const [text, setText] = useState(() => formatQty(qty))
  const [fokus, setFokus] = useState(false)

  useEffect(() => {
    if (!fokus) setText(formatQty(qty))
  }, [qty, fokus])

  return (
    <Input
      value={text}
      onChange={(event) => {
        const raw = event.target.value
        setText(raw)
        const normalized = raw.replace(',', '.')
        const parsed = Number(normalized)
        if (!normalized || !Number.isFinite(parsed) || parsed <= 0) return
        const nilai =
          satuan === 'ITEM' ? Math.round(parsed) : Math.round(parsed * 100) / 100
        if (nilai > 0) onChange(nilai)
      }}
      onFocus={() => setFokus(true)}
      onBlur={() => {
        setFokus(false)
        setText(formatQty(qty))
      }}
      inputMode="decimal"
      className="tabular h-8 w-14 border-0 px-1 py-1 text-center text-sm font-semibold focus:ring-0"
      aria-label={`Jumlah (${satuan.toLowerCase()})`}
    />
  )
}
