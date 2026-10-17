import type { BookingsVM } from "@/application/view-models/bookings.vm";

export function BookingsView(props: BookingsVM) {
  return <ul>{props.bookings.map((b) => <li key={b.id}>{b.status}</li>)}</ul>;
}
