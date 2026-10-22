import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      counter += 1
      const id = counter
      setItems((current) => [...current, { id, tone, message }])
      setTimeout(() => remove(id), tone === 'error' ? 6000 : 3500)
    },
    [remove],
  )

  const value: ToastContextValue = {
    show,
    success: (message: string) => show(message, 'success'),
    error: (message: string) => show(message, 'error'),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'animate-in-up pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl px-4 py-3 text-sm shadow-lg',
              item.tone === 'success' && 'bg-emerald-600 text-white',
              item.tone === 'error' && 'bg-red-600 text-white',
              item.tone === 'info' && 'bg-slate-800 text-white',
            )}
          >
            {item.tone === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
            {item.tone === 'error' && <XCircle className="mt-0.5 size-4 shrink-0" />}
            {item.tone === 'info' && <Info className="mt-0.5 size-4 shrink-0" />}
            <span className="flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
              aria-label="Tutup notifikasi"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast harus dipakai di dalam <ToastProvider>')
  return ctx
}

export default ToastProvider
