// ARCH-3098 · selectors over the rows of a view: the ONE way a figure that more than one screen shows (a record's children, the places taken or left, what falls on a day) is derived,
// so every screen prints the same number from the same rows. Pure and deterministic (no clock, no I/O): a view passes the rows and the day it was given.
//
// "Released" statuses hold no place: a child row that was cancelled, declined, a no-show or on the waitlist does not count as taken.

type Row = Record<string, unknown>

const key = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
const RELEASED = ["cancelled", "canceled", "declined", "noshow", "waitlist", "waitlisted"]

/** True for a status that holds no place: cancelled, declined, no-show, waitlist (spelling and case are ignored). */
export function isReleasedStatus(status: unknown): boolean {
  return RELEASED.includes(key(status))
}

export interface CountChildrenOptions {
  /** Statuses to leave out: "released" (see `isReleasedStatus`) or a list of status values. */
  notIn?: "released" | readonly string[]
  /** The field that holds the status (default "status"). */
  statusField?: string
}

/** The rows whose `parentKey` field equals `parentId`: `countChildren(children, "<parent>Id", parent.id)`. */
export function countChildren(rows: readonly Row[] | null | undefined, parentKey: string, parentId: unknown, opts?: CountChildrenOptions): number {
  const field = opts?.statusField ?? "status"
  const out = opts?.notIn
  const skip: ((s: unknown) => boolean) | null = out === "released" ? isReleasedStatus : Array.isArray(out) ? (s) => (out as readonly string[]).map(key).includes(key(s)) : null
  return (rows ?? []).filter((r) => r != null && r[parentKey] === parentId && !(skip && skip(r[field]))).length
}

/** The children that hold a place: `countChildren` without the released statuses. */
export function takenOf(rows: readonly Row[] | null | undefined, parentKey: string, parentId: unknown, statusField?: string): number {
  return countChildren(rows, parentKey, parentId, { notIn: "released", statusField })
}

/** Places left: capacity minus taken, never below 0; null when the capacity is not a number (print nothing, never an invented figure). */
export function placesLeft(capacity: unknown, taken: unknown): number | null {
  const c = Number(capacity)
  if (capacity === null || capacity === undefined || capacity === "" || !Number.isFinite(c)) return null
  const t = Number(taken)
  return Math.max(0, c - (Number.isFinite(t) ? t : 0))
}

/** The rows whose `dateKey` field (a date or a date-time string) falls on `day` ("YYYY-MM-DD", or a date-time whose day is used). An empty result is the only basis of "nothing on this day". */
export function rowsOnDay<T extends Row>(rows: readonly T[] | null | undefined, dateKey: string, day: unknown): T[] {
  const d = String(day ?? "").slice(0, 10)
  return (rows ?? []).filter((r) => r != null && typeof r[dateKey] === "string" && (r[dateKey] as string).slice(0, 10) === d)
}
