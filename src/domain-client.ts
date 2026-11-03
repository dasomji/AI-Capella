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
  const upload = method === "POST" && /\/pieces(?:\/[^/]+\/versions)?$/.test(path) && (body as any)?.content;
  const input = body as any;
  const headers: Record<string,string> = upload ? {
    "Content-Type": input.content.format === "musicxml" ? "text/xml" : "application/json",
    ...(input.title ? {"x-score-title":encodeURIComponent(input.title)} : {}),
    ...(input.idempotencyKey ? {"idempotency-key":input.idempotencyKey} : {}),
    ...(input.expectedRevision ? {"x-expected-revision":String(input.expectedRevision)} : {}),
  } : body === undefined ? {} : {"Content-Type":"application/json"};
  const r = await fetch(`/api${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: upload ? (input.content.format === "musicxml" ? input.content.body : JSON.stringify(input.content.body)) : JSON.stringify(body) }),
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
