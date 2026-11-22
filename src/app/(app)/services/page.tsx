"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useSalon } from "@/components/salon-context";
import { useCatalog, serviceLabel, type Catalog } from "@/lib/catalog";
import { dealContents } from "@/lib/staffing";
import { supabase } from "@/lib/supabase/client";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import type { Category, Deal, Group, Service } from "@/lib/types";
import { cn, rs } from "@/lib/utils";

export default function ServicesPage() {
  const { branchId } = useSalon();
  const cat = useCatalog(branchId);
  const [tab, setTab] = useState<"services" | "deals">("services");
  const [groupModal, setGroupModal] = useState<Partial<Group> | null>(null);
  const [catModal, setCatModal] = useState<Partial<Category> | null>(null);
  const [svcModal, setSvcModal] = useState<Partial<Service> | null>(null);
  const [dealModal, setDealModal] = useState<Partial<Deal> | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (cat.loading) return <Loading />;

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const ungrouped = cat.categories.filter((c) => !c.group_id || !cat.groups.some((g) => g.id === c.group_id));
  const sections: { id: string; group: Group | null; title: string; items: Category[] }[] = [
    ...cat.groups.map((g) => ({ id: g.id, group: g, title: g.name, items: cat.categories.filter((c) => c.group_id === g.id) })),
    ...(ungrouped.length ? [{ id: "other", group: null, title: cat.groups.length ? "Other services" : "Services", items: ungrouped }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Services & deals"
        subtitle="Make groups (e.g. Makeup), add services inside (e.g. Bridal Makeup), then a price for who does it."
        action={
          tab === "services" ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setGroupModal({ name: "" })}>
                <Plus className="size-4" /> Group
              </Button>
              <Button size="sm" onClick={() => setCatModal({ name: "", group_id: cat.groups[0]?.id ?? null })}>
                <Plus className="size-4" /> Service
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setDealModal({ name: "", price: 0, active: true })}>
              <Plus className="size-4" /> Deal
            </Button>
          )
        }
      />

      <div className="mb-5 inline-flex rounded-xl border border-line bg-white p-1">
        {(["services", "deals"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("rounded-lg px-4 py-1.5 text-sm capitalize cursor-pointer", tab === t ? "bg-peach-100 font-medium text-ink" : "text-muted")}
          >
            {t} {t === "services" ? `(${cat.categories.length})` : `(${cat.deals.length})`}
          </button>
        ))}
      </div>

      {tab === "services" ? (
        <div className="space-y-3">
          {sections.length === 0 && (
            <Empty
              title="No services yet"
              text="Start with a group like Makeup, Hair or Facials, then add services inside it."
              action={<Button onClick={() => setGroupModal({ name: "" })}>Add first group</Button>}
            />
          )}
          {sections.map((sec) => {
            const isOpen = open[sec.id] ?? false;
            return (
              <Card key={sec.id} className="overflow-hidden">
                <div className="flex items-center gap-2 p-3 pl-4">
                  <button onClick={() => toggle(sec.id)} className="flex flex-1 items-center gap-2.5 text-left cursor-pointer">
                    {isOpen ? <ChevronDown className="size-4 text-muted" /> : <ChevronRight className="size-4 text-muted" />}
                    <FolderOpen className="size-4 text-peach-500" />
                    <span className="font-semibold">{sec.title}</span>
                    <Badge tone="peach">
                      {sec.items.length} {sec.items.length === 1 ? "service" : "services"}
                    </Badge>
                  </button>
                  {sec.group && (
                    <Button variant="ghost" size="sm" onClick={() => setGroupModal(sec.group!)} aria-label="Edit group">
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setOpen((o) => ({ ...o, [sec.id]: true }));
                      setCatModal({ name: "", group_id: sec.group?.id ?? null });
                    }}
                  >
                    <Plus className="size-4" /> Service
                  </Button>
                </div>

                {isOpen && (
                  <div className="space-y-2 border-t border-line bg-canvas/50 p-3">
                    {sec.items.length === 0 && <p className="px-1 py-2 text-sm text-muted">No services in this group yet.</p>}
                    {sec.items.map((c) => {
                      const prices = cat.services.filter((s) => s.category_id === c.id);
                      return (
                        <div key={c.id} className="rounded-xl border border-line bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <button onClick={() => toggle(`cat-${c.id}`)} className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer">
                              {open[`cat-${c.id}`] ? <ChevronDown className="size-4 shrink-0 text-muted" /> : <ChevronRight className="size-4 shrink-0 text-muted" />}
                              <span className="truncate font-medium">{c.name}</span>
                              <span className="shrink-0 text-xs text-muted">
                                {prices.length === 0 ? "No price yet" : prices.length === 1 ? rs(prices[0].price) : `${prices.length} prices · from ${rs(Math.min(...prices.map((p) => p.price)))}`}
                              </span>
                            </button>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setCatModal(c)} aria-label="Edit service">
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setOpen((o) => ({ ...o, [`cat-${c.id}`]: true }));
                                  setSvcModal({ category_id: c.id, name: "", price: 0, active: true });
                                }}
                              >
                                <Plus className="size-4" /> Price
                              </Button>
                            </div>
                          </div>
                          {!open[`cat-${c.id}`] ? null : prices.length === 0 ? (
                            <p className="mt-1 pl-6 text-sm text-muted">Add a price, e.g. done by Senior Rs 25,000.</p>
                          ) : (
                            <ul className="mt-1 divide-y divide-line pl-6">
                              {prices.map((s) => (
                                <li key={s.id} className="flex items-center gap-3 py-2">
                                  <p className={cn("min-w-0 flex-1 text-[15px]", !s.active && "text-muted line-through")}>
                                    {s.name ? (
                                      <>
                                        <span className="text-muted">Done by </span>
                                        {s.name}
                                      </>
                                    ) : (
                                      <span className="text-muted">Standard price</span>
                                    )}
                                  </p>
                                  <span className="font-medium">{rs(s.price)}</span>
                                  <Button variant="ghost" size="sm" onClick={() => setSvcModal(s)} aria-label="Edit price">
                                    <Pencil className="size-4" />
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {cat.deals.length === 0 && (
            <Empty
              title="No deals yet"
              text='Bundle services at a fixed price, e.g. "Deal 2: Hydra Glow Facial + Half arm wax + Manicure".'
              action={<Button onClick={() => setDealModal({ name: "", price: 0, active: true })}>Add first deal</Button>}
            />
          )}
          {cat.deals.map((d) => {
            const contents = dealContents(d, cat.dealItems, cat.services, cat.categories);
            return (
              <Card key={d.id} className="flex items-start gap-3 p-4">
                <Tag className="mt-0.5 size-5 shrink-0 text-peach-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{d.name}</p>
                    {!d.active && <Badge tone="gray">Off</Badge>}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm text-muted">
                    {contents.map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                  </ul>
                </div>
                <p className="font-medium">{rs(d.price)}</p>
                <Button variant="ghost" size="sm" onClick={() => setDealModal(d)} aria-label="Edit deal">
                  <Pencil className="size-4" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <GroupModal value={groupModal} onClose={() => setGroupModal(null)} branchId={branchId} count={cat.groups.length} onSaved={cat.reload} />
      <CategoryModal value={catModal} onClose={() => setCatModal(null)} branchId={branchId} cat={cat} />
      <ServiceModal value={svcModal} onClose={() => setSvcModal(null)} branchId={branchId} cat={cat} />
      <DealModal value={dealModal} onClose={() => setDealModal(null)} branchId={branchId} cat={cat} />
    </div>
  );
}

function useReset<T>(value: T | null, key: string | null, reset: (v: T) => void) {
  const [last, setLast] = useState<string | null>(null);
  if (key !== last) {
    setLast(key);
    if (value) reset(value);
  }
}

function GroupModal({ value, onClose, branchId, count, onSaved }: { value: Partial<Group> | null; onClose: () => void; branchId: string; count: number; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useReset(value, value ? value.id ?? "new" : null, (v) => {
    setName(v.name ?? "");
    setError(null);
    setConfirmDelete(false);
  });

  async function save() {
    setSaving(true);
    const sb = supabase();
    const res = value?.id
      ? await sb.from("service_groups").update({ name: name.trim() }).eq("id", value.id)
      : await sb.from("service_groups").insert({ name: name.trim(), branch_id: branchId, sort: count + 1 });
    setSaving(false);
    if (res.error) return setError(res.error.message);
    onSaved();
    onClose();
  }
  async function remove() {
    if (!value?.id) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setSaving(true);
    const { error } = await supabase().from("service_groups").delete().eq("id", value.id);
    setSaving(false);
    if (error) return setError(error.message);
    onSaved();
    onClose();
  }

  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit group" : "New group"}>
      <div className="space-y-4">
        <Field label="Group name" hint="E.g. Makeup, Hair, Facials, Waxing, Nails.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Makeup" autoFocus />
        </Field>
        {confirmDelete && <p className="text-sm text-muted">Its services won&apos;t be deleted. They move to &quot;Other services&quot;.</p>}
        <ErrorNote message={error} />
        <div className="flex gap-2">
          {value?.id && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              <Trash2 className="size-4" /> {confirmDelete && "Yes, delete group"}
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

function CategoryModal({ value, onClose, branchId, cat }: { value: Partial<Category> | null; onClose: () => void; branchId: string; cat: Catalog & { reload: () => void } }) {
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useReset(value, value ? value.id ?? `new-${value.group_id}` : null, (v) => {
    setName(v.name ?? "");
    setGroupId(v.group_id ?? "");
    setError(null);
    setConfirmDelete(false);
  });

  async function save() {
    setSaving(true);
    const sb = supabase();
    const row = { name: name.trim(), group_id: groupId || null };
    const res = value?.id
      ? await sb.from("service_categories").update(row).eq("id", value.id)
      : await sb.from("service_categories").insert({ ...row, branch_id: branchId, sort: cat.categories.length + 1 });
    setSaving(false);
    if (res.error) return setError(res.error.message);
    cat.reload();
    onClose();
  }
  async function remove() {
    if (!value?.id) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setSaving(true);
    const { error } = await supabase().from("service_categories").delete().eq("id", value.id);
    setSaving(false);
    if (error) return setError(error.message);
    cat.reload();
    onClose();
  }

  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit service" : "New service"}>
      <div className="space-y-4">
        <Field label="Service name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bridal Makeup" autoFocus />
        </Field>
        <Field label="Group">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {cat.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          {value?.id && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              <Trash2 className="size-4" /> {confirmDelete && "Delete with its prices?"}
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

function ServiceModal({ value, onClose, branchId, cat }: { value: Partial<Service> | null; onClose: () => void; branchId: string; cat: Catalog & { reload: () => void } }) {
  const [doneBy, setDoneBy] = useState("");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useReset(value, value ? value.id ?? `new-${value.category_id}` : null, (v) => {
    setDoneBy(v.name && v.name.toLowerCase() !== "standard" ? v.name : "");
    setPrice(v.price ? String(v.price) : "");
    setActive(v.active ?? true);
    setError(null);
  });
  const category = cat.categories.find((c) => c.id === value?.category_id);

  async function save() {
    setSaving(true);
    const row = { name: doneBy.trim(), price: Number(price || 0), active };
    const sb = supabase();
    const res = value?.id
      ? await sb.from("services").update(row).eq("id", value.id)
      : await sb.from("services").insert({ ...row, branch_id: branchId, category_id: value!.category_id, duration_min: 60 });
    setSaving(false);
    if (res.error) return setError(res.error.message);
    cat.reload();
    onClose();
  }
  async function remove() {
    if (!value?.id) return;
    setSaving(true);
    const { error } = await supabase().from("services").delete().eq("id", value.id);
    setSaving(false);
    if (error) return setError(error.message);
    cat.reload();
    onClose();
  }

  return (
    <Modal open={!!value} onClose={onClose} title={`${value?.id ? "Edit" : "Add"} price${category ? ` · ${category.name}` : ""}`}>
      <div className="space-y-4">
        <Field label="Done by" hint="Type who does it, e.g. Senior, Junior or the owner's name. Leave empty if there is one price.">
          <Input value={doneBy} onChange={(e) => setDoneBy(e.target.value)} placeholder="e.g. Senior" autoFocus />
        </Field>
        <Field label="Price (Rs)">
          <Input type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </Field>
        {value?.id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[#D8A08A]" />
            Available for booking
          </label>
        )}
        <ErrorNote message={error} />
        <div className="flex gap-2">
          {value?.id && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="flex-1" onClick={save} loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DealModal({ value, onClose, branchId, cat }: { value: Partial<Deal> | null; onClose: () => void; branchId: string; cat: Catalog & { reload: () => void } }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useReset(value, value ? value.id ?? "new" : null, (v) => {
    const items = v.id ? cat.dealItems.filter((i) => i.deal_id === v.id) : [];
    setName(v.name ?? "");
    setPrice(v.price ? String(v.price) : "");
    setActive(v.active ?? true);
    setTyped(
      items
        .filter((i) => !i.service_id && i.label)
        .map((i) => i.label)
        .join("\n")
    );
    setPicked(items.filter((i) => i.service_id).map((i) => i.service_id as string));
    setError(null);
  });

  const lines = typed
    .split("\n")
    .map((l) => l.replace(/^[\s•*\-]+/, "").trim())
    .filter(Boolean);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const sb = supabase();
    const row = { name: name.trim(), price: Number(price || 0), active };
    let dealId = value?.id;
    if (dealId) {
      const { error } = await sb.from("deals").update(row).eq("id", dealId);
      if (error) return (setSaving(false), setError(error.message));
      await sb.from("deal_items").delete().eq("deal_id", dealId);
    } else {
      const { data, error } = await sb.from("deals").insert({ ...row, branch_id: branchId }).select("id").single();
      if (error) return (setSaving(false), setError(error.message));
      dealId = data.id;
    }
    const rows = [
      ...lines.map((label) => ({ deal_id: dealId, branch_id: branchId, service_id: null, label })),
      ...picked.map((service_id) => ({ deal_id: dealId, branch_id: branchId, service_id, label: null })),
    ];
    if (rows.length) {
      const { error } = await sb.from("deal_items").insert(rows);
      if (error) return (setSaving(false), setError(error.message));
    }
    setSaving(false);
    cat.reload();
    onClose();
  }
  async function remove() {
    if (!value?.id) return;
    setSaving(true);
    const { error } = await supabase().from("deals").delete().eq("id", value.id);
    setSaving(false);
    if (error) return setError(error.message);
    cat.reload();
    onClose();
  }

  const hasServices = cat.services.some((s) => s.active);

  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit deal" : "New deal"} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deal name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Deal 2" autoFocus />
          </Field>
          <Field label="Deal price (Rs)">
            <Input type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <Field label="What's included" hint="Type one item per line.">
          <Textarea value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={"Hydra Glow Facial\nHalf arm wax\nFull hands manicure"} className="min-h-28" />
        </Field>
        {hasServices && (
          <div>
            <p className="mb-2 text-sm font-medium">
              You can also pick from your services <span className="font-normal text-muted">(optional)</span>
            </p>
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border border-line p-3">
              {cat.categories.map((c) => {
                const items = cat.services.filter((s) => s.category_id === c.id && s.active);
                if (!items.length) return null;
                return (
                  <div key={c.id} className="flex flex-wrap gap-2">
                    {items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggle(s.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm cursor-pointer",
                          picked.includes(s.id) ? "border-peach-400 bg-peach-100 text-ink" : "border-line bg-white text-muted hover:border-peach-200"
                        )}
                      >
                        {serviceLabel(s, cat.categories)}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {value?.id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[#D8A08A]" />
            Deal is active
          </label>
        )}
        <ErrorNote message={error} />
        <div className="flex gap-2">
          {value?.id && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="flex-1" onClick={save} loading={saving} disabled={!name.trim() || (lines.length === 0 && picked.length === 0)}>
            Save deal
          </Button>
        </div>
      </div>
    </Modal>
  );
}
