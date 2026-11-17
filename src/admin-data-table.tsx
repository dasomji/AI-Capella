import { Button, Field, Input, Select, Table, TableWrap, TableHeader, TableCell, TableRow, TablePagination, EmptyState, Loading, Status, Workspace, type ButtonProps } from "./design-system/react";
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
  actionLayout,
}: {
  path: string;
  columns: AdminColumn[];
  language: Lang;
  filters?: Record<string, string>;
  search?: string;
  onOpen?: (row: AdminRow, opener: HTMLElement) => void;
  revision?: number;
  onZone?: (zone: string) => void;
  caption: string;
  actionLayout?: ButtonProps["layout"];
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
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
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
    manualPagination: true,
    pageCount: -1,
    enableSortingRemoval: false,
    enableMultiSort: false,
    state: { sorting, pagination },
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
        loadedPage.current = pageKey;
        setRows(r.items);
        setNext(r.nextCursor);
        onZone?.(r.timeZone);
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
  return (
    <Workspace as="section" part="region" data-admin="data-table" aria-label={caption} aria-busy={busy}>
      {externalSearch === undefined && (
        <Field variant="admin" label={d.search}>{association => <Input {...association}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />}</Field>
      )}
      {error && (
        <div>
          <Status variant="admin" role="alert">{error}</Status>
          <Button layout={actionLayout} variant="dense" type="button" onClick={() => setRetry((v) => v + 1)}>
            {m.retry}
          </Button>
        </div>
      )}
      <TableWrap variant="records" bounded data-admin="table-wrap" tabIndex={0}>
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
                        <Button layout={actionLayout} variant="dense-sort"
                          type="button"
                          aria-disabled={busy}
                          onClick={() => {
                            if (!busy) header.column.toggleSorting();
                          }}
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
                        </Button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
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
                tabIndex={onOpen ? 0 : undefined}
                onClick={onOpen ? event => onOpen(row.original,event.currentTarget) : undefined}
                onKeyDown={(e) => {
                  if (
                    onOpen &&
                    e.target === e.currentTarget &&
                    ["Enter", " "].includes(e.key)
                  ) {
                    e.preventDefault();
                    onOpen(row.original,e.currentTarget);
                  }
                }}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    data-label={
                      columns.find((c) => c.id === cell.column.id)?.label
                    }
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
      {!busy && !error && !rows.length && <EmptyState variant="admin-text" title={d.empty}/>}
      <TablePagination data-admin="pagination">
        <Button layout={actionLayout} variant="dense"
          type="button"
          aria-disabled={busy || !pagination.pageIndex}
          onClick={() => {
            if (!busy && pagination.pageIndex) table.previousPage();
          }}
        >
          {m.previous}
        </Button>
        <span aria-live="polite">
          {m.page} {pagination.pageIndex + 1}
          {busy ? " · " + m.loading : ""}
        </span>
        <Button layout={actionLayout} variant="dense"
          type="button"
          aria-disabled={busy || !next}
          onClick={() => {
            if (busy || !next) return;
            setCursors((old) => [
              ...old.slice(0, pagination.pageIndex + 1),
              next!,
            ]);
            table.nextPage();
          }}
        >
          {m.next}
        </Button>
        <Field variant="admin" label={m.pageSize} layout="tw:ml-auto">{association => <Select {...association}
            aria-label={m.pageSize}
            value={pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[10, 30, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>}</Field>
      </TablePagination>
    </Workspace>
  );
}
