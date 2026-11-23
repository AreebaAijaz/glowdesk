"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CheckCircle2, ChevronDown, ChevronRight, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { useSalon } from "@/components/salon-context";
import { useCatalog, serviceLabel } from "@/lib/catalog";
import { assignOptions, dealContents, defaultAssign } from "@/lib/staffing";
import { supabase } from "@/lib/supabase/client";
import { useQueryParam } from "@/lib/use-query";
import { levelBusy, levelCapacity, staffBusy, type Slot } from "@/lib/availability";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { PAYMENT_METHODS, type Category, type Client, type Deal, type Service } from "@/lib/types";
import { cn, combine, dayRange, displayPhone, fmtTime, isValidPkPhone, money, nextSlot, normalizePhone, rs, timeSlots, toDateStr } from "@/lib/utils";

type Draft = {
  key: string;
  service_id: string | null;
  deal_id: string | null;
  label: string;
  contents?: string[];
  price: number;
  duration_min: number;
  assign: string; // "", "level:<id>" or "staff:<id>"
};

const SLOTS = timeSlots();
let keySeq = 0;
const newKey = () => `k${++keySeq}`;

export default function NewBookingPage() {
  const router = useRouter();
  const { branchId } = useSalon();
  const cat = useCatalog(branchId);
  const phoneParam = useQueryParam("phone");
  const dateParam = useQueryParam("date");

  // Client
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState<(Client & { visits: number }) | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const foundRef = useRef(false);
  const [walkIn, setWalkIn] = useState(false);

  // Visit
  const [date, setDate] = useState(toDateStr());
  const [time, setTime] = useState(nextSlot());
  const [items, setItems] = useState<Draft[]>([]);
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState(false);
  const [dayItems, setDayItems] = useState<Slot[]>([]);

  // Payment
  const [advance, setAdvance] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState("cash");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (phoneParam) setPhone(displayPhone(phoneParam));
  }, [phoneParam]);
  useEffect(() => {
    if (dateParam) {
      setDate(dateParam);
      if (dateParam !== toDateStr()) setTime("11:00");
    }
  }, [dateParam]);

  // Look up client by phone number
  const normPhone = normalizePhone(phone);
  useEffect(() => {
    // A previously found client's name must not stick to a different number
    if (foundRef.current) {
      foundRef.current = false;
      setName("");
    }
    setClient(null);
    setLookingUp(false);
    if (!isValidPkPhone(normPhone)) return;
    let cancelled = false;
    setLookingUp(true);
    (async () => {
      const sb = supabase();
      const { data } = await sb.from("clients").select("*").eq("branch_id", branchId).eq("phone", normPhone).maybeSingle();
      let visits = 0;
      if (data) {
        const { count } = await sb.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", data.id).neq("status", "cancelled");
        visits = count ?? 0;
      }
      if (cancelled) return;
      setLookingUp(false);
      if (data) {
        foundRef.current = true;
        setClient({ ...(data as Client), visits });
        setName(data.name);
      }
    })();
    return () => {
      cancelled = true;
      setLookingUp(false);
    };
  }, [normPhone, branchId]);

  // The day's existing bookings, for staff availability
  useEffect(() => {
    const { start, end } = dayRange(date);
    supabase()
      .from("booking_items")
      .select("start_at, duration_min, staff_id, level_id, bookings!inner(status)")
      .eq("branch_id", branchId)
      .gte("start_at", start)
      .lt("start_at", end)
      .neq("bookings.status", "cancelled")
      .then(({ data }) => setDayItems((data ?? []) as unknown as Slot[]));
  }, [date, branchId]);

  const options = useMemo(() => assignOptions(cat.levels, cat.staff), [cat.levels, cat.staff]);

  function addPicked(serviceIds: string[], dealIds: string[]) {
    const add: Draft[] = [];
    for (const id of dealIds) {
      const d = cat.deals.find((x) => x.id === id);
      if (!d) continue;
      add.push({ key: newKey(), service_id: null, deal_id: d.id, label: d.name, contents: dealContents(d, cat.dealItems, cat.services, cat.categories), price: d.price, duration_min: 60, assign: "" });
    }
    for (const id of serviceIds) {
      const s = cat.services.find((x) => x.id === id);
      if (!s) continue;
      add.push({
        key: newKey(),
        service_id: s.id,
        deal_id: null,
        label: serviceLabel(s, cat.categories),
        price: s.price,
        duration_min: s.duration_min || 60,
        assign: defaultAssign(s.name, s.level_id, cat.levels, cat.staff),
      });
    }
    setItems((prev) => [...prev, ...add]);
    setPicker(false);
  }

  function update(key: string, patch: Partial<Draft>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  const total = items.reduce((a, i) => a + money(i.price), 0);
  const advanceNum = money(advance);
  const due = Math.max(total - advanceNum, 0);

  // Availability for each service, counting existing bookings + the other services in this visit
  const availability = useMemo(() => {
    const start = combine(date, time);
    return items.map((it, idx) => {
      const others: Slot[] = [
        ...dayItems,
        ...items
          .filter((_, j) => j !== idx)
          .map((o) => ({
            start_at: start,
            duration_min: o.duration_min,
            staff_id: o.assign.startsWith("staff:") ? o.assign.slice(6) : null,
            level_id: o.assign.startsWith("level:") ? o.assign.slice(6) : null,
          })),
      ];
      if (it.assign.startsWith("staff:")) {
        const id = it.assign.slice(6);
        const person = cat.staff.find((s) => s.id === id);
        return staffBusy(id, start, it.duration_min, others)
          ? { tone: "red" as const, text: `${person?.name ?? "This person"} is busy at this time` }
          : { tone: "green" as const, text: `${person?.name ?? "Free"} is free` };
      }
      if (it.assign.startsWith("level:")) {
        const id = it.assign.slice(6);
        const cap = levelCapacity(id, cat.levels, cat.staff);
        const lvl = cat.levels.find((l) => l.id === id)?.name ?? "";
        if (!cap) return null;
        const free = Math.max(cap - levelBusy(id, start, it.duration_min, others, cat.staff), 0);
        return { tone: free > 0 ? ("green" as const) : ("red" as const), text: `${free} of ${cap} ${lvl} free` };
      }
      return null;
    });
  }, [items, dayItems, date, time, cat.levels, cat.staff]);

  const canSave = items.length > 0 && name.trim() && (walkIn ? !phone || isValidPkPhone(normPhone) : isValidPkPhone(normPhone)) && advanceNum <= total;

  async function save() {
    setError(null);
    if (!canSave) return;
    setSaving(true);
    const startAt = combine(date, time);
    const { data, error } = await supabase().rpc("create_booking", {
      p: {
        branch_id: branchId,
        client_id: client?.id ?? null,
        name: name.trim(),
        phone: normPhone || null,
        is_walk_in: walkIn,
        notes: notes.trim() || null,
        advance_amount: advanceNum,
        advance_method: advanceNum > 0 ? advanceMethod : null,
        items: items.map((i) => {
          const staffId = i.assign.startsWith("staff:") ? i.assign.slice(6) : null;
          return {
            service_id: i.service_id,
            deal_id: i.deal_id,
            staff_id: staffId,
            level_id: i.assign.startsWith("level:") ? i.assign.slice(6) : staffId ? cat.staff.find((s) => s.id === staffId)?.level_id ?? null : null,
            label: i.contents?.length ? `${i.label}: ${i.contents.join(", ")}` : i.label,
            start_at: startAt,
            duration_min: i.duration_min,
            price: money(i.price),
          };
        }),
      },
    });
    if (error || !data) {
      setError(error?.message ?? "Could not save the booking.");
      setSaving(false);
      return;
    }
    router.push(`/bookings/${data}?created=1`);
  }

  if (cat.loading) return <Loading />;

  if (cat.services.length === 0 && cat.deals.length === 0) {
    return (
      <div>
        <PageHeader title="New booking" />
        <Card className="p-6 text-center">
          <p className="font-medium">Add your services first</p>
          <p className="mt-1 text-sm text-muted">Bookings are made from your services menu.</p>
          <Link href="/services" className="mt-4 inline-flex h-11 items-center rounded-xl bg-peach-300 px-4 font-medium hover:bg-peach-400">
            Go to services
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New booking" />

      {/* Client */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Client</h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} className="size-4 accent-[#D8A08A]" />
            Walk-in
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={walkIn ? "Phone (optional)" : "Phone number"} hint={phone && !isValidPkPhone(normPhone) ? "Enter a full number, e.g. 0300 1234567" : undefined}>
            <Input inputMode="tel" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" disabled={!!client} />
          </Field>
        </div>
        {lookingUp && <p className="mt-2 text-xs text-muted">Checking…</p>}
        {client && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-peach-50 px-3 py-2.5">
            <CheckCircle2 className="size-5 text-peach-500" />
            <div className="flex-1 text-sm">
              <span className="font-medium">Returning client</span>
              <span className="text-muted"> · {client.visits} {client.visits === 1 ? "visit" : "visits"}</span>
              {client.notes && <p className="text-xs text-muted">Note: {client.notes}</p>}
            </div>
            <button
              className="text-muted hover:text-ink cursor-pointer"
              onClick={() => {
                setPhone("");
                setName("");
                setClient(null);
              }}
              aria-label="Clear client"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {!client && isValidPkPhone(normPhone) && !lookingUp && <p className="mt-2 text-xs text-muted">New client: will be saved with this booking.</p>}
      </Card>

      {/* Services */}
      <Card className="mt-4 p-4 sm:p-5">
        <h2 className="mb-3 font-semibold">Services</h2>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Select value={time} onChange={(e) => setTime(e.target.value)}>
              {SLOTS.map((t) => (
                <option key={t} value={t}>
                  {fmtTime(t)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {items.length > 0 && (
          <div className="mb-3 divide-y divide-line rounded-xl border border-line">
            {items.map((it, idx) => {
              const av = availability[idx];
              return (
                <div key={it.key} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-medium">
                        {it.deal_id && <Tag className="size-3.5 text-peach-500" />}
                        {it.label}
                      </p>
                      {it.contents && it.contents.length > 0 && <p className="text-xs text-muted">{it.contents.join(" · ")}</p>}
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">Rs</span>
                      <Input type="number" inputMode="numeric" min={0} step={1} value={it.price} onChange={(e) => update(it.key, { price: money(e.target.value) })} className="h-9 w-28 pl-8 text-right text-sm" />
                    </div>
                    <button onClick={() => setItems((p) => p.filter((x) => x.key !== it.key))} className="p-2 text-muted hover:text-red-500 cursor-pointer" aria-label="Remove">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">Done by</span>
                    <Select value={it.assign} onChange={(e) => update(it.key, { assign: e.target.value })} className="h-9 w-auto min-w-36 text-sm">
                      <option value="">Not set</option>
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    {av && <Badge tone={av.tone}>{av.text}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button variant="secondary" className="w-full border-dashed" onClick={() => setPicker(true)}>
          <Plus className="size-4" /> {items.length ? "Add more services" : "Choose services"}
        </Button>
      </Card>

      {/* Payment */}
      <Card className="mt-4 p-4 sm:p-5">
        <h2 className="mb-3 font-semibold">Payment</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[15px]">
            <span className="text-muted">Total</span>
            <span className="font-semibold">{rs(total)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="advance" className="text-[15px] text-muted">
              Advance paid
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">Rs</span>
              <Input id="advance" type="number" inputMode="numeric" min={0} step={1} value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0" className="h-10 w-36 pl-9 text-right" />
            </div>
          </div>
          {advanceNum > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {PAYMENT_METHODS.filter((m) => m.id !== "other").map((m) => (
                <button
                  key={m.id}
                  onClick={() => setAdvanceMethod(m.id)}
                  className={cn("rounded-full border px-3 py-1 text-xs cursor-pointer", advanceMethod === m.id ? "border-peach-400 bg-peach-100" : "border-line text-muted")}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          {advanceNum > total && <p className="text-right text-xs text-red-600">Advance can&apos;t be more than the total.</p>}
          <div className="flex items-center justify-between border-t border-line pt-3 text-lg">
            <span className="font-medium">Due</span>
            <span className="font-semibold text-peach-600">{rs(due)}</span>
          </div>
        </div>
      </Card>

      <Card className="mt-4 p-4 sm:p-5">
        <Field label="Notes (optional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Sensitive skin" />
        </Field>
      </Card>

      <div className="sticky bottom-20 z-20 mt-4 md:bottom-4">
        <Card className="flex items-center gap-3 p-3 shadow-[0_8px_30px_-12px_rgba(42,37,35,0.18)]">
          <div className="min-w-0 flex-1 pl-1">
            <p className="whitespace-nowrap text-xs text-muted">
              <span className="hidden sm:inline">{items.length} {items.length === 1 ? "service" : "services"} · </span>Total {rs(total)}
            </p>
            <p className="whitespace-nowrap text-lg font-semibold">Due {rs(due)}</p>
          </div>
          <Button size="lg" className="shrink-0 whitespace-nowrap px-4 sm:px-5" onClick={save} loading={saving} disabled={!canSave}>
            <span className="min-[360px]:hidden">Book</span>
            <span className="hidden min-[360px]:inline">Book appointment</span>
          </Button>
        </Card>
        <div className="mt-2">
          <ErrorNote message={error} />
        </div>
      </div>

      <ServicePicker open={picker} onClose={() => setPicker(false)} cat={cat} onAdd={addPicked} />
    </div>
  );
}

function ServicePicker({ open, onClose, cat, onAdd }: { open: boolean; onClose: () => void; cat: ReturnType<typeof useCatalog>; onAdd: (serviceIds: string[], dealIds: string[]) => void }) {
  const [q, setQ] = useState("");
  const [svc, setSvc] = useState<string[]>([]);
  const [dls, setDls] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (open) {
      setQ("");
      setSvc([]);
      setDls([]);
      setExpanded({});
    }
  }, [open]);

  const query = q.trim().toLowerCase();
  const flip = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const activeDeals = cat.deals.filter((d) => d.active);
  const groupName = (c: Category) => cat.groups.find((g) => g.id === c.group_id)?.name ?? "";
  const pricesOf = (c: Category) => cat.services.filter((s) => s.active && s.category_id === c.id);
  const sections = [
    ...cat.groups.map((g) => ({ id: g.id, title: g.name, cats: cat.categories.filter((c) => c.group_id === g.id && pricesOf(c).length) })),
    {
      id: "other",
      title: cat.groups.length ? "Other services" : "Services",
      cats: cat.categories.filter((c) => (!c.group_id || !cat.groups.some((g) => g.id === c.group_id)) && pricesOf(c).length),
    },
  ].filter((s) => s.cats.length);

  const count = svc.length + dls.length;
  const sum = svc.reduce((a, id) => a + (cat.services.find((s) => s.id === id)?.price ?? 0), 0) + dls.reduce((a, id) => a + (cat.deals.find((d) => d.id === id)?.price ?? 0), 0);
  const selectedIn = (cats: Category[]) => svc.filter((id) => cats.some((c) => cat.services.find((s) => s.id === id)?.category_id === c.id)).length;

  const PriceRow = ({ s, label, sub }: { s: Service; label: string; sub?: string }) => {
    const on = svc.includes(s.id);
    return (
      <button
        onClick={() => toggle(svc, setSvc, s.id)}
        className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left cursor-pointer", on ? "border-peach-400 bg-peach-100" : "border-line bg-white hover:border-peach-300")}
      >
        <Tick on={on} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{label}</p>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
        <span className="text-sm font-medium">{rs(s.price)}</span>
      </button>
    );
  };

  const DealRow = ({ d }: { d: Deal }) => {
    const on = dls.includes(d.id);
    return (
      <button
        onClick={() => toggle(dls, setDls, d.id)}
        className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left cursor-pointer", on ? "border-peach-400 bg-peach-100" : "border-line bg-white hover:border-peach-300")}
      >
        <Tick on={on} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{d.name}</p>
          <p className="text-xs text-muted">{dealContents(d, cat.dealItems, cat.services, cat.categories).join(" · ")}</p>
        </div>
        <span className="text-sm font-medium">{rs(d.price)}</span>
      </button>
    );
  };

  const SectionHeader = ({ id, title, n, picked, icon }: { id: string; title: string; n: string; picked: number; icon?: React.ReactNode }) => (
    <button onClick={() => flip(id)} className="flex w-full items-center gap-2.5 px-3 py-3 text-left cursor-pointer hover:bg-peach-50/60">
      {expanded[id] ? <ChevronDown className="size-4 text-muted" /> : <ChevronRight className="size-4 text-muted" />}
      {icon}
      <span className="flex-1 font-medium">{title}</span>
      {picked > 0 && <Badge tone="peach">{picked} selected</Badge>}
      <span className="text-xs text-muted">{n}</span>
    </button>
  );

  // Search: one flat list of everything that matches
  const searchDeals = query
    ? activeDeals.filter((d) => (d.name + " " + dealContents(d, cat.dealItems, cat.services, cat.categories).join(" ")).toLowerCase().includes(query))
    : [];
  const searchPrices = query
    ? cat.services.filter((s) => {
        const c = cat.categories.find((x) => x.id === s.category_id);
        return s.active && c && `${groupName(c)} ${c.name} ${s.name}`.toLowerCase().includes(query);
      })
    : [];

  return (
    <Modal open={open} onClose={onClose} title="Choose services" wide>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search, e.g. "bridal", "facial" or "Deal 2"' className="pl-9" />
      </div>
      <p className="mb-3 text-xs text-muted">{query ? "Matching services and deals:" : "Open a section, then tap to select as many as the client wants."}</p>

      <div className="max-h-[52vh] overflow-y-auto">
        {query ? (
          <div className="space-y-2">
            {searchDeals.map((d) => (
              <DealRow key={d.id} d={d} />
            ))}
            {searchPrices.map((s) => {
              const c = cat.categories.find((x) => x.id === s.category_id)!;
              return <PriceRow key={s.id} s={s} label={s.name ? `${c.name} · ${s.name}` : c.name} sub={groupName(c) || undefined} />;
            })}
            {!searchDeals.length && !searchPrices.length && <p className="py-6 text-center text-sm text-muted">Nothing matches &quot;{q}&quot;.</p>}
          </div>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line">
            {activeDeals.length > 0 && (
              <div>
                <SectionHeader id="deals" title="Deals" n={`${activeDeals.length}`} picked={dls.length} icon={<Tag className="size-4 text-peach-500" />} />
                {expanded["deals"] && (
                  <div className="space-y-2 bg-canvas/60 p-3">
                    {activeDeals.map((d) => (
                      <DealRow key={d.id} d={d} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {sections.map((sec) => (
              <div key={sec.id}>
                <SectionHeader id={sec.id} title={sec.title} n={`${sec.cats.length}`} picked={selectedIn(sec.cats)} />
                {expanded[sec.id] && (
                  <div className="space-y-2 bg-canvas/60 p-3">
                    {sec.cats.map((c) => {
                      const prices = pricesOf(c);
                      if (prices.length === 1 && !prices[0].name) return <PriceRow key={c.id} s={prices[0]} label={c.name} />;
                      const key = `cat-${c.id}`;
                      const picked = selectedIn([c]);
                      return (
                        <div key={c.id} className="rounded-xl border border-line bg-white">
                          <button onClick={() => flip(key)} className="flex w-full items-center gap-2.5 p-3 text-left cursor-pointer">
                            {expanded[key] ? <ChevronDown className="size-4 text-muted" /> : <ChevronRight className="size-4 text-muted" />}
                            <span className="flex-1 font-medium">{c.name}</span>
                            {picked > 0 && <Badge tone="peach">{picked} selected</Badge>}
                            <span className="text-xs text-muted">from {rs(Math.min(...prices.map((p) => p.price)))}</span>
                          </button>
                          {expanded[key] && (
                            <div className="space-y-2 border-t border-line p-2">
                              {prices.map((s) => (
                                <PriceRow key={s.id} s={s} label={s.name ? `Done by ${s.name}` : "Standard"} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
        <p className="flex-1 text-sm text-muted">{count ? `${count} selected · ${rs(sum)}` : "Nothing selected yet"}</p>
        <Button onClick={() => onAdd(svc, dls)} disabled={!count}>
          Add {count || ""} {count === 1 ? "service" : "services"}
        </Button>
      </div>
    </Modal>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border", on ? "border-peach-500 bg-peach-400 text-white" : "border-line bg-white")}>
      {on && <Check className="size-3.5" />}
    </span>
  );
}
