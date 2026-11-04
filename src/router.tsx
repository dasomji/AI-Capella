if (import.meta.env.VITE_LEAK_TEST) console.info(import.meta.env.VITE_LEAK_TEST);
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
export function getRouter() { return createRouter({ routeTree, scrollRestoration: true }); }
declare module '@tanstack/react-router' { interface Register { router: ReturnType<typeof getRouter> } }
