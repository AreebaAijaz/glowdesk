import { overlaps } from "./utils";
import type { Level, Staff } from "./types";

export type Slot = { start_at: string; duration_min: number; staff_id: string | null; level_id: string | null };

/** How many people work at this level: named active staff, or the headcount if none are named. */
export function levelCapacity(levelId: string, levels: Level[], staff: Staff[]) {
  const named = staff.filter((s) => s.active && s.level_id === levelId).length;
  if (named > 0) return named;
  return levels.find((l) => l.id === levelId)?.headcount ?? 0;
}

/** How many people at this level are already busy during the given time. */
export function levelBusy(levelId: string, start: string, dur: number, items: Slot[], staff: Staff[]) {
  const ids = new Set(staff.filter((s) => s.level_id === levelId).map((s) => s.id));
  return items.filter(
    (i) =>
      overlaps(start, dur, i.start_at, i.duration_min) &&
      ((i.staff_id && ids.has(i.staff_id)) || (!i.staff_id && i.level_id === levelId))
  ).length;
}

export function staffBusy(staffId: string, start: string, dur: number, items: Slot[]) {
  return items.some((i) => i.staff_id === staffId && overlaps(start, dur, i.start_at, i.duration_min));
}
