// Module augmentation for TanStack Table v9: the two `columnDef.meta` keys prototype tables use.
// Signature matches `ColumnMeta` in @tanstack/table-core (ColumnDef.d.ts): three type parameters,
// `in out` variance on the first two. TypeScript requires an augmenting interface to repeat the
// declaration's type parameters (names, constraints, variance modifiers and defaults) exactly.
// Included by tsconfig.app.json (`include: ["src"]`), and shipped with the template `src/`.
import type { CellData, RowData, TableFeatures } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- parameters must mirror the augmented declaration to merge
  interface ColumnMeta<in out TFeatures extends TableFeatures, in out TData extends RowData, TValue extends CellData = CellData> {
    /** Right-align and tabular-figure this column. */
    numeric?: boolean
    /** Hide this column below the `md` breakpoint. */
    hiddenMaxMd?: boolean
  }
}
