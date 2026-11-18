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
import { adminTableParams, clampedPageIndex } from "./admin-table-query";
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
  /** Lower-priority column: shown from the panel breakpoint up, always on the detail page. */
  wide?: boolean;
  cell?: (row: AdminRow) => ReactNode;
};
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
});
const interactive = "a,button,input,select,textarea,label,summary,[role=button]";
/**
 * Lists and detail members fetch one debounced server page at a time.
 * Cursors remain scoped to the complete filter/sort/limit query.
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
  const sort = sorting[0],
    sortKey = sort ? columns.find((c) => c.id === sort.id)?.sort : undefined;
  const signature = JSON.stringify([path, filterKey, search, sortKey, sort?.desc, pagination.pageSize]);
  const [queryScope, setQueryScope] = useState(signature);
  const changed = queryScope !== signature;
  const pageIndex = clampedPageIndex(changed ? 0 : pagination.pageIndex, changed ? 1 : cursors.length);
  // Reset before React commits: no old cursor, page label or empty-state frame for a new query.
  if (changed) {
    setQueryScope(signature);
    setPagination(p => ({ ...p, pageIndex: 0 }));
    setCursors([undefined]);
    setNext(null);
    setRows([]);
    setBusy(true);
    setError("");
  }
  const pageKey = JSON.stringify([signature, pageIndex]);
  const loadedPage = useRef<string | null>(null);
  const loading = busy || (!error && loadedPage.current !== pageKey);
  const hasNext = !!next;
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
    state: { sorting, pagination: { ...pagination, pageIndex } },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });
  useEffect(() => {
    setBusy(true);
    setError("");
    // Retain current rows while refreshing; a different query/page is marked loading in render.
    const refresh = loadedPage.current === pageKey;
    const current = ++generation.current;
    const timer = setTimeout(async () => {
      try {
        const params = adminTableParams({
          filters, search, pageSize: pagination.pageSize, sort: sortKey,
          descending: sort?.desc, cursor: cursors[pageIndex],
        });
        const r = await adminRequest(path + (path.includes("?") ? "&" : "?") + params);
        if (current !== generation.current) return;
        // A deletion can exhaust the final cursor page. Retreat before showing an empty state.
        if (!r.items.length && pageIndex > 0) {
          setCursors(old => old.slice(0, pageIndex));
          setPagination(p => ({ ...p, pageIndex: clampedPageIndex(pageIndex, pageIndex) }));
          return;
        }
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
  }, [signature, pageIndex, revision, retry]);
  const label = (id: string) => columns.find((c) => c.id === id)?.label ?? "";
  return (
    <section data-admin={dataAdmin} aria-label={caption} aria-busy={loading}>
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
                      layout={columns.find((c) => c.id === header.column.id)?.wide ? "tw:max-panel:hidden" : undefined}
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
                        <button
                          type="button"
                          className={ui.sort}
                          aria-disabled={loading}
                          onClick={() => {
                            if (!loading) header.column.toggleSorting();
                          }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span aria-hidden="true">{sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : ""}</span>
                        </button>
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
                    layout={columns.find((c) => c.id === cell.column.id)?.wide ? "tw:max-panel:hidden" : undefined}
                    data-label={label(cell.column.id)}
                  >
                    <span>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      {loading && <Loading layout="tw:sr-only">{m.loading}</Loading>}
      {!loading && !error && !rows.length && (
        <EmptyState
          variant="compact"
          title={filtered ? t.emptyFiltered : (emptyTitle ?? t.emptyTitle)}
          body={filtered ? t.emptyFilteredBody : undefined}
          action={filtered && onClear ? <Button size="compact" type="button" onClick={onClear}>{t.clear}</Button> : undefined}
        />
      )}
      {(pageIndex > 0 || hasNext || rows.length > 0) && (
        <TablePagination data-admin="pagination">
          <Button
            size="compact"
            type="button"
            aria-disabled={loading || !pageIndex}
            onClick={() => {
              if (!loading && pageIndex) table.previousPage();
            }}
          >
            {m.previous}
          </Button>
          <span aria-live="polite">
            {fill(t.page, { n: pageIndex + 1 })}
            {loading ? " · " + m.loading : ""}
          </span>
          <Button
            size="compact"
            type="button"
            aria-disabled={loading || !hasNext}
            onClick={() => {
              if (loading || !hasNext) return;
              setCursors((old) => [...old.slice(0, pageIndex + 1), next!]);
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
