// Type-level fixture, typechecked by `tsc -b` (tsconfig.app.json includes src). Never imported at runtime.
// Pins that the `@/vendor/tanstack-react-table` shim keeps TData generic: `row.original.<field>` must be typed.
import type { ColumnDef } from "@tanstack/react-table"
import type { LegacyFeatures } from "@tanstack/react-table/legacy"
import { createColumnHelper, getCoreRowModel, useReactTable } from "@/vendor/tanstack-react-table"

type Row = { id: string; amount: number }

export function useRows(data: Row[]) {
  const helper = createColumnHelper<Row>()
  // Mixed typed accessors (number, string) plus a display column in ONE columns array: v8's ColumnDef<TData, any>[].
  const columns = [
    helper.accessor("amount", { header: "Amount", cell: (info) => info.getValue().toFixed(2) }),
    helper.accessor("id", { header: "Id", cell: (info) => info.getValue().toUpperCase() }),
    helper.display({ id: "actions", cell: (info) => info.row.original.id }),
  ]
  // Accessor typing: key and value are derived from Row (a function accessor sees `r: Row`).
  helper.accessor((r) => r.id.toUpperCase(), { id: "upper", cell: (info) => info.getValue().length })
  // @ts-expect-error nope is not a key of Row: createColumnHelper must keep the TData generic
  helper.accessor("nope", { header: "Nope" })

  const table = useReactTable<Row>({ data, columns, getCoreRowModel: getCoreRowModel() })

  const amount: number | undefined = table.getRowModel().rows[0]?.original.amount
  // @ts-expect-error nope is not a key of Row: row.original must stay typed as Row
  const nope = table.getRowModel().rows[0]?.original.nope
  // v8 aliases are typed (same as getPaginatedRowModel / getPrePaginatedRowModel).
  const paged: number = table.getPaginationRowModel().rows.length
  const pre: number = table.getPrePaginationRowModel().rows.length

  // TData inferred from `data`, no explicit <Row>.
  const inferred = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })
  const inferredAmount: number | undefined = inferred.getRowModel().rows[0]?.original.amount

  // Columns of a DIFFERENT row type must be rejected.
  type Other = { sku: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture: v8 canonical ColumnDef<TData, any>
  const otherColumns: ColumnDef<LegacyFeatures, Other, any>[] = []
  // @ts-expect-error columns for Other are not columns for Row
  useReactTable<Row>({ data, columns: otherColumns, getCoreRowModel: getCoreRowModel() })

  // ColumnMeta augmentation (src/types/tanstack-table-meta.d.ts): numeric / hiddenMaxMd compile, unknown keys do not.
  const metaColumns = [
    helper.accessor("amount", { header: "Amount", meta: { numeric: true, hiddenMaxMd: true } }),
    // @ts-expect-error unknownKey is not part of the ColumnMeta augmentation
    helper.accessor("id", { header: "Id", meta: { unknownKey: true } }),
  ]
  const numeric: boolean | undefined = metaColumns[0]?.meta?.numeric
  const hidden: boolean | undefined = metaColumns[0]?.meta?.hiddenMaxMd
  // @ts-expect-error unknownKey is not a ColumnMeta key
  const unknownMeta = metaColumns[0]?.meta?.unknownKey

  return { numeric, hidden, unknownMeta, amount, nope, paged, pre, inferredAmount }
}
