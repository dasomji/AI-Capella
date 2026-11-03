import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '../parchment.css';
import '../auth.css';
export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }, { title: 'LightScore' }, { name: 'theme-color', content: '#1B1621' }, { name: 'mobile-web-app-capable', content: 'yes' }, { name: 'apple-mobile-web-app-capable', content: 'yes' }, { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }, { name: 'apple-mobile-web-app-title', content: 'LightScore' }], links: [{ rel: 'icon', href: '/favicon.svg' }, { rel: 'manifest', href: '/manifest.webmanifest' }, { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }] }),
  component: () => <html lang="en" suppressHydrationWarning><head><HeadContent /><script dangerouslySetInnerHTML={{ __html: `(function(){try{var q=new URLSearchParams(location.search).get('design');if(q==='auto')localStorage.removeItem('ai-capella-design');else if(['papier','pergament','samt'].includes(q))localStorage.setItem('ai-capella-design',q);var d=localStorage.getItem('ai-capella-design')||'auto';if(d==='auto')d=matchMedia('(prefers-color-scheme: light)').matches?'pergament':'papier';document.documentElement.dataset.design=d==='pergament'?'papier':d;if(d==='pergament'){document.documentElement.dataset.ground='pergament';document.querySelector('meta[name=theme-color]')?.setAttribute('content','#E8D9B8');}else{delete document.documentElement.dataset.ground;}}catch(e){}})();` }} /></head><body><Outlet /><Scripts /></body></html>,
});
