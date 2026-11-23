"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageCircle, Plus } from "lucide-react";
import { useSalon } from "@/components/salon-context";
import { useCatalog } from "@/lib/catalog";
import { supabase } from "@/lib/supabase/client";
import { useQueryParam } from "@/lib/use-query";
import { STATUS } from "@/lib/status";
import { isOwnerLevel } from "@/lib/staffing";
import { Badge, Card, Empty, Input, Loading, Select } from "@/components/ui";
import { addDays, cn, dayRange, fmtDate, fmtTime, pkParts, rs, toDateStr } from "@/lib/utils";
import { bookingMoney } from "@/lib/money";

type Row = {
  id: string;
  booking_id: string;
  service_id: string | null;
  staff_id: string | null;
  level_id: string | null;
  booked_for: string | null;
  label: string;
  start_at: string;
  duration_min: number;
  price: number;
  bookings: { id: string; status: string; is_walk_in: boolean; confirmation_sent_at: string | null; advance_amount: number | null; paid_amount: number | null; clients: { name: string } | null };
  staff: { name: string } | null;
  staff_levels: { name: string } | null;
};

const START_H = 8;
const END_H = 23;
const HOUR = 64;

export default function CalendarPage() {
  const { branchId } = useSalon();
  const cat = useCatalog(branchId);
  const dateParam = useQueryParam("date");
  const [date, setDate] = useState(toDateStr());
  const [view, setView] = useState<"staff" | "list">("staff");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (dateParam) setDate(dateParam);
  }, [dateParam]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setRows(null);
    const { start, end } = dayRange(date);
    supabase()
      .from("booking_items")
      .select("*, bookings!inner(id, status, is_walk_in, confirmation_sent_at, advance_amount, paid_amount, clients(name)), staff(name), staff_levels(name)")
      .eq("branch_id", branchId)
      .gte("start_at", start)
      .lt("start_at", end)
      .order("start_at")
      .then(({ data }) => setRows((data ?? []) as unknown as Row[]));
  }, [date, branchId]);

  const active = useMemo(() => (rows ?? []).filter((r) => r.bookings.status !== "cancelled"), [rows]);
  const bookingCount = new Set(active.map((r) => r.booking_id)).size;
  // Same rules as the Sales page: done = what was paid, cancelled/no-show = kept advance, open = full total
  const expected = useMemo(() => {
    const byBooking = new Map<string, { total: number; b: Row["bookings"] }>();
    for (const r of rows ?? []) {
      const cur = byBooking.get(r.booking_id) ?? { total: 0, b: r.bookings };
      cur.total += Number(r.price);
      byBooking.set(r.booking_id, cur);
    }
    let sum = 0;
    byBooking.forEach(({ total, b }) => {
      const m = bookingMoney(b, total);
      sum += m.earned + m.upcoming;
    });
    return sum;
  }, [rows]);

  const filtered = useMemo(() => {
    if (!categoryFilter) return rows ?? [];
    const ids = new Set(cat.services.filter((s) => s.category_id === categoryFilter).map((s) => s.id));
    return (rows ?? []).filter((r) => r.service_id && ids.has(r.service_id));
  }, [rows, categoryFilter, cat.services]);

  // Columns for the staff view: owners by name, every other level as one column
  const columns = useMemo(() => {
    const cols: { key: string; title: string; sub?: string; match: (r: Row) => boolean }[] = [];
    for (const lvl of cat.levels) {
      const people = cat.staff.filter((s) => s.level_id === lvl.id);
      const active = people.filter((s) => s.active);
      if (isOwnerLevel(lvl) && active.length) {
        for (const p of active) cols.push({ key: p.id, title: p.name, sub: lvl.name, match: (r) => r.staff_id === p.id || (!r.staff_id && r.level_id === lvl.id && active.length === 1) });
        if (active.length > 1 && (rows ?? []).some((r) => !r.staff_id && r.level_id === lvl.id))
          cols.push({ key: `lvl-${lvl.id}`, title: lvl.name, match: (r) => !r.staff_id && r.level_id === lvl.id });
        continue;
      }
      const ids = new Set(people.map((p) => p.id));
      const cap = active.length || lvl.headcount || 0;
      const hasRows = (rows ?? []).some((r) => r.level_id === lvl.id || (r.staff_id && ids.has(r.staff_id)));
      if (cap > 0 || hasRows) {
        cols.push({
          key: `lvl-${lvl.id}`,
          title: lvl.name,
          sub: cap ? `${cap} staff` : undefined,
          match: (r) => r.level_id === lvl.id || (!!r.staff_id && ids.has(r.staff_id)),
        });
      }
    }
    if ((rows ?? []).some((r) => !r.staff_id && !r.level_id)) cols.push({ key: "none", title: "Not set", match: (r) => !r.staff_id && !r.level_id });
    return cols;
  }, [cat.levels, cat.staff, rows]);

  const isToday = date === toDateStr();
  const nowP = pkParts(now);
  const nowTop = ((nowP.h * 60 + nowP.min - START_H * 60) / 60) * HOUR;

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{isToday ? "Today" : fmtDate(date, { weekday: "long" })}</h1>
          <p className="text-sm text-muted">{fmtDate(date, { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setDate(addDays(date, -1))} className="rounded-xl border border-line bg-white p-2.5 hover:border-peach-300 cursor-pointer" aria-label="Previous day">
            <ChevronLeft className="size-4" />
          </button>
          {!isToday && (
            <button onClick={() => setDate(toDateStr())} className="h-10 rounded-xl border border-line bg-white px-3 text-sm hover:border-peach-300 cursor-pointer">
              Today
            </button>
          )}
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 w-auto text-sm" />
          <button onClick={() => setDate(addDays(date, 1))} className="rounded-xl border border-line bg-white p-2.5 hover:border-peach-300 cursor-pointer" aria-label="Next day">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted">Bookings</p>
          <p className="mt-1 whitespace-nowrap text-xl font-semibold sm:text-2xl">{bookingCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">Sales this day</p>
          <p className="mt-1 whitespace-nowrap text-xl font-semibold sm:text-2xl">{rs(expected)}</p>
        </Card>
        <Link href={`/bookings/new?date=${date}`} className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-peach-300 p-4 font-medium hover:bg-peach-400 sm:col-span-1">
          <Plus className="size-5" /> New booking
        </Link>
      </div>

      {/* View switch */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-white p-1">
          {(
            [
              ["staff", "By staff"],
              ["list", "List"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} className={cn("rounded-lg px-4 py-1.5 text-sm cursor-pointer", view === v ? "bg-peach-100 font-medium" : "text-muted")}>
              {label}
            </button>
          ))}
        </div>
        {view === "list" && cat.categories.length > 0 && (
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 w-auto text-sm">
            <option value="">All services</option>
            {cat.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {rows === null || cat.loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty
          title="No bookings for this day"
          text="Tap New booking to add one."
          action={
            <Link href={`/bookings/new?date=${date}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-peach-300 px-4 font-medium hover:bg-peach-400">
              <Plus className="size-4" /> New booking
            </Link>
          }
        />
      ) : view === "list" ? (
        <div className="space-y-2">
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted">No bookings for this service.</p>}
          {filtered.map((r) => (
            <ListRow key={r.id} r={r} />
          ))}
        </div>
      ) : columns.length === 0 ? (
        <div className="space-y-2">
          {rows.map((r) => (
            <ListRow key={r.id} r={r} />
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <div className="flex min-w-full">
            {/* Time gutter */}
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-line bg-white">
              <div className="h-12 border-b border-line" />
              <div className="relative" style={{ height: (END_H - START_H) * HOUR }}>
                {Array.from({ length: END_H - START_H }, (_, i) => (
                  <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: i * HOUR }}>
                    {i === 0 ? "" : fmtTime(`${String(START_H + i).padStart(2, "0")}:00`).replace(":00", "")}
                  </span>
                ))}
              </div>
            </div>
            {columns.map((col) => (
              <div key={col.key} className="min-w-32 flex-1 border-r border-line last:border-r-0">
                <div className="flex h-12 flex-col justify-center border-b border-line px-3">
                  <p className="truncate text-sm font-medium">{col.title}</p>
                  {col.sub && <p className="truncate text-[11px] text-muted">{col.sub}</p>}
                </div>
                <div className="relative" style={{ height: (END_H - START_H) * HOUR }}>
                  {Array.from({ length: END_H - START_H }, (_, i) => (
                    <div key={i} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR }} />
                  ))}
                  {isToday && nowTop > 0 && nowTop < (END_H - START_H) * HOUR && <div className="absolute inset-x-0 z-10 border-t-2 border-peach-400" style={{ top: nowTop }} />}
                  {withLanes(rows.filter(col.match)).map(({ r, lane, lanes }) => (
                    <GridBlock key={r.id} r={r} lane={lane} lanes={lanes} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Place overlapping bookings side by side within a column. */
function withLanes(list: Row[]) {
  const sorted = [...list].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const ends: number[] = [];
  const placed = sorted.map((r) => {
    const s = new Date(r.start_at).getTime();
    let lane = ends.findIndex((e) => e <= s);
    if (lane === -1) lane = ends.length;
    ends[lane] = s + r.duration_min * 60000;
    return { r, lane };
  });
  const lanes = Math.max(ends.length, 1);
  return placed.map((p) => ({ ...p, lanes }));
}

function GridBlock({ r, lane = 0, lanes = 1 }: { r: Row; lane?: number; lanes?: number }) {
  const p = pkParts(r.start_at);
  const top = ((p.h * 60 + p.min - START_H * 60) / 60) * HOUR;
  const height = Math.max((r.duration_min / 60) * HOUR - 3, 26);
  const status = r.bookings.status;
  return (
    <Link
      href={`/bookings/${r.booking_id}`}
      className={cn(
        "absolute overflow-hidden rounded-lg border px-2 py-1 text-xs leading-tight",
        status === "booked" && "border-peach-200 bg-peach-100 hover:border-peach-400",
        status === "completed" && "border-emerald-100 bg-emerald-50 hover:border-emerald-300",
        status === "cancelled" && "border-line bg-stone-50 text-muted line-through opacity-60",
        status === "no_show" && "border-red-100 bg-red-50 text-red-700"
      )}
      style={{ top: Math.max(top, 0) + 1, height, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
    >
      <p className="truncate font-medium">{r.bookings.clients?.name}</p>
      <p className="truncate text-muted">
        {fmtTime(r.start_at)} · {r.label}
      </p>
    </Link>
  );
}

function ListRow({ r }: { r: Row }) {
  const st = STATUS[r.bookings.status];
  return (
    <Link href={`/bookings/${r.booking_id}`}>
      <Card className={cn("flex items-center gap-4 p-3.5 hover:border-peach-300", r.bookings.status === "cancelled" && "opacity-60")}>
        <div className="w-16 shrink-0 text-sm font-semibold">{fmtTime(r.start_at)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {r.bookings.clients?.name}
            {r.booked_for && r.booked_for !== r.bookings.clients?.name && <span className="font-normal text-muted"> · for {r.booked_for}</span>}
          </p>
          <p className="truncate text-sm text-muted">
            {r.label}
            {r.staff ? ` · ${r.staff.name}` : r.staff_levels ? ` · ${r.staff_levels.name}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={st.tone}>{st.label}</Badge>
          {r.bookings.confirmation_sent_at && (
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <MessageCircle className="size-3" /> Sent
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
