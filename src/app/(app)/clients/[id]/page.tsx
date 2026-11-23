"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Cake, MessageCircle, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { STATUS } from "@/lib/status";
import { bookingMoney } from "@/lib/money";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, Modal, Textarea } from "@/components/ui";
import type { Client } from "@/lib/types";
import { displayPhone, fmtDate, isValidPkPhone, normalizePhone, rs } from "@/lib/utils";

type Visit = {
  id: string;
  status: string;
  paid_amount: number | null;
  advance_amount: number | null;
  created_at: string;
  booking_items: { label: string; start_at: string; price: number; booked_for: string | null }[];
};

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: c }, { data: v }] = await Promise.all([
      sb.from("clients").select("*").eq("id", id).maybeSingle(),
      sb.from("bookings").select("id, status, paid_amount, advance_amount, created_at, booking_items(label, start_at, price, booked_for)").eq("client_id", id).order("created_at", { ascending: false }),
    ]);
    setClient(c as Client);
    const list = ((v ?? []) as Visit[]).map((x) => ({ ...x, booking_items: [...x.booking_items].sort((a, b) => a.start_at.localeCompare(b.start_at)) }));
    list.sort((a, b) => (b.booking_items[0]?.start_at ?? b.created_at).localeCompare(a.booking_items[0]?.start_at ?? a.created_at));
    setVisits(list);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!client) return <Loading />;

  const completed = visits.filter((v) => v.status === "completed");
  const money = visits.map((v) => bookingMoney(v, v.booking_items.reduce((a, i) => a + Number(i.price), 0)));
  const paid = money.reduce((a, m) => a + m.received, 0);
  const due = money.reduce((a, m) => a + m.due, 0);
  const lastVisit = completed[0]?.booking_items[0]?.start_at;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-peach-100 text-lg font-semibold text-peach-700">{client.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h1 className="text-xl font-semibold">{client.name}</h1>
              <p className="text-sm text-muted">{displayPhone(client.phone) || "No phone"}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} aria-label="Edit client">
            <Pencil className="size-4" />
          </Button>
        </div>
        {client.birthday && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
            <Cake className="size-4 text-peach-500" /> {fmtDate(client.birthday, { day: "numeric", month: "long" })}
          </p>
        )}
        {client.notes && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm text-muted">{client.notes}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-center sm:grid-cols-4">
          <div>
            <p className="text-xl font-semibold">{completed.length}</p>
            <p className="text-xs text-muted">Visits done</p>
          </div>
          <div>
            <p className="whitespace-nowrap text-lg font-semibold sm:text-xl">{rs(paid)}</p>
            <p className="text-xs text-muted">Paid</p>
          </div>
          <div>
            <p className={`whitespace-nowrap text-lg font-semibold sm:text-xl ${due > 0 ? "text-peach-600" : ""}`}>{rs(due)}</p>
            <p className="text-xs text-muted">Due</p>
          </div>
          <div>
            <p className="text-xl font-semibold">{lastVisit ? fmtDate(lastVisit, { day: "numeric", month: "short" }) : "–"}</p>
            <p className="text-xs text-muted">Last visit</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Link href={`/bookings/new${client.phone ? `?phone=${client.phone}` : ""}`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-peach-300 font-medium hover:bg-peach-400">
            <Plus className="size-4" /> New booking
          </Link>
          {client.phone && (
            <a href={`https://wa.me/${client.phone}`} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 hover:border-peach-300">
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          )}
        </div>
      </Card>

      <h2 className="mb-3 mt-6 font-semibold">History</h2>
      {visits.length === 0 ? (
        <p className="text-sm text-muted">No bookings yet.</p>
      ) : (
        <div className="space-y-2">
          {visits.map((v, idx) => {
            const st = STATUS[v.status];
            const day = v.booking_items[0]?.start_at ?? v.created_at;
            const m = money[idx];
            return (
              <Link key={v.id} href={`/bookings/${v.id}`}>
                <Card className="p-3.5 hover:border-peach-300">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{fmtDate(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{rs(m.total)}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">{v.booking_items.map((i) => i.label).join(", ")}</p>
                  {m.received > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      Paid {rs(m.received)}
                      {m.advance > 0 && m.atVisit === 0 && (v.status === "cancelled" || v.status === "no_show" ? " (advance kept)" : " (advance)")}
                      {m.due > 0 && <span className="font-medium text-peach-600"> · Due {rs(m.due)}</span>}
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <EditClient open={editOpen} onClose={() => setEditOpen(false)} client={client} onSaved={load} />
    </div>
  );
}

function EditClient({ open, onClose, client, onSaved }: { open: boolean; onClose: () => void; client: Client; onSaved: () => void }) {
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(displayPhone(client.phone));
  const [birthday, setBirthday] = useState(client.birthday ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(client.name);
      setPhone(displayPhone(client.phone));
      setBirthday(client.birthday ?? "");
      setNotes(client.notes ?? "");
      setError(null);
    }
  }, [open, client]);

  const norm = normalizePhone(phone);

  async function save() {
    setSaving(true);
    const { error } = await supabase()
      .from("clients")
      .update({ name: name.trim(), phone: norm || null, birthday: birthday || null, notes: notes.trim() || null })
      .eq("id", client.id);
    setSaving(false);
    if (error) return setError(error.code === "23505" ? "Another client already has this phone number." : error.message);
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit client">
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Birthday">
          <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, preferences…" />
        </Field>
        <ErrorNote message={error} />
        <Button className="w-full" onClick={save} loading={saving} disabled={!name.trim() || (!!phone && !isValidPkPhone(norm))}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
