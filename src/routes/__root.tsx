import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AccountStage } from '../account-stage';
import { lang, notFoundMessages, type Lang } from '../i18n';
import { initializeTheme } from '../design-system/theme';
import appCss from '../design-system/app.css?url';
import { themeBootstrapScript } from '../design-system/theme/bootstrap';
export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }, { title: 'LightScore' }, { name: 'mobile-web-app-capable', content: 'yes' }, { name: 'apple-mobile-web-app-capable', content: 'yes' }, { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }, { name: 'apple-mobile-web-app-title', content: 'LightScore' }], links: [{ rel: 'stylesheet', href: appCss }, { rel: 'icon', href: '/favicon.svg' }, { rel: 'manifest', href: '/manifest.webmanifest' }, { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }] }),
  component: RootDocument,
  notFoundComponent: NotFound,
});
function RootDocument() {
  useEffect(() => { initializeTheme(); }, []);
  return <html lang="en" suppressHydrationWarning><head><HeadContent /><script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} /></head><body><Outlet /><Scripts /></body></html>;
}

function NotFound() {
  const [language, setLanguage] = useState<Lang>('en');
  useEffect(() => { setLanguage(lang); }, []);
  const text = notFoundMessages[language];
  return <AccountStage language={language} onLanguage={setLanguage}>
    <h2>{text.title}</h2>
    <p>{text.description}</p>
    <a href="/app">{text.recovery}</a>
  </AccountStage>;
}
