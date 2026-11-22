import { bookingMoney } from "./money";
import { toDateStr } from "./utils";

export type ItemRow = {
  booking_id: string;
  price: number;
  start_at: string;
  bookings: { status: string; advance_amount: number | null; paid_amount: number | null };
};
export type DayStat = { day: string; done: number; upcoming: number; paidAhead: number; toCollect: number; bookings: number };

/** Group booking items into bookings and add each booking's sales to its appointment day. */
export function salesByDay(items: ItemRow[]) {
  const byBooking = new Map<string, { total: number; first: string; b: ItemRow["bookings"] }>();
  for (const it of items) {
    const cur = byBooking.get(it.booking_id) ?? { total: 0, first: it.start_at, b: it.bookings };
    cur.total += Number(it.price);
    if (it.start_at < cur.first) cur.first = it.start_at;
    byBooking.set(it.booking_id, cur);
  }
  const days = new Map<string, DayStat>();
  byBooking.forEach(({ total, first, b }) => {
    const m = bookingMoney(b, total);
    const day = toDateStr(new Date(first));
    const d = days.get(day) ?? { day, done: 0, upcoming: 0, paidAhead: 0, toCollect: 0, bookings: 0 };
    d.done += m.earned;
    d.upcoming += m.upcoming;
    if (m.upcoming > 0) {
      d.paidAhead += m.received;
      d.toCollect += m.due;
    }
    d.bookings += 1;
    days.set(day, d);
  });
  return days;
}


export type CashRow = {
  created_at: string;
  status: string;
  advance_amount: number | null;
  advance_method: string | null;
  paid_amount: number | null;
  payment_method: string | null;
  paid_at: string | null;
};

/** Money that physically came in between start and end: advances taken + payments at visits. */
export function cashReceived(rows: CashRow[], start: string, end: string) {
  const byMethod = new Map<string, number>();
  let total = 0;
  const add = (method: string | null, amount: number) => {
    total += amount;
    byMethod.set(method ?? "other", (byMethod.get(method ?? "other") ?? 0) + amount);
  };
  for (const r of rows) {
    const t = (iso: string) => new Date(iso).getTime();
    const inRange = (iso: string) => t(iso) >= t(start) && t(iso) < t(end);
    if (Number(r.advance_amount) > 0 && inRange(r.created_at)) add(r.advance_method, Number(r.advance_amount));
    if (r.paid_at && Number(r.paid_amount) > 0 && inRange(r.paid_at)) add(r.payment_method, Number(r.paid_amount));
  }
  return { total, byMethod };
}
