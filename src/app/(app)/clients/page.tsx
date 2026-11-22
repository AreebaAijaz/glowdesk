"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Search } from "lucide-react";
import { useSalon } from "@/components/salon-context";
import { supabase } from "@/lib/supabase/client";
import { Button, Card, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader } from "@/components/ui";
import type { Client } from "@/lib/types";
import { displayPhone, isValidPkPhone, normalizePhone } from "@/lib/utils";

export default function ClientsPage() {
  const { branchId } = useSalon();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [clients, setClients] = useState<Client[] | null>(null);
  const [total, setTotal] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const sb = supabase();
      let query = sb.from("clients").select("*", { count: "exact" }).eq("branch_id", branchId).order("name").limit(100);
      const term = q.trim().replace(/[%,()]/g, "");
      if (term) {
        const digits = term.replace(/\D/g, "");
        const phoneTerm = digits.startsWith("0") ? digits.slice(1) : digits;
        query = phoneTerm.length >= 3 ? query.or(`name.ilike.%${term}%,phone.ilike.%${phoneTerm}%`) : query.ilike("name", `%${term}%`);
      }
      const { data, count } = await query;
      setClients((data ?? []) as Client[]);
      if (!term) setTotal(count ?? 0);
    }, 200);
    return () => clearTimeout(t);
  }, [q, branchId]);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={total ? `${total} ${total === 1 ? "client" : "clients"}` : undefined}
        action={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Client
          </Button>
        }
      />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone" className="pl-9" />
      </div>

      {clients === null ? (
        <Loading />
      ) : clients.length === 0 ? (
        <Empty title={q ? "No clients found" : "No clients yet"} text={q ? undefined : "Clients are saved automatically when you make a booking."} />
      ) : (
        <Card className="divide-y divide-line">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-peach-50/50">
              <span className="flex size-9 items-center justify-center rounded-full bg-peach-100 text-sm font-medium text-peach-700">{c.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-sm text-muted">{displayPhone(c.phone) || "No phone"}</p>
              </div>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          ))}
        </Card>
      )}

      <AddClient open={addOpen} onClose={() => setAddOpen(false)} branchId={branchId} onSaved={(id) => router.push(`/clients/${id}`)} />
    </div>
  );
}

function AddClient({ open, onClose, branchId, onSaved }: { open: boolean; onClose: () => void; branchId: string; onSaved: (id: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setBirthday("");
      setError(null);
    }
  }, [open]);

  const norm = normalizePhone(phone);

  async function save() {
    setSaving(true);
    setError(null);
    const { data, error } = await supabase()
      .from("clients")
      .insert({ branch_id: branchId, name: name.trim(), phone: norm || null, birthday: birthday || null })
      .select("id")
      .single();
    setSaving(false);
    if (error) return setError(error.code === "23505" ? "A client with this phone number already exists." : error.message);
    onSaved(data.id);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add client">
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Phone" hint={phone && !isValidPkPhone(norm) ? "Enter a full number, e.g. 0300 1234567" : undefined}>
          <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
        </Field>
        <Field label="Birthday (optional)">
          <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </Field>
        <ErrorNote message={error} />
        <Button className="w-full" onClick={save} loading={saving} disabled={!name.trim() || (!!phone && !isValidPkPhone(norm))}>
          Save client
        </Button>
      </div>
    </Modal>
  );
}
