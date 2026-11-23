"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSalon } from "@/components/salon-context";
import { supabase } from "@/lib/supabase/client";
import { bookingMoney } from "@/lib/money";
import { cashReceived, salesByDay, type CashRow, type DayStat, type ItemRow } from "@/lib/sales";


import { Card, Input, Loading, PageHeader } from "@/components/ui";
import { PAYMENT_METHODS } from "@/lib/types";
import { addDays, cn, dateKey, dayRange, daysInMonth, fmtDate, monthRange, rs, toDateStr } from "@/lib/utils";
import { fetchAll } from "@/lib/fetch-all";

// Chart colours (validated): done = deep peach, upcoming = light peach + stripes
const DONE = "#A65D42";
const UPCOMING = "#E59A78";

export default function SalesPage() {
  const { branchId } = useSalon();
  const [date, setDate] = useState(toDateStr());
  const [month, setMonth] = useState<Map<string, DayStat> | null>(null);
  const [lastMonth, setLastMonth] = useState<Map<string, DayStat>>(new Map());
  const [cash, setCash] = useState<CashRow[]>([]);
  const [totalDue, setTotalDue] = useState({ amount: 0, count: 0 });
  const [hover, setHover] = useState<string | null>(null);

  const monthKey = date.slice(0, 7);

  // Month sales (by appointment day) + last month for comparison
  useEffect(() => {
    let stale = false;
    setMonth(null);
    const sb = supabase();
    const [y, m] = date.split("-").map(Number);
    const cur = monthRange(date);
    const last = monthRange(dateKey(y, m - 1, 1));
    const cols = "booking_id, price, start_at, bookings!inner(status, advance_amount, paid_amount)";
    const range = (r: { start: string; end: string }) =>
      fetchAll<ItemRow>((from, to) => sb.from("booking_items").select(cols).eq("branch_id", branchId).gte("start_at", r.start).lt("start_at", r.end).order("id").range(from, to));
    (async () => {
      const [a, b] = await Promise.all([range(cur), range(last)]);
      if (stale) return;
      setMonth(salesByDay(a));
      setLastMonth(salesByDay(b));
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, branchId]);

  // Cash that came in on the chosen day (advances + payments at visit)
  useEffect(() => {
    let stale = false;
    const { start, end } = dayRange(date);
    fetchAll<CashRow>((from, to) =>
      supabase()
        .from("bookings")
        .select("id, created_at, status, advance_amount, advance_method, paid_amount, payment_method, paid_at")
        .eq("branch_id", branchId)
        .or(`and(created_at.gte."${start}",created_at.lt."${end}"),and(paid_at.gte."${start}",paid_at.lt."${end}")`)
        .order("id")
        .range(from, to)
    ).then((rows) => {
      if (!stale) setCash(rows);
    });
    return () => {
      stale = true;
    };
  }, [date, branchId]);

  // Everything still owed on open bookings (any date)
  useEffect(() => {
    fetchAll<{ status: string; advance_amount: number; paid_amount: number; booking_items: { price: number }[] }>((from, to) =>
      supabase().from("bookings").select("id, status, advance_amount, paid_amount, booking_items(price)").eq("branch_id", branchId).eq("status", "booked").order("id").range(from, to)
    ).then((data) => {
        let amount = 0;
        let count = 0;
        for (const b of data) {
          const due = bookingMoney(b, b.booking_items.reduce((a, i) => a + Number(i.price), 0)).due;
          if (due > 0) {
            amount += due;
            count += 1;
          }
        }
        setTotalDue({ amount, count });
      });
  }, [branchId, month]);

  const { start: dayStart, end: dayEnd } = dayRange(date);
  const cashIn = useMemo(() => cashReceived(cash, dayStart, dayEnd), [cash, dayStart, dayEnd]);

  // Build every day of the month for the chart
  const [selY, selM] = date.split("-").map(Number);
  const allDays: DayStat[] = Array.from({ length: daysInMonth(date) }, (_, i) => {
    const key = dateKey(selY, selM, i + 1);
    return month?.get(key) ?? { day: key, done: 0, upcoming: 0, paidAhead: 0, toCollect: 0, bookings: 0 };
  });
  const monthDone = allDays.reduce((a, d) => a + d.done, 0);
  const monthUpcoming = allDays.reduce((a, d) => a + d.upcoming, 0);
  const monthPaidAhead = allDays.reduce((a, d) => a + d.paidAhead, 0);
  const monthToCollect = allDays.reduce((a, d) => a + d.toCollect, 0);
  const selected = allDays.find((d) => d.day === date) ?? { day: date, done: 0, upcoming: 0, paidAhead: 0, toCollect: 0, bookings: 0 };
  const maxVal = Math.max(...allDays.map((d) => d.done + d.upcoming), 1);
  const today = toDateStr();
  // Fair comparison: this month so far vs the same days of last month (whole months when looking back)
  const isCurrentMonth = today.slice(0, 7) === monthKey;
  const cutDay = isCurrentMonth ? Number(today.slice(8, 10)) : 31;
  const doneUpTo = (map: Map<string, DayStat>) => {
    let sum = 0;
    map.forEach((v) => {
      if (Number(v.day.slice(8, 10)) <= cutDay) sum += v.done;
    });
    return sum;
  };
  const thisCompare = month ? doneUpTo(month) : 0;
  const lastCompare = doneUpTo(lastMonth);
  const change = lastCompare ? Math.round(((thisCompare - lastCompare) / lastCompare) * 100) : null;
  const isToday = date === today;
  const monthName = fmtDate(date, { month: "long" });
  const shown = hover ? allDays.find((d) => d.day === hover) : null;

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle="Sales are counted on the appointment day. Kept advances from cancellations and no-shows count too."
        action={
          <div className="flex items-center gap-1.5">
            <button onClick={() => setDate(addDays(date, -1))} className="rounded-xl border border-line bg-white p-2.5 hover:border-peach-300 cursor-pointer" aria-label="Previous day">
              <ChevronLeft className="size-4" />
            </button>
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 w-auto text-sm" />
            <button onClick={() => setDate(addDays(date, 1))} className="rounded-xl border border-line bg-white p-2.5 hover:border-peach-300 cursor-pointer" aria-label="Next day">
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />

      {month === null ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-to-br from-peach-100 to-white p-5">
              <p className="text-sm text-muted">Sales {isToday ? "today" : fmtDate(date, { day: "numeric", month: "short" })}</p>
              <p className="mt-1 text-3xl font-semibold">{rs(selected.done)}</p>
              <p className="mt-1 text-xs text-muted">{selected.upcoming > 0
                  ? `+ ${rs(selected.upcoming)} upcoming${selected.paidAhead ? ` (${rs(selected.paidAhead)} advance paid)` : ""}`
                  : `${selected.bookings} ${selected.bookings === 1 ? "booking" : "bookings"}`}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted">Cash received {isToday ? "today" : "this day"}</p>
              <p className="mt-1 whitespace-nowrap text-2xl font-semibold">{rs(cashIn.total)}</p>
              <p className="mt-1 truncate text-xs text-muted">
                {cashIn.total
                  ? Array.from(cashIn.byMethod.entries())
                      .map(([m, v]) => `${PAYMENT_METHODS.find((x) => x.id === m)?.label ?? m} ${rs(v)}`)
                      .join(" · ")
                  : "Advances and payments at visits"}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted">Total due</p>
              <p className={cn("mt-1 whitespace-nowrap text-2xl font-semibold", totalDue.amount > 0 && "text-peach-600")}>{rs(totalDue.amount)}</p>
              <p className="mt-1 text-xs text-muted">
                From {totalDue.count} open {totalDue.count === 1 ? "booking" : "bookings"}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted">{monthName} sales</p>
              <p className="mt-1 whitespace-nowrap text-2xl font-semibold">{rs(monthDone)}</p>
              <p className="mt-1 text-xs text-muted">
                {change !== null && <span className={change >= 0 ? "text-emerald-700" : "text-red-600"}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs {isCurrentMonth ? "same days last month" : "last month"} · </span>}
                {monthUpcoming > 0 ? `done · ${rs(monthUpcoming)} upcoming` : "done so far"}
              </p>
              {monthUpcoming > 0 && (
                <p className="mt-0.5 text-xs text-muted">
                  {rs(monthPaidAhead)} advance paid · {rs(monthToCollect)} to collect
                </p>
              )}
            </Card>
          </div>

          {/* Daily chart */}
          <Card className="mt-4 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Daily sales · {monthName}</h2>
                <p className="text-xs text-muted">Tap a day to see its numbers above.</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm" style={{ background: DONE }} /> Done
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm" style={{ background: UPCOMING }} /> Upcoming · advance paid
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm" style={{ background: `repeating-linear-gradient(45deg, ${UPCOMING} 0 3px, #fff 3px 5px)`, border: `1px solid ${UPCOMING}` }} /> Upcoming · to collect
                </span>
              </div>
            </div>

            <div className="relative">
              {shown && (
                <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-md">
                  <p className="font-medium text-ink">{fmtDate(shown.day, { weekday: "short", day: "numeric", month: "short" })}</p>
                  <p className="text-muted">
                    Done <span className="font-medium text-ink">{rs(shown.done)}</span>
                    {shown.upcoming > 0 && (
                      <>
                        {" "}
                        · Upcoming <span className="font-medium text-ink">{rs(shown.upcoming)}</span>
                      </>
                    )}
                  </p>
                  {shown.upcoming > 0 && (
                    <p className="text-muted">
                      Advance paid <span className="font-medium text-ink">{rs(shown.paidAhead)}</span> · To collect <span className="font-medium text-ink">{rs(shown.toCollect)}</span>
                    </p>
                  )}
                  <p className="text-muted">
                    {shown.bookings} {shown.bookings === 1 ? "booking" : "bookings"}
                  </p>
                </div>
              )}
              <div className="flex h-44 items-end gap-[2px] border-b border-line" onMouseLeave={() => setHover(null)}>
                {allDays.map((d) => {
                  const doneH = (d.done / maxVal) * 100;
                  const upH = (d.upcoming / maxVal) * 100;
                  const aheadH = (Math.min(d.paidAhead, d.upcoming) / maxVal) * 100;
                  const collectH = Math.max(upH - aheadH, 0);
                  const isSel = d.day === date;
                  return (
                    <button
                      key={d.day}
                      onClick={() => setDate(d.day)}
                      onMouseEnter={() => setHover(d.day)}
                      onFocus={() => setHover(d.day)}
                      className={cn("group flex h-full flex-1 flex-col items-center justify-end gap-[2px] rounded-t-md cursor-pointer", isSel ? "bg-peach-50" : "hover:bg-peach-50/60")}
                      aria-label={`${fmtDate(d.day, { day: "numeric", month: "short" })}: done ${rs(d.done)}, upcoming ${rs(d.upcoming)}, advance paid ${rs(d.paidAhead)}`}
                    >
                      {collectH > 0 && (
                        <span
                          className="w-[70%] max-w-6 rounded-t-[4px]"
                          style={{ height: `${collectH}%`, background: `repeating-linear-gradient(45deg, ${UPCOMING} 0 3px, #fff 3px 5px)`, border: `1px solid ${UPCOMING}` }}
                        />
                      )}
                      {aheadH > 0 && (
                        <span
                          className={cn("w-[70%] max-w-6", collectH > 0 ? "" : "rounded-t-[4px]")}
                          style={{ height: `${aheadH}%`, background: UPCOMING }}
                        />
                      )}
                      {doneH > 0 && <span className={cn("w-[70%] max-w-6", upH > 0 ? "" : "rounded-t-[4px]")} style={{ height: `${doneH}%`, background: DONE }} />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-[2px]">
                {allDays.map((d, i) => {
                  const n = i + 1;
                  const show = n === 1 || n % 5 === 0 || d.day === date;
                  return (
                    <span key={d.day} className={cn("flex-1 text-center text-[10px]", d.day === date ? "font-semibold text-ink" : d.day === today ? "text-peach-600" : "text-muted")}>
                      {show ? n : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Day-by-day table */}
          <Card className="mt-4 overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-semibold">Day by day</h2>
            </div>
            {allDays.filter((d) => d.bookings > 0).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No bookings in {monthName} yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-4 py-2 font-normal">Day</th>
                    <th className="px-4 py-2 text-right font-normal">Bookings</th>
                    <th className="px-4 py-2 text-right font-normal">Done</th>
                    <th className="px-4 py-2 text-right font-normal">Upcoming</th>
                    <th className="px-4 py-2 text-right font-normal">Advance paid</th>
                    <th className="px-4 py-2 text-right font-normal">To collect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {allDays
                    .filter((d) => d.bookings > 0)
                    .map((d) => (
                      <tr key={d.day} onClick={() => setDate(d.day)} className={cn("cursor-pointer hover:bg-peach-50/50", d.day === date && "bg-peach-50")}>
                        <td className="px-4 py-2.5">{fmtDate(d.day, { weekday: "short", day: "numeric", month: "short" })}</td>
                        <td className="px-4 py-2.5 text-right">{d.bookings}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{rs(d.done)}</td>
                        <td className="px-4 py-2.5 text-right text-muted">{d.upcoming ? rs(d.upcoming) : "–"}</td>
                        <td className="px-4 py-2.5 text-right text-muted">{d.paidAhead ? rs(d.paidAhead) : "–"}</td>
                        <td className={cn("px-4 py-2.5 text-right", d.toCollect ? "text-peach-600" : "text-muted")}>{d.toCollect ? rs(d.toCollect) : "–"}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-semibold">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right">{allDays.reduce((a, d) => a + d.bookings, 0)}</td>
                    <td className="px-4 py-2.5 text-right">{rs(monthDone)}</td>
                    <td className="px-4 py-2.5 text-right">{monthUpcoming ? rs(monthUpcoming) : "–"}</td>
                    <td className="px-4 py-2.5 text-right">{monthPaidAhead ? rs(monthPaidAhead) : "–"}</td>
                    <td className="px-4 py-2.5 text-right">{monthToCollect ? rs(monthToCollect) : "–"}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
