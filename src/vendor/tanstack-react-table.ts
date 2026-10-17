// @tanstack/react-table as authored code sees it: the v9 package, plus the v8 names the prompts teach
// (useReactTable, the get*RowModel factories, createColumnHelper) from v9's own compatibility layer
// (`@tanstack/react-table/legacy`). An explicit export shadows the `export *` of the same name.
import type { ColumnDef, RowData } from "@tanstack/react-table"
import { useLegacyTable, type LegacyFeatures, type LegacyReactTable, type LegacyTableOptions } from "@tanstack/react-table/legacy"

export * from "@tanstack/react-table"
export {
  legacyCreateColumnHelper as createColumnHelper,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
} from "@tanstack/react-table/legacy"

// Table methods v9 renamed and its legacy layer does not alias (measured on authored screens).
const V8_METHODS = { getPrePaginationRowModel: "getPrePaginatedRowModel", getPaginationRowModel: "getPaginatedRowModel" } as const

type AnyFn = (...args: unknown[]) => unknown

// Generic on purpose: a non-generic wrapper erases TData to RowData and `row.original.<field>` fails tsc.
// `columns` is widened to v8's canonical ColumnDef<TData, any>[]: the v9 legacy layer types it as ColumnDef<..., unknown>[],
// which rejects typed accessor columns (TS2322). Assignable to the upstream option without a cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- v8 canonical ColumnDef<TData, any>; v9 legacy layer types it as unknown, which rejects typed accessors (TS2322)
type AnyValueColumns<TData extends RowData> = ReadonlyArray<ColumnDef<LegacyFeatures, TData, any>>
type ReactTableOptions<TData extends RowData> = Omit<LegacyTableOptions<TData>, "columns"> & { columns: AnyValueColumns<TData> }

// Plain function (not a hook) so the React-compiler lint does not read the alias as mutating a hook's return value.
function aliasV8Methods<T extends object, A>(table: T): T & A {
  const t = table as unknown as Record<string, unknown>
  for (const [v8, v9] of Object.entries(V8_METHODS)) {
    if (typeof t[v8] !== "function" && typeof t[v9] === "function") t[v8] = (...a: unknown[]) => (t[v9] as AnyFn)(...a)
  }
  return table as T & A
}

// The v8 names aliased at runtime by aliasV8Methods, typed exactly as the v9 methods they forward to.
type V8Aliases<TData extends RowData> = {
  getPaginationRowModel: LegacyReactTable<TData>["getPaginatedRowModel"]
  getPrePaginationRowModel: LegacyReactTable<TData>["getPrePaginatedRowModel"]
}

export function useReactTable<TData extends RowData>(options: ReactTableOptions<TData>): ReturnType<typeof useLegacyTable<TData>> & V8Aliases<TData> {
  return aliasV8Methods<ReturnType<typeof useLegacyTable<TData>>, V8Aliases<TData>>(useLegacyTable<TData>(options))
}
