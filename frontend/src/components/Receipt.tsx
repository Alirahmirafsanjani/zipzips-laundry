import { createPortal } from 'react-dom'
import { formatQty, formatRupiah, formatTanggal, formatTanggalWaktu } from '@/lib/format'
import type { Order } from '@/types'

export interface StoreSettings {
  namaToko?: string
  alamat?: string
  noWhatsapp?: string
  catatanStruk?: string
}

export const DEFAULT_STORE: StoreSettings = {
  namaToko: 'ZIP-ZIPS LAUNDRI',
  alamat: '',
  noWhatsapp: '',
  catatanStruk: 'Terima kasih telah laundry di ZIP-ZIPS LAUNDRI!',
}

const LABEL_BAYAR: Record<string, string> = {
  BELUM_BAYAR: 'Belum dibayar',
  SEBAGIAN: 'DP / sebagian',
  VOID: 'Dibatalkan',
  LUNAS: 'Lunas',
}

/**
 * Struk 80 mm. Disembunyikan di layar dan hanya tampil saat `window.print()`.
 * Cetak dari halaman detail pesanan maupun setelah pesanan dibuat di POS.
 */
export function Receipt({
  order,
  settings,
  title = 'NOTA LAUNDRY',
}: {
  order: Order
  settings: StoreSettings
  title?: string
}) {
  const total = order.total ?? 0
  const dibayar = order.totalDibayar ?? 0
  const sisa = Math.max(0, total - dibayar)
  const toko = settings.namaToko?.trim() || DEFAULT_STORE.namaToko
  const catatanStruk =
    settings.catatanStruk?.trim() || DEFAULT_STORE.catatanStruk

  return createPortal(
    <div
      className="print-area hidden bg-white text-[11px] leading-snug text-black print:block"
      aria-hidden="true"
    >
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-wide">{toko}</p>
        {settings.alamat?.trim() && <p>{settings.alamat}</p>}
        {settings.noWhatsapp?.trim() && <p>WA: {settings.noWhatsapp}</p>}
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span>{order.nomor}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span>{formatTanggalWaktu(order.tanggalMasuk)}</span>
        <span>{order.namaPelanggan}</span>
      </div>
      {order.noHp && <div>HP: {order.noHp}</div>}

      <div className="my-2 border-t border-dashed border-black" />

      <table className="w-full">
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="pr-1">
                {item.namaService}
                <div className="text-[10px]">
                  {formatQty(item.qty)} {item.satuan.toLowerCase()} ×{' '}
                  {formatRupiah(item.hargaSatuan)}
                </div>
              </td>
              <td className="whitespace-nowrap text-right">
                {formatRupiah(item.subtotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRupiah(order.subtotal)}</span>
        </div>
        {(order.diskon ?? 0) > 0 && (
          <div className="flex justify-between">
            <span>Diskon</span>
            <span>-{formatRupiah(order.diskon)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-bold">
          <span>TOTAL</span>
          <span>{formatRupiah(total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Dibayar</span>
          <span>{formatRupiah(dibayar)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Sisa</span>
          <span>{formatRupiah(sisa)}</span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span>Status</span>
          <span>{LABEL_BAYAR[order.statusPembayaran ?? ''] ?? '-'}</span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-0.5">
        <div className="flex justify-between gap-2">
          <span>Estimasi selesai</span>
          <span>{formatTanggal(order.estimasiSelesai)}</span>
        </div>
        {order.tanggalSelesai && (
          <div className="flex justify-between gap-2">
            <span>Selesai</span>
            <span>{formatTanggal(order.tanggalSelesai)}</span>
          </div>
        )}
        {order.tanggalDiambil && (
          <div className="flex justify-between gap-2">
            <span>Diambil</span>
            <span>{formatTanggal(order.tanggalDiambil)}</span>
          </div>
        )}
        {sisa > 0 && order.jatuhTempo && (
          <div className="flex justify-between gap-2 font-semibold">
            <span>Janji bayar</span>
            <span>{formatTanggal(order.jatuhTempo)}</span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span>Status cucian</span>
          <span>{order.statusOrder}</span>
        </div>
      </div>

      {order.catatan?.trim() && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <p className="whitespace-pre-wrap">Catatan: {order.catatan}</p>
        </>
      )}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center text-[10px] whitespace-pre-wrap">
        {catatanStruk}
      </p>
      <p className="mt-1 text-center text-[9px]">
        Simpan nota ini sebagai bukti pengambilan.
      </p>
    </div>,
    document.body,
  )
}
