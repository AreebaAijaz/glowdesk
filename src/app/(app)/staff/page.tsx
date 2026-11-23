"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useSalon } from "@/components/salon-context";
import { useCatalog } from "@/lib/catalog";
import { supabase } from "@/lib/supabase/client";
import { useQueryParam } from "@/lib/use-query";
import { Badge, Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select } from "@/components/ui";
import type { Level, Staff } from "@/lib/types";
import { normalizePhone, displayPhone } from "@/lib/utils";
import { isOwnerLevel } from "@/lib/staffing";

export default function StaffPage() {
  const { branchId } = useSalon();
  const cat = useCatalog(branchId);
  const welcome = useQueryParam("welcome");

  const [levelModal, setLevelModal] = useState<Partial<Level> | null>(null);
  const [staffModal, setStaffModal] = useState<Partial<Staff> | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (cat.loading) return <Loading />;

  return (
    <div>
      {welcome && (
        <Card className="mb-5 border-peach-200 bg-peach-50 p-4">
          <p className="font-medium">Your salon is ready 🎉</p>
          <p className="mt-1 text-sm text-muted">
            <b className="text-ink">Step 1:</b> add your staff below. <b className="text-ink">Step 2:</b>{" "}
            <Link href="/services" className="text-peach-600 underline">add your services</Link>. Then you can make your first booking.
          </p>
        </Card>
      )}

      <PageHeader
        title="Staff"
        subtitle="Owners show by name on the calendar. Everyone else shows by level: Senior, Middle, Junior."
        action={
          <Button variant="secondary" size="sm" onClick={() => setLevelModal({ name: "", headcount: null })}>
            <Plus className="size-4" /> Level
          </Button>
        }
      />

      <div className="space-y-4">
        {cat.levels.map((level) => {
          const people = cat.staff.filter((s) => s.level_id === level.id);
          const activeCount = people.filter((p) => p.active).length;
          return (
            <Card key={level.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setOpen((o) => ({ ...o, [level.id]: !o[level.id] }))} className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer">
                  {open[level.id] ? <ChevronDown className="size-4 text-muted" /> : <ChevronRight className="size-4 text-muted" />}
                  <h2 className="truncate font-semibold">{level.name}</h2>
                  <Badge tone="peach">
                    {activeCount > 0 ? `${activeCount} ${activeCount === 1 ? "person" : "people"}` : level.headcount ? `${level.headcount} (headcount)` : "No one yet"}
                  </Badge>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setLevelModal(level)} aria-label="Edit level">
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => {
                      setOpen((o) => ({ ...o, [level.id]: true }));
                      setStaffModal({ level_id: level.id, name: "", active: true });
                    }} aria-label="Add person">
                    <Plus className="size-4" /> <span className="hidden sm:inline">Person</span>
                  </Button>
                </div>
              </div>
              {open[level.id] && people.length > 0 && (
                <ul className="mt-3 divide-y divide-line pl-6">
                  {people.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2.5">
                      <span className="flex size-8 items-center justify-center rounded-full bg-peach-100 text-sm font-medium text-peach-700">
                        {p.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={p.active ? "" : "text-muted line-through"}>{p.name}</p>
                        {p.phone && <p className="text-xs text-muted">{displayPhone(p.phone)}</p>}
                      </div>
                      {!p.active && <Badge tone="gray">Inactive</Badge>}
                      <Button variant="ghost" size="sm" onClick={() => setStaffModal(p)} aria-label="Edit">
                        <Pencil className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {open[level.id] && people.length === 0 && (
                <p className="mt-2 pl-6 text-sm text-muted">
                  {isOwnerLevel(level) ? "Add each owner by name. Owners show by name on the calendar." : `Add people by name, or tap the pencil to set how many ${level.name}s work here.`}
                </p>
              )}
            </Card>
          );
        })}
        {cat.levels.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted">
            <UserRound className="mx-auto mb-2 size-6 text-peach-400" /> No levels yet. Add your first level.
          </Card>
        )}
      </div>

      <LevelModal value={levelModal} onClose={() => setLevelModal(null)} branchId={branchId} count={cat.levels.length} onSaved={cat.reload} staff={cat.staff} />
      <StaffModal value={staffModal} onClose={() => setStaffModal(null)} branchId={branchId} levels={cat.levels} onSaved={cat.reload} />
    </div>
  );
}

function LevelModal({
  value,
  onClose,
  branchId,
  count,
  onSaved,
  staff,
}: {
  value: Partial<Level> | null;
  onClose: () => void;
  branchId: string;
  count: number;
  onSaved: () => void;
  staff: Staff[];
}) {
  const [name, setName] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | undefined | null>(null);

  // Reset form when a different level is opened
  if (value && lastId !== (value.id ?? "new")) {
    setLastId(value.id ?? "new");
    setName(value.name ?? "");
    setHeadcount(value.headcount ? String(value.headcount) : "");
    setError(null);
  }
  if (!value && lastId !== null) setLastId(null);

  async function save() {
    setSaving(true);
    setError(null);
    const row = { name: name.trim(), headcount: headcount ? Number(headcount) : null };
    const sb = supabase();
    const res = value?.id
      ? await sb.from("staff_levels").update(row).eq("id", value.id)
      : await sb.from("staff_levels").insert({ ...row, branch_id: branchId, sort: count + 1 });
    setSaving(false);
    if (res.error) return setError(res.error.message);
    onSaved();
    onClose();
  }

  async function remove() {
    if (!value?.id) return;
    if (staff.some((s) => s.level_id === value.id)) return setError("Move or remove the people in this level first.");
    setSaving(true);
    const { error } = await supabase().from("staff_levels").delete().eq("id", value.id);
    setSaving(false);
    if (error) return setError(error.message);
    onSaved();
    onClose();
  }

  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit level" : "New level"}>
      <div className="space-y-4">
        <Field label="Level name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior" />
        </Field>
        <Field label="Headcount (optional)" hint="Only needed if you don't list people by name. E.g. 15 Juniors.">
          <Input type="number" min={0} value={headcount} onChange={(e) => setHeadcount(e.target.value)} placeholder="0" />
        </Field>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          {value?.id && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="flex-1" onClick={save} loading={saving} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function StaffModal({
  value,
  onClose,
  branchId,
  levels,
  onSaved,
}: {
  value: Partial<Staff> | null;
  onClose: () => void;
  branchId: string;
  levels: Level[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [levelId, setLevelId] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);

  const key = value ? value.id ?? `new-${value.level_id}` : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (value) {
      setName(value.name ?? "");
      setPhone(value.phone ? displayPhone(value.phone) : "");
      setLevelId(value.level_id ?? levels[0]?.id ?? "");
      setActive(value.active ?? true);
      setError(null);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    const row = { name: name.trim(), phone: normalizePhone(phone) || null, level_id: levelId || null, active };
    const sb = supabase();
    const res = value?.id ? await sb.from("staff").update(row).eq("id", value.id) : await sb.from("staff").insert({ ...row, branch_id: branchId });
    setSaving(false);
    if (res.error) return setError(res.error.message);
    onSaved();
    onClose();
  }

  async function remove() {
    if (!value?.id) return;
    setSaving(true);
    const { error } = await supabase().from("staff").delete().eq("id", value.id);
    setSaving(false);
    if (error) return setError(error.message);
    onSaved();
    onClose();
  }

  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit person" : "Add person"}>
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hira" autoFocus />
        </Field>
        <Field label="Level">
          <Select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Phone (optional)">
          <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
        </Field>
        {value?.id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[#D8A08A]" />
            Currently working here
          </label>
        )}
        <ErrorNote message={error} />
        <div className="flex gap-2">
          {value?.id && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="flex-1" onClick={save} loading={saving} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
