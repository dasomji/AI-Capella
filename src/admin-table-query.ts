/** Clamp against the pages we can actually address (cursor lists need no total-count query). */
export function clampedPageIndex(pageIndex: number, pageCount: number): number {
  return Math.max(0, Math.min(pageIndex, Math.max(0, pageCount - 1)));
}

/** Detail and list tables share server matching, filters and pagination parameters. */
export function adminTableParams({ filters, search, pageSize, sort, descending, cursor }: {
  filters: Record<string, string>;
  search: string;
  pageSize: number;
  sort?: string;
  descending?: boolean;
  cursor?: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    ...filters,
    search,
    limit: String(pageSize),
    ...(sort ? { sort, direction: descending ? "desc" : "asc" } : {}),
    ...(cursor ? { cursor } : {}),
  });
  for (const [key, value] of [...params]) if (value === "") params.delete(key);
  return params;
}
