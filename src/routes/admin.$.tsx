import { createFileRoute, notFound } from '@tanstack/react-router';
import { confirmAdmin } from '../admin-access';
import { AdminPage } from '../admin-ui';
/** List filters live in the URL so a detail page's Back returns to the same list; values stay strings. */
const adminSearch = (search: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(search).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v) && v !== '').map(([k, v]) => [k, String(v)]));
export const Route = createFileRoute('/admin/$')({
  validateSearch: adminSearch,
  // Revalidate the platform role even when navigation reuses this route match.
  beforeLoad: async () => { if (!await confirmAdmin()) throw notFound(); },
  component: AdminRoute,
});
function AdminRoute() {
  const { _splat } = Route.useParams();
  return <AdminPage splat={_splat} query={Route.useSearch()} />;
}
