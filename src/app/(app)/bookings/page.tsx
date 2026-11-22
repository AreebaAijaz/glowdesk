"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useSalon } from "@/components/salon-context";
import { supabase } from "@/lib/supabase/client";
import { STATUS } from "@/lib/status";
import { bookingMoney } from "@/lib/money";
import { fetchAll } from "@/lib/fetch-all";
import { Badge, Card, Empty, Input, Loading, PageHeader } from "@/components/ui";
import { cn, displayPhone, fmtDate, fmtTime, rs } from "@/lib/utils";

type Row = {
  id: string;
  status: string;
  is_walk_in: boolean;
  created_at: string;
  advance_amount: number | null;
  paid_amount: number | null;
  clients: { name: string; phone: string | null } | null;
  booking_items: { label: string; price: number; start_at: string }[];
};

const TABS = [
  { id: "recent", label: "Recent" },
  { id: "upcoming", label: "Upcoming" },
  { id: "due", label: "Payment due" },
  { id: "cancelled", label: "Cancelled" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function BookingsPage() {
  const { branchId } = useSalon();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<Tab>("recent");
  const [q, setQ] = useState("");

  useEffect(() => {
    const cols = "id, status, is_walk_in, created_at, advance_amount, paid_amount, clients(name, phone), booking_items(label, price, start_at)";
    const sb = supabase();
    (async () => {
      // The newest 500 bookings, plus EVERY open booking (so Upcoming and Payment due are never cut short)
      const [recent, open] = await Promise.all([
        sb.from("bookings").select(cols).eq("branch_id", branchId).order("created_at", { ascending: false }).limit(500),
        fetchAll<Row>((from, to) => sb.from("bookings").select(cols).eq("branch_id", branchId).eq("status", "booked").order("id").range(from, to)),
      ]);
      const map = new Map<string, Row>();
      for (const r of [...((recent.data ?? []) as unknown as Row[]), ...open]) map.set(r.id, r);
      setRows(Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    })();
  }, [branchId]);

  const enriched = useMemo(
    () =>
      (rows ?? []).map((r) => {
        const total = r.booking_items.reduce((a, i) => a + Number(i.price), 0);
        const when = [...r.booking_items].sort((a, b) => a.start_at.localeCompare(b.start_at))[0]?.start_at ?? r.created_at;
        return { ...r, when, money: bookingMoney(r, total) };
      }),
    [rows]
  );

  const list = useMemo(() => {
    const now = new Date().toISOString();
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "").replace(/^0/, "");
    let out = enriched;
    if (tab === "upcoming") out = out.filter((r) => r.status === "booked" && r.when >= now).sort((a, b) => a.when.localeCompare(b.when));
    if (tab === "due") out = out.filter((r) => r.money.due > 0).sort((a, b) => a.when.localeCompare(b.when));
    if (tab === "cancelled") out = out.filter((r) => r.status === "cancelled");
    if (term)
      out = out.filter(
        (r) =>
          (r.clients?.name ?? "").toLowerCase().includes(term) ||
          (digits.length >= 3 && (r.clients?.phone ?? "").includes(digits)) ||
          r.booking_items.some((i) => i.label.toLowerCase().includes(term))
      );
    return out;
  }, [enriched, tab, q]);

  const active = list.filter((r) => r.status !== "cancelled");
  const totalValue = active.reduce((a, r) => a + r.money.total, 0);
  const received = list.reduce((a, r) => a + r.money.received, 0);
  const due = active.reduce((a, r) => a + r.money.due, 0);

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Every booking in one place, newest first."
        action={
          <Link href="/bookings/new" className="inline-flex h-9 items-center gap-2 rounded-xl bg-peach-300 px-3 text-sm font-medium hover:bg-peach-400">
            <Plus className="size-4" /> New booking
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-xl border border-line bg-white p-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn("rounded-lg px-3.5 py-1.5 text-sm cursor-pointer", tab === t.id ? "bg-peach-100 font-medium" : "text-muted")}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, phone or service" className="h-10 pl-9" />
        </div>
      </div>

      {rows === null ? (
        <Loading />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-muted">Bookings</p>
              <p className="mt-1 text-xl font-semibold">{list.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted">Total value</p>
              <p className="mt-1 text-xl font-semibold">{rs(totalValue)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted">Received</p>
              <p className="mt-1 text-xl font-semibold">{rs(received)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted">Due</p>
              <p className={cn("mt-1 text-xl font-semibold", due > 0 && "text-peach-600")}>{rs(due)}</p>
            </Card>
          </div>

          {list.length === 0 ? (
            <Empty title={q ? "No bookings match your search" : "No bookings here yet"} text={tab === "recent" && !q ? "New bookings will show up here." : undefined} />
          ) : (
            <Card className="divide-y divide-line">
              {list.map((r) => {
                const st = STATUS[r.status];
                return (
                  <Link key={r.id} href={`/bookings/${r.id}`} className={cn("flex gap-3 px-4 py-3.5 hover:bg-peach-50/50", r.status === "cancelled" && "opacity-60")}>
                    <div className="w-20 shrink-0">
                      <p className="text-sm font-semibold">{fmtDate(r.when, { day: "numeric", month: "short" })}</p>
                      <p className="text-xs text-muted">{fmtTime(r.when)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {r.clients?.name}
                        {r.clients?.phone && <span className="font-normal text-muted"> · {displayPhone(r.clients.phone)}</span>}
                      </p>
                      <p className="truncate text-sm text-muted">{r.booking_items.map((i) => i.label).join(", ")}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Booked {fmtDate(r.created_at, { day: "numeric", month: "short" })} {fmtTime(r.created_at)}
                        {r.is_walk_in && " · Walk-in"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold">{rs(r.money.total)}</span>
                      {r.money.due > 0 ? (
                        <span className="text-xs font-medium text-peach-600">Due {rs(r.money.due)}</span>
                      ) : (r.status === "cancelled" || r.status === "no_show") && r.money.received > 0 ? (
                        <span className="text-xs text-muted">Advance kept {rs(r.money.received)}</span>
                      ) : r.status === "completed" ? (
                        <span className="text-xs text-emerald-700">Paid</span>
                      ) : null}
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                  </Link>
                );
              })}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
