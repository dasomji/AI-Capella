import { Button, EmptyState, Field, Loading, Select, Status, Table, TableCell, TableHeader, TablePagination, TableRow, TableWrap } from "./design-system/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  rowPaginationFeature,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { adminRequest, managementError } from "./admin-request";
import { adminManagementMessages } from "./i18n";
import { fill, ui, useAdmin, type AdminRow } from "./admin-format";
export type { AdminRow } from "./admin-format";
export type AdminColumn = {
  id: string;
  label: string;
  /** Server sort key; the column header becomes a sort button. */
  sort?: string;
  mono?: boolean;
  cell?: (row: AdminRow) => ReactNode;
};
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
});
const interactive = "a,button,input,select,textarea,label,summary,[role=button]";
/**
 * One server page at a time; cursors are scoped to the complete filter/sort/limit query.
 * Pieces, audit, jobs, users, ensembles, memberships and pickers all share this table.
 */
export function AdminDataTable({
  path,
  columns,
  filters = {},
  search = "",
  onOpen,
  revision = 0,
  caption,
  defaultSort,
  pageSize: initialPageSize = 30,
  filtered = false,
  onClear,
  emptyTitle,
  onRows,
  variant = "records",
  "data-admin": dataAdmin = "data-table",
}: {
  path: string;
  columns: AdminColumn[];
  filters?: Record<string, string>;
  search?: string;
  /** Opens the row's detail; rows keep a real link in their first cell for keyboard users. */
  onOpen?: (row: AdminRow) => void;
  revision?: number;
  caption: string;
  defaultSort?: { id: string; desc: boolean };
  pageSize?: number;
  /** True when the caller has active filters; an empty result then offers Clear filters. */
  filtered?: boolean;
  onClear?: () => void;
  emptyTitle?: string;
  onRows?: (rows: AdminRow[]) => void;
  variant?: "records" | "scroll";
  "data-admin"?: string;
}) {
  const { language, t, setZone } = useAdmin();
  const m = adminManagementMessages[language];
  const [rows, setRows] = useState<AdminRow[]>([]),
    [sorting, setSorting] = useState<SortingState>(defaultSort ? [defaultSort] : []),
    [pagination, setPagination] = useState({ pageIndex: 0, pageSize: initialPageSize }),
    [cursors, setCursors] = useState<(string | undefined)[]>([undefined]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const generation = useRef(0),
    filterKey = JSON.stringify(filters);
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
    manualPagination: true,
    pageCount: -1,
    enableSortingRemoval: false,
    enableMultiSort: false,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });
  const sort = sorting[0],
    sortKey = sort ? columns.find((c) => c.id === sort.id)?.sort : undefined;
  const signature = JSON.stringify([
    path,
    filterKey,
    search,
    sortKey,
    sort?.desc,
    pagination.pageSize,
  ]);
  const signatureRef = useRef(signature),
    loadedPage = useRef<string | null>(null);
  useEffect(() => {
    setBusy(true);
    setError("");
    const changed = signatureRef.current !== signature;
    signatureRef.current = signature;
    if (changed) {
      loadedPage.current = null;
      setCursors([undefined]);
      setNext(null);
      setRows([]);
      if (pagination.pageIndex) {
        setPagination((p) => ({ ...p, pageIndex: 0 }));
        return;
      }
    }
    const pageKey = JSON.stringify([signature, pagination.pageIndex]);
    // Only retain data and its cursor when refreshing the page currently displayed.
    const refresh = loadedPage.current === pageKey;
    const current = ++generation.current;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          ...filters,
          search,
          limit: String(pagination.pageSize),
          ...(sortKey ? { sort: sortKey } : {}),
          ...(sort ? { direction: sort.desc ? "desc" : "asc" } : {}),
          ...(!changed && cursors[pagination.pageIndex]
            ? { cursor: cursors[pagination.pageIndex] }
            : {}),
        });
        for (const [key, value] of [...params]) if (value === "") params.delete(key);
        const r = await adminRequest(path + (path.includes("?") ? "&" : "?") + params);
        if (current !== generation.current) return;
        loadedPage.current = pageKey;
        setRows(r.items);
        onRows?.(r.items);
        setNext(r.nextCursor);
        if (r.timeZone) setZone(r.timeZone);
      } catch (e) {
        if (current === generation.current) {
          if (!refresh) {
            loadedPage.current = null;
            setRows([]);
            setNext(null);
          }
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
  }, [signature, pagination.pageIndex, revision, retry]);
  const label = (id: string) => columns.find((c) => c.id === id)?.label ?? "";
  return (
    <section data-admin={dataAdmin} aria-label={caption} aria-busy={busy}>
      {error && (
        <div className={ui.actions}>
          <Status variant="admin" intent="error" role="alert">{error}</Status>
          <Button size="compact" type="button" onClick={() => setRetry((v) => v + 1)}>
            {t.retry}
          </Button>
        </div>
      )}
      <TableWrap variant={variant} data-admin="table-wrap" tabIndex={0} aria-label={caption}>
        <Table>
          <caption hidden>{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHeader
                      key={header.id}
                      scope="col"
                      aria-sort={
                        !header.column.getCanSort()
                          ? undefined
                          : sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                      }
                    >
                      {header.column.getCanSort() ? (
                        <Button
                          size="compact"
                          intent="quiet"
                          type="button"
                          aria-disabled={busy}
                          onClick={() => {
                            if (!busy) header.column.toggleSorting();
                          }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : ""}
                        </Button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHeader>
                  );
                })}
              </TableRow>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-row-id={row.id}
                data-href={onOpen ? "" : undefined}
                onClick={
                  onOpen
                    ? (event) => {
                        if ((event.target as Element).closest(interactive)) return;
                        if (getSelection()?.toString()) return;
                        onOpen(row.original);
                      }
                    : undefined
                }
              >
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    mono={!!columns.find((c) => c.id === cell.column.id)?.mono}
                    data-label={label(cell.column.id)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      {busy && <Loading layout="tw:sr-only">{m.loading}</Loading>}
      {!busy && !error && !rows.length && (
        <EmptyState
          variant="compact"
          title={filtered ? t.emptyFiltered : (emptyTitle ?? t.emptyTitle)}
          body={filtered ? t.emptyFilteredBody : undefined}
          action={filtered && onClear ? <Button size="compact" type="button" onClick={onClear}>{t.clear}</Button> : undefined}
        />
      )}
      {(pagination.pageIndex > 0 || next || rows.length > 10) && (
        <TablePagination data-admin="pagination">
          <Button
            size="compact"
            type="button"
            aria-disabled={busy || !pagination.pageIndex}
            onClick={() => {
              if (!busy && pagination.pageIndex) table.previousPage();
            }}
          >
            {m.previous}
          </Button>
          <span aria-live="polite">
            {fill(t.page, { n: pagination.pageIndex + 1 })}
            {busy ? " · " + m.loading : ""}
          </span>
          <Button
            size="compact"
            type="button"
            aria-disabled={busy || !next}
            onClick={() => {
              if (busy || !next) return;
              setCursors((old) => [...old.slice(0, pagination.pageIndex + 1), next!]);
              table.nextPage();
            }}
          >
            {m.next}
          </Button>
          <Field variant="numeric" density="compact" label={m.pageSize} layout="tw:ml-auto">
            {(association) => (
              <Select
                {...association}
                value={pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
              >
                {[10, 30, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </TablePagination>
      )}
    </section>
  );
}
