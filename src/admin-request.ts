import { adminRateMessage, adminManagementMessages, type Lang } from "./i18n";
export class AdminRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function adminRequest(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch("/api/admin/" + path, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    const lang = localStorage.getItem("ai-capella-lang") === "de" ? "de" : "en";
    throw new AdminRequestError(
      r.status,
      data.code ?? "",
      data.max && data.unit
        ? adminRateMessage(data.max, data.unit, lang)
        : (data.message ?? String(r.status)),
    );
  }
  return data;
}
export function managementError(error: unknown, language: Lang) {
  const d = adminManagementMessages[language];
  if (error instanceof AdminRequestError) {
    if (error.status === 429) return error.message;
    return (d as Record<string, string>)[error.code] ?? d.error;
  }
  return d.error;
}
