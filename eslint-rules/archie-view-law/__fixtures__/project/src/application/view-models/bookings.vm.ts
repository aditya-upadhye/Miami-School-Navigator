import type { Booking, Guest } from "@/domain/entities/booking";

/** A VM-local type: NOT a domain entity, so arrays of it may be derived over. */
export interface Row {
  label: string;
}

export interface BookingsVM {
  bookings: readonly Booking[];
  list: Booking[];
  ro: ReadonlyArray<Booking>;
  maybe: Booking[] | null;
  guests: Guest[];
  wrapped: readonly Readonly<Booking>[];
  picked: Pick<Booking, "id">[];
  names: string[];
  rows: Row[];
  total: number;
}
