if (import.meta.env.VITE_LEAK_TEST) console.info(import.meta.env.VITE_LEAK_TEST);
import { createRouter, createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
// Dead-code eliminated from both production builds; the route and module ship only in dev.
if (import.meta.env.DEV) {
  const showcase = createRoute({ getParentRoute: () => routeTree, path: '/dev/design-system',
    component: lazyRouteComponent(() => import('./design-system/showcase'), 'DesignSystemShowcase') });
  // HMR re-evaluates this module while the generated tree may retain its dev child.
  if (!Object.values(routeTree.children ?? {}).some(child => child.options.path === '/dev/design-system')) {
    routeTree.addChildren({ ...routeTree.children, showcase });
  }
}
export function getRouter() { return createRouter({ routeTree, scrollRestoration: true }); }
declare module '@tanstack/react-router' { interface Register { router: ReturnType<typeof getRouter> } }
