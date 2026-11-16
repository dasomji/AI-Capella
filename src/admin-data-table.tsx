import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  rowPaginationFeature,
  globalFilteringFeature,
  columnFilteringFeature,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { adminRequest, managementError } from "./admin-request";
import { adminMessages, adminManagementMessages, type Lang } from "./i18n";
export type AdminRow = Record<string, any>;
export type AdminColumn = {
  id: string;
  label: string;
  sort?: string;
  cell?: (row: AdminRow) => ReactNode;
};
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  globalFilteringFeature,
});
/** One server page at a time; cursors are scoped to the complete filter/sort/limit query. */
export function AdminDataTable({
  path,
  columns,
  language,
  filters = {},
  search: externalSearch,
  onOpen,
  revision = 0,
  onZone,
  caption,
}: {
  path: string;
  columns: AdminColumn[];
  language: Lang;
  filters?: Record<string, string>;
  search?: string;
  onOpen?: (row: AdminRow) => void;
  revision?: number;
  onZone?: (zone: string) => void;
  caption: string;
}) {
  const d = adminMessages[language],
    m = adminManagementMessages[language];
  const [rows, setRows] = useState<AdminRow[]>([]),
    [search, setSearch] = useState(""),
    [sorting, setSorting] = useState<SortingState>([]),
    [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 30 }),
    [cursors, setCursors] = useState<(string | undefined)[]>([undefined]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const generation = useRef(0),
    filterKey = JSON.stringify(filters),
    searchValue = externalSearch ?? search;
  const defs = useMemo<ColumnDef<typeof features, AdminRow>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        accessorFn: (r) => r[c.id],
        header: c.label,
        enableSorting: !!c.sort,
        cell: (ctx) =>
          c.cell ? c.cell(ctx.row.original) : String(ctx.getValue() ?? "—"),
      })),
    [columns],
  );
  const table = useTable({
    features,
    data: rows,
    columns: defs,
    getRowId: (r) => r.id,
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    pageCount: -1,
    enableSortingRemoval: false,
    state: { sorting, pagination, globalFilter: searchValue },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });
  const sort = sorting[0],
    sortKey = sort ? columns.find((c) => c.id === sort.id)?.sort : filters.sort;
  const signature = JSON.stringify([
    path,
    filterKey,
    searchValue,
    sortKey,
    sort?.desc,
    pagination.pageSize,
    revision,
  ]);
  const signatureRef = useRef(signature);
  useEffect(() => {
    const changed = signatureRef.current !== signature;
    signatureRef.current = signature;
    if (changed) {
      setCursors([undefined]);
      setNext(null);
      setRows([]);
      if (pagination.pageIndex) {
        setPagination((p) => ({ ...p, pageIndex: 0 }));
        return;
      }
    }
    const current = ++generation.current;
    setBusy(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          ...filters,
          search: searchValue,
          limit: String(pagination.pageSize),
          ...(sortKey ? { sort: sortKey } : {}),
          ...(sort ? { direction: sort.desc ? "desc" : "asc" } : {}),
          ...(!changed && cursors[pagination.pageIndex]
            ? { cursor: cursors[pagination.pageIndex] }
            : {}),
        });
        const r = await adminRequest(path + "?" + params);
        if (current !== generation.current) return;
        setRows(r.items);
        setNext(r.nextCursor);
        onZone?.(r.timeZone);
      } catch (e) {
        if (current === generation.current) {
          setRows([]);
          setNext(null);
          setError(managementError(e, language));
        }
      } finally {
        if (current === generation.current) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [signature, pagination.pageIndex]);
  return (
    <section className="admin-data-table" aria-label={caption}>
      {externalSearch === undefined && (
        <label>
          {d.search}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <div
        className="admin-table-wrap"
        tabIndex={0}
        role="region"
        aria-label={caption}
        aria-busy={busy}
      >
        <table>
          <caption className="admin-sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                      }
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => header.column.toggleSorting()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === "asc"
                            ? " ↑"
                            : sorted === "desc"
                              ? " ↓"
                              : ""}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={onOpen ? 0 : undefined}
                onClick={onOpen ? () => onOpen(row.original) : undefined}
                onKeyDown={(e) => {
                  if (
                    onOpen &&
                    e.target === e.currentTarget &&
                    ["Enter", " "].includes(e.key)
                  ) {
                    e.preventDefault();
                    onOpen(row.original);
                  }
                }}
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!busy && !error && !rows.length && <p>{d.empty}</p>}
      <div className="admin-pagination">
        <button
          type="button"
          disabled={busy || !pagination.pageIndex}
          onClick={() => table.previousPage()}
        >
          {m.previous}
        </button>
        <span aria-live="polite">
          {m.page} {pagination.pageIndex + 1}
          {busy ? " · " + m.loading : ""}
        </span>
        <button
          type="button"
          disabled={busy || !next}
          onClick={() => {
            setCursors((old) => [
              ...old.slice(0, pagination.pageIndex + 1),
              next!,
            ]);
            table.nextPage();
          }}
        >
          {m.next}
        </button>
        <label>
          {m.pageSize}
          <select
            value={pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[10, 30, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
