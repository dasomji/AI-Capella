export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) {
    window.dispatchEvent(
      new CustomEvent("domain:error", {
        detail: { code: data.code, status: r.status },
      }),
    );
    throw new ApiError(data.code || "service_unavailable", r.status);
  }
  return data;
}
