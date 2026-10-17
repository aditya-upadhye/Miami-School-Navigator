import { describe, expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { createColumnHelper, getCoreRowModel, getPaginationRowModel, useReactTable } from "@/vendor/tanstack-react-table"

// The shim aliases the v8 names v9's legacy layer does not provide (measured on authored screens):
// getPaginationRowModel -> getPaginatedRowModel, getPrePaginationRowModel -> getPrePaginatedRowModel.
type Row = { id: string; amount: number }
const data: Row[] = [{ id: "a", amount: 1 }, { id: "b", amount: 2 }]
const helper = createColumnHelper<Row>()
const columns = [helper.accessor("amount", { header: "Amount" }), helper.accessor("id", { header: "Id" })]

describe("useReactTable v8 aliases", () => {
  test("getPaginationRowModel / getPrePaginationRowModel exist and honour pageSize", () => {
    const seen: { kinds: string[]; paged: number; pre: number } = { kinds: [], paged: -1, pre: -1 }
    function Probe() {
      const table = useReactTable<Row>({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageIndex: 0, pageSize: 1 } },
      })
      seen.kinds = [typeof table.getPaginationRowModel, typeof table.getPrePaginationRowModel]
      seen.paged = table.getPaginationRowModel().rows.length
      seen.pre = table.getPrePaginationRowModel().rows.length
      return <div>{table.getRowModel().rows.length}</div>
    }
    renderToString(<Probe />)
    expect(seen.kinds).toEqual(["function", "function"])
    expect(seen.paged).toBe(1)
    expect(seen.pre).toBe(2)
  })
})
