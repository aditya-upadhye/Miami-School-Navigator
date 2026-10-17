import { describe, expect, test } from "bun:test"
import { countChildren, isReleasedStatus, placesLeft, rowsOnDay, takenOf } from "@/lib/selectors"

const children = [
  { id: 1, parentId: "p1", status: "confirmed" },
  { id: 2, parentId: "p1", status: "Cancelled" },
  { id: 3, parentId: "p1", status: "no_show" },
  { id: 4, parentId: "p1", status: "waitlist" },
  { id: 5, parentId: "p1", status: "declined" },
  { id: 6, parentId: "p1", status: "attended" },
  { id: 7, parentId: "p2", status: "confirmed" },
]

describe("selectors", () => {
  test("countChildren counts the rows of a parent; notIn leaves statuses out", () => {
    expect(countChildren(children, "parentId", "p1")).toBe(6)
    expect(countChildren(children, "parentId", "p1", { notIn: ["cancelled", "No-Show"] })).toBe(4)
    expect(countChildren(children, "parentId", "p1", { notIn: "released" })).toBe(2)
    expect(countChildren(children, "parentId", "none")).toBe(0)
    expect(countChildren(undefined, "parentId", "p1")).toBe(0)
  })
  test("takenOf leaves out cancelled, declined, no-show and waitlist", () => {
    expect(takenOf(children, "parentId", "p1")).toBe(2)
    expect(takenOf(children, "parentId", "p2")).toBe(1)
    expect(["cancelled", "canceled", "Declined", "no-show", "NO_SHOW", "Wait list", "waitlisted"].every(isReleasedStatus)).toBe(true)
    expect(["confirmed", "attended", "pending", null].some(isReleasedStatus)).toBe(false)
    expect(takenOf([{ k: 1, state: "cancelled" }, { k: 1, state: "ok" }], "k", 1, "state")).toBe(1)
  })
  test("placesLeft clamps at 0 and is null for an unknown capacity", () => {
    expect(placesLeft(18, 6)).toBe(12)
    expect(placesLeft(5, 9)).toBe(0)
    expect(placesLeft(5, undefined)).toBe(5)
    expect(placesLeft("18", "6")).toBe(12)
    expect(placesLeft(null, 3)).toBeNull()
    expect(placesLeft(undefined, 3)).toBeNull()
    expect(placesLeft("lots", 3)).toBeNull()
  })
  test("rowsOnDay matches a date or a date-time on the day, nothing else", () => {
    const rows = [{ id: "a", at: "2026-10-14T18:00:00Z" }, { id: "b", at: "2026-10-14" }, { id: "c", at: "2026-10-15T00:00:00Z" }, { id: "d", at: null }, { id: "e" }]
    expect(rowsOnDay(rows, "at", "2026-10-14").map((r) => r.id)).toEqual(["a", "b"])
    expect(rowsOnDay(rows, "at", "2026-10-14T09:00:00Z").map((r) => r.id)).toEqual(["a", "b"])
    expect(rowsOnDay(rows, "at", "2026-10-16")).toEqual([])
    expect(rowsOnDay(rows, "at", undefined)).toEqual([])
  })
})
