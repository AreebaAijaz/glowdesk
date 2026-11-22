import type { Category, Deal, DealItem, Level, Service, Staff } from "./types";
import { serviceLabel } from "./catalog";

/** Owners are shown by name; every other level is shown as one group (Senior, Middle, Junior…). */
export function isOwnerLevel(l: Pick<Level, "name">) {
  return /owner/i.test(l.name);
}

export type AssignOption = { value: string; label: string };

/** Choices for "Done by" on a booking: each owner by name, then each other level. */
export function assignOptions(levels: Level[], staff: Staff[]): AssignOption[] {
  const out: AssignOption[] = [];
  for (const l of levels) {
    const people = staff.filter((s) => s.active && s.level_id === l.id);
    if (isOwnerLevel(l) && people.length) people.forEach((p) => out.push({ value: `staff:${p.id}`, label: p.name }));
    else out.push({ value: `level:${l.id}`, label: l.name });
  }
  return out;
}

/** Pre-select "Done by" from what the salon typed on the service (e.g. "Senior" or an owner's name). */
export function defaultAssign(doneBy: string | null | undefined, levelId: string | null | undefined, levels: Level[], staff: Staff[]) {
  const text = (doneBy || "").trim().toLowerCase();
  if (text) {
    const owner = staff.find((s) => s.active && s.name.trim().toLowerCase() === text && levels.some((l) => l.id === s.level_id && isOwnerLevel(l)));
    if (owner) return `staff:${owner.id}`;
    const lvl = levels.find((l) => l.name.trim().toLowerCase() === text);
    if (lvl) {
      const people = staff.filter((s) => s.active && s.level_id === lvl.id);
      if (isOwnerLevel(lvl) && people.length === 1) return `staff:${people[0].id}`;
      if (!isOwnerLevel(lvl) || people.length === 0) return `level:${lvl.id}`;
    }
  }
  if (levelId) return `level:${levelId}`;
  return "";
}

/** The list of things inside a deal: typed lines and/or saved services. */
export function dealContents(deal: Deal, dealItems: DealItem[], services: Service[], categories: Category[]) {
  return dealItems
    .filter((i) => i.deal_id === deal.id)
    .map((i) => {
      if (i.label) return i.label;
      const s = services.find((x) => x.id === i.service_id);
      return s ? serviceLabel(s, categories) : "";
    })
    .filter(Boolean);
}
