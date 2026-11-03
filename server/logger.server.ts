// Never serialize error messages, request bodies, URLs, headers or arbitrary metadata.
// Dependency errors can embed credentials, SQL parameters and reset links.
export function logError(event: string, error?: unknown, requestId?: string) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event,
    requestId, code: code && /^[A-Z0-9_]{2,40}$/.test(code) ? code : undefined }));
}
