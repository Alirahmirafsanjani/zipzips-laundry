import { cn } from '@/lib/cn'
import { useId } from 'react'

interface FieldProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: (props: { id: string; invalid: boolean }) => React.ReactNode
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const id = useId()
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children({ id, invalid: Boolean(error) })}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

const baseInput =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 transition-colors ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600/30 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'

export function Input({
  className,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(
        baseInput,
        invalid ? 'border-red-400' : 'border-slate-300',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({
  className,
  invalid,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(
        baseInput,
        'min-h-20 resize-y',
        invalid ? 'border-red-400' : 'border-slate-300',
        className,
      )}
      {...props}
    />
  )
}

export function Select({
  className,
  invalid,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cn(
        baseInput,
        'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%2364748b\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E")] bg-[length:20px_20px] bg-[right_0.5rem_center] bg-no-repeat pr-9',
        invalid ? 'border-red-400' : 'border-slate-300',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export default Input
