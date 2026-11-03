import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '../parchment.css';
import '../auth.css';
export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }, { title: 'LightScore' }], links: [{ rel: 'icon', href: '/favicon.svg' }] }),
  component: () => <html lang="en" data-design="papier" data-ground="pergament"><head><HeadContent /></head><body><Outlet /><Scripts /></body></html>,
});
