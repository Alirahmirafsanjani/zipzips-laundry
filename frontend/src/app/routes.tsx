import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ToastProvider } from '@/components/ui/Toast'
import { RequireAuth, RequireRole } from '@/app/guard'
import { AppLayout } from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import PosPage from '@/pages/PosPage'
import OrdersPage from '@/pages/OrdersPage'
import OrderDetailPage from '@/pages/OrderDetailPage'
import FinancePage from '@/pages/FinancePage'
import UsersPage from '@/pages/UsersPage'
import ServicesPage from '@/pages/ServicesPage'
import SettingsPage from '@/pages/SettingsPage'
import NotFoundPage from '@/pages/NotFoundPage'

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route
                path="pos"
                element={
                  <RequireRole roles={['OWNER', 'KASIR']}>
                    <PosPage />
                  </RequireRole>
                }
              />
              <Route path="pesanan" element={<OrdersPage />} />
              <Route path="pesanan/:id" element={<OrderDetailPage />} />
              <Route
                path="layanan"
                element={
                  <RequireRole roles={['OWNER']}>
                    <ServicesPage />
                  </RequireRole>
                }
              />
              <Route
                path="keuangan"
                element={
                  <RequireRole roles={['OWNER']}>
                    <FinancePage />
                  </RequireRole>
                }
              />
              <Route
                path="pengguna"
                element={
                  <RequireRole roles={['OWNER']}>
                    <UsersPage />
                  </RequireRole>
                }
              />
              <Route
                path="pengaturan"
                element={
                  <RequireRole roles={['OWNER']}>
                    <SettingsPage />
                  </RequireRole>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
