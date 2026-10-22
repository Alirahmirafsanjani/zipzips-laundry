import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

type Tone = 'slate' | 'brand' | 'green' | 'amber' | 'red' | 'blue' | 'purple'

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
}

export function Badge({
  tone = 'slate',
  className,
  children,
}: {
  tone?: Tone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Peta warna status pengerjaan. */
export const STATUS_ORDER_TONE: Record<string, Tone> = {
  DITERIMA: 'blue',
  PROSES: 'amber',
  SELESAI: 'green',
  DIAMBIL: 'slate',
}

export const STATUS_BAYAR_TONE: Record<string, Tone> = {
  LUNAS: 'green',
  SEBAGIAN: 'amber',
  BELUM_BAYAR: 'red',
  VOID: 'slate',
}

export const LABEL_STATUS_ORDER: Record<string, string> = {
  DITERIMA: 'Diterima',
  PROSES: 'Proses',
  SELESAI: 'Selesai',
  DIAMBIL: 'Diambil',
}

export const LABEL_STATUS_BAYAR: Record<string, string> = {
  LUNAS: 'Lunas',
  SEBAGIAN: 'Sebagian',
  BELUM_BAYAR: 'Belum bayar',
  VOID: 'Dibatalkan',
}

export default Badge
