/**
 * Money rules for one booking (salon practice in Pakistan):
 * - The advance is never returned. It counts as received even if the client cancels or doesn't show.
 * - Due is only owed on open (booked) bookings. A cancelled booking's due is written off;
 *   a no-show can be moved to a new date, which makes it "booked" again.
 * - Sales are counted on the appointment day:
 *     done      → what the client actually paid (advance + payment at visit)
 *     cancelled / no-show → the kept advance
 *     booked    → the full total, shown as "upcoming" (not earned yet)
 */
export function bookingMoney(b: { status: string; advance_amount?: number | null; paid_amount?: number | null }, total: number) {
  const advance = Number(b.advance_amount || 0);
  const atVisit = Number(b.paid_amount || 0);
  const received = advance + atVisit;
  const due = b.status === "booked" ? Math.max(total - advance - atVisit, 0) : 0;
  const earned = b.status === "booked" ? 0 : received;
  const upcoming = b.status === "booked" ? total : 0;
  return { total, advance, atVisit, received, due, earned, upcoming };
}
