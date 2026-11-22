"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarClock, Check, CheckCircle2, MessageCircle, RotateCcw, UserX, XCircle } from "lucide-react";
import { useSalon } from "@/components/salon-context";
import { supabase } from "@/lib/supabase/client";
import { useQueryParam } from "@/lib/use-query";
import { confirmationMessage } from "@/lib/message";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, Modal, Select } from "@/components/ui";
import { PAYMENT_METHODS, type Booking, type BookingItem, type Client } from "@/lib/types";
import { cn, combine, displayPhone, fmtDate, fmtTime, money, rs, timeOf, timeSlots, toDateStr, waLink } from "@/lib/utils";
import { STATUS } from "@/lib/status";

type Full = Booking & {
  clients: Client;
  booking_items: (BookingItem & { staff: { name: string } | null; staff_levels: { name: string } | null })[];
};


const methodLabel = (id: string | null) => PAYMENT_METHODS.find((m) => m.id === id)?.label ?? id ?? "";

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const { brandName } = useSalon();
  const created = useQueryParam("created");
  const [b, setB] = useState<Full | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase()
      .from("bookings")
      .select("*, clients(*), booking_items(*, staff(name), staff_levels(name))")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return setNotFound(true);
    const full = data as Full;
    full.booking_items.sort((a, c) => a.start_at.localeCompare(c.start_at));
    setB(full);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (notFound) return <p className="py-10 text-center text-muted">Booking not found.</p>;
  if (!b) return <Loading />;

  const total = b.booking_items.reduce((a, i) => a + Number(i.price), 0);
  const advance = Number(b.advance_amount || 0);
  const remaining = Math.max(total - advance - Number(b.paid_amount || 0), 0);
  const due = b.status === "booked" ? remaining : 0;
  const lost = b.status === "cancelled" || b.status === "no_show";
  const phone = b.clients.phone;

  // All money changes go through checked database functions
  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error } = await supabase().rpc(fn, args);
    setBusy(false);
    if (error) {
      setError(error.message);
      return false;
    }
    setConfirmCancel(false);
    load();
    return true;
  }
  const setStatus = (status: "cancelled" | "no_show" | "booked") => call("set_booking_status", { p_booking: id, p_status: status });
  const discount = Number(b.discount_amount || 0);
  const paidToday = b.paid_at ? toDateStr(new Date(b.paid_at)) === toDateStr() : false;

  async function sendConfirmation() {
    if (!phone || !b) return;
    const text = confirmationMessage({
      clientName: b.clients.name,
      salonName: brandName,
      total,
      advance: Number(b.advance_amount || 0),
      due,
      items: b.booking_items.map((i) => ({ label: i.label, start_at: i.start_at, booked_for: i.booked_for, staff_name: i.staff?.name })),
    });
    window.open(waLink(phone, text), "_blank");
    await supabase().from("bookings").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", id);
    load();
  }

  const st = STATUS[b.status];
  const day = b.booking_items[0]?.start_at;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={day ? `/?date=${toDateStr(new Date(day))}` : "/"} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Calendar
      </Link>

      {created && (
        <Card className="mb-4 flex items-center gap-3 border-peach-200 bg-peach-50 p-4">
          <CheckCircle2 className="size-6 text-peach-500" />
          <div className="flex-1">
            <p className="font-medium">Booking saved</p>
            <p className="text-sm text-muted">{phone ? "Send the client a confirmation on WhatsApp (optional)." : "No phone number, so no confirmation to send."}</p>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link href={`/clients/${b.client_id}`} className="text-xl font-semibold hover:text-peach-600">
              {b.clients.name}
            </Link>
            <p className="text-sm text-muted">
              {phone ? displayPhone(phone) : "No phone"}
              {b.is_walk_in && " · Walk-in"}
            </p>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>

        {day && (
          <p className="mt-4 text-sm font-medium text-peach-600">
            {fmtDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {fmtTime(day)}
          </p>
        )}
        <ul className="mt-2 divide-y divide-line">
          {b.booking_items.map((i) => (
            <li key={i.id} className="flex gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{i.label}</p>
                {(i.staff || i.staff_levels) && <p className="text-xs text-muted">Done by {i.staff ? i.staff.name : i.staff_levels?.name}</p>}
              </div>
              <span className="text-sm">{rs(i.price)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1.5 border-t border-line pt-3 text-[15px]">
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{rs(total)}</span>
          </div>
          {advance > 0 && (
            <div className="flex justify-between text-muted">
              <span>Advance paid{b.advance_method ? ` (${methodLabel(b.advance_method)})` : ""}</span>
              <span>− {rs(advance)}</span>
            </div>
          )}
          {b.paid_at && Number(b.paid_amount) > 0 && (
            <div className="flex justify-between text-muted">
              <span>
                Paid at visit ({methodLabel(b.payment_method)}) · {fmtTime(b.paid_at)}
              </span>
              <span>− {rs(b.paid_amount)}</span>
            </div>
          )}
          {b.status === "completed" && discount > 0 && (
            <div className="flex justify-between text-muted">
              <span>Discount (paid less than due)</span>
              <span>− {rs(discount)}</span>
            </div>
          )}
          {lost ? (
            <div className="space-y-1 border-t border-line pt-2">
              <div className="flex justify-between text-lg font-semibold">
                <span>Advance kept</span>
                <span>{rs(advance)}</span>
              </div>
              <p className="text-sm text-muted">
                {b.status === "cancelled"
                  ? `Booking cancelled. The remaining ${rs(remaining)} won't be collected.`
                  : `Client didn't come. If she comes back, change the date and collect the remaining ${rs(remaining)}.`}
              </p>
            </div>
          ) : (
            <div className="flex justify-between border-t border-line pt-2 text-lg font-semibold">
              <span>{b.status === "completed" ? "Balance" : "Due"}</span>
              <span className={due > 0 ? "text-peach-600" : "text-emerald-700"}>{due > 0 ? rs(due) : "Fully paid"}</span>
            </div>
          )}
        </div>
        {b.notes && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm text-muted">{b.notes}</p>}
      </Card>

      <ErrorNote message={error} />

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {phone && b.status === "booked" && (
          <Button variant={b.confirmation_sent_at ? "secondary" : "primary"} onClick={sendConfirmation} className="sm:col-span-2">
            <MessageCircle className="size-4" />
            {b.confirmation_sent_at ? "Confirmation sent ✓ · Send again" : "Send confirmation on WhatsApp"}
          </Button>
        )}
        {b.status === "booked" && (
          <>
            <Button variant="secondary" onClick={() => setPayOpen(true)}>
              <Check className="size-4" /> {due > 0 ? `Done & collect ${rs(due)}` : "Mark as done"}
            </Button>
            <Button variant="secondary" onClick={() => setMoveOpen(true)}>
              <CalendarClock className="size-4" /> Change date & time
            </Button>
            <Button variant="secondary" onClick={() => setStatus("no_show")} disabled={busy} className="sm:col-span-2">
              <UserX className="size-4" /> Client didn&apos;t come (no-show)
            </Button>
            {confirmCancel ? (
              <Button variant="danger" onClick={() => setStatus("cancelled")} loading={busy} className="sm:col-span-2">
                Yes, cancel{advance > 0 ? ` (advance ${rs(advance)} is kept)` : ""}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmCancel(true)} className="sm:col-span-2">
                <XCircle className="size-4" /> Cancel booking
              </Button>
            )}
          </>
        )}
        {b.status === "no_show" && (
          <Button onClick={() => setMoveOpen(true)} className="sm:col-span-2">
            <CalendarClock className="size-4" /> Client came back: choose new date & time
          </Button>
        )}
        {lost && (
          <Button variant="ghost" onClick={() => setStatus("booked")} disabled={busy} className="sm:col-span-2">
            <RotateCcw className="size-4" /> Reopen booking (keeps the advance)
          </Button>
        )}
        {b.status === "completed" && paidToday && (
          <Button variant="ghost" onClick={() => call("undo_complete", { p_booking: id })} disabled={busy} className="sm:col-span-2">
            <RotateCcw className="size-4" /> Undo &quot;Done&quot; (only possible today)
          </Button>
        )}
      </div>

      <MoveModal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        current={b.booking_items[0]?.start_at ?? new Date().toISOString()}
        onSave={async (date, time) => {
          if (await call("reschedule_booking", { p_booking: id, p_start: combine(date, time) })) setMoveOpen(false);
        }}
      />

      <PayModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={due}
        onPay={async (amount, method) => {
          if (await call("complete_booking", { p_booking: id, p_amount: amount, p_method: method })) setPayOpen(false);
        }}
      />
    </div>
  );
}

function MoveModal({ open, onClose, current, onSave }: { open: boolean; onClose: () => void; current: string; onSave: (date: string, time: string) => Promise<void> }) {
  const [date, setDate] = useState(toDateStr(new Date(current)));
  const [time, setTime] = useState(timeOf(current));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setDate(toDateStr(new Date(current)));
      setTime(timeOf(current));
    }
  }, [open, current]);
  const slots = timeSlots();
  return (
    <Modal open={open} onClose={onClose} title="Change date & time">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Select value={time} onChange={(e) => setTime(e.target.value)}>
              {!slots.includes(time) && <option value={time}>{fmtTime(time)}</option>}
              {slots.map((t) => (
                <option key={t} value={t}>
                  {fmtTime(t)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-sm text-muted">The advance stays with this booking. You can send the client a new confirmation afterwards.</p>
        <Button
          className="w-full"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(date, time);
            setSaving(false);
          }}
        >
          Save new date & time
        </Button>
      </div>
    </Modal>
  );
}

function PayModal({ open, onClose, total, onPay }: { open: boolean; onClose: () => void; total: number; onPay: (amount: number, method: string) => Promise<void> }) {
  const [amount, setAmount] = useState(String(total));
  const [method, setMethod] = useState("cash");
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (open) {
      setAmount(String(total));
      setMethod("cash");
      setConfirmed(false);
    }
  }, [open, total]);

  const value = money(amount);
  const negative = Number(amount) < 0;
  const less = value < total;
  const more = value > total;
  const needsConfirm = (less || more) && !confirmed;

  return (
    <Modal open={open} onClose={onClose} title="Mark as done">
      <div className="space-y-4">
        <p className="rounded-xl bg-canvas px-3 py-2 text-sm">
          Due now: <span className="font-semibold">{rs(total)}</span>
        </p>
        <Field label="Amount received now (Rs)">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setConfirmed(false);
            }}
          />
        </Field>
        {negative && <ErrorNote message="Amount can't be negative." />}
        {!negative && less && (
          <label className="flex items-start gap-2 rounded-xl bg-peach-50 px-3 py-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 accent-[#D8A08A]" />
            <span>
              This is <b>{rs(total - value)}</b> less than due. It will be recorded as a <b>discount</b> and the booking will be closed.
            </span>
          </label>
        )}
        {!negative && more && (
          <label className="flex items-start gap-2 rounded-xl bg-peach-50 px-3 py-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 accent-[#D8A08A]" />
            <span>
              This is <b>{rs(value - total)}</b> more than due. Tick to confirm the client really paid {rs(value)}.
            </span>
          </label>
        )}
        {value > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Paid by</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={cn("rounded-full border px-3.5 py-1.5 text-sm cursor-pointer", method === m.id ? "border-peach-400 bg-peach-100" : "border-line text-muted")}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Button
          className="w-full"
          loading={saving}
          disabled={negative || needsConfirm}
          onClick={async () => {
            setSaving(true);
            await onPay(value, method);
            setSaving(false);
          }}
        >
          Save payment
        </Button>
      </div>
    </Modal>
  );
}
