import { Link } from 'react-router'
import { useSession } from '../api/hooks'
import { homeFor } from '../app/session'
import { EmptyState, PageHeader } from '../components/ui'

export function NotFoundPage() {
  const { data } = useSession()
  return (
    <div className="page">
      <PageHeader title="Page not found" />
      <EmptyState
        title="There is no page at this address"
        action={
          <Link className="button button-primary" to={homeFor(data?.role ?? 'coordinator')}>
            Go to your home page
          </Link>
        }
      >
        Check the address, or use the menu to find what you need.
      </EmptyState>
    </div>
  )
}
