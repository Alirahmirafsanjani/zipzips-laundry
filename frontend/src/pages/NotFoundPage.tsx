import { Link } from 'react-router-dom'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

export function NotFoundPage() {
  return (
    <Card>
      <CardBody>
        <EmptyState
          title="Halaman tidak ditemukan"
          description="Alamat yang Anda buka tidak tersedia."
          action={
            <Link
              to="/"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Kembali ke beranda
            </Link>
          }
        />
      </CardBody>
    </Card>
  )
}

export default NotFoundPage
