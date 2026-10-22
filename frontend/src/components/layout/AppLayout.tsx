import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Banknote,
  Boxes,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  Shirt,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'
import type { Role } from '@/types'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: Role[]
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Beranda',
    icon: LayoutDashboard,
    roles: ['OWNER', 'KASIR', 'OPERATOR'],
    end: true,
  },
  { to: '/pos', label: 'POS / Laundry Baru', icon: Shirt, roles: ['OWNER', 'KASIR'] },
  { to: '/pesanan', label: 'Pesanan', icon: Receipt, roles: ['OWNER', 'KASIR', 'OPERATOR'] },
  { to: '/pelanggan', label: 'Pelanggan', icon: Users, roles: ['OWNER', 'KASIR'] },
  { to: '/keuangan', label: 'Keuangan', icon: Banknote, roles: ['OWNER'] },
  { to: '/stok', label: 'Stok Bahan', icon: Boxes, roles: ['OWNER'] },
  { to: '/pengguna', label: 'Pengguna', icon: UserCog, roles: ['OWNER'] },
  { to: '/pengaturan', label: 'Pengaturan', icon: Settings, roles: ['OWNER'] },
]

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Pemilik',
  KASIR: 'Kasir',
  OPERATOR: 'Karangian',
}

export function AppLayout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!user) return null

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Package className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">ZIP-ZIPS</p>
          <p className="truncate text-xs text-brand-200">LAUNDRI</p>
        </div>
        <button
          type="button"
          className="ml-auto rounded-lg p-1.5 text-brand-200 hover:bg-brand-800 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Tutup menu"
        >
          <X className="size-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-700 text-white'
                  : 'text-brand-100 hover:bg-brand-800/70 hover:text-white',
              )
            }
          >
            <item.icon className="size-4.5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-brand-800 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {initials(user.nama)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.nama}</p>
            <p className="truncate text-xs text-brand-200">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-2 text-brand-200 transition-colors hover:bg-brand-800 hover:text-white"
            title="Keluar"
            aria-label="Keluar"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 bg-brand-900 lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Sidebar mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative h-full w-64 bg-brand-900 shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Buka menu"
          >
            <Menu className="size-5" />
          </button>
          <p className="truncate text-sm font-semibold text-slate-800">ZIP-ZIPS LAUNDRI</p>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-6xl">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  )
}

export default AppLayout
