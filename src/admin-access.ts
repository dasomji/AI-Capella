import { createServerFn } from '@tanstack/react-start';
export const confirmAdmin = createServerFn({ method: 'GET' }).handler(async () => {
 const { getRequestHeaders } = await import('@tanstack/react-start/server');
 const { adminSession } = await import('../server/admin-auth.server');
 return !!await adminSession(getRequestHeaders());
});
