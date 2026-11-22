import { fmtDate, fmtTime, rs } from "./utils";

type Item = { label: string; start_at: string; booked_for: string | null; staff_name?: string | null };

/** The WhatsApp booking confirmation text. One message for the whole visit. */
export function confirmationMessage(opts: { clientName: string; salonName: string; items: Item[]; total: number; advance?: number; due?: number }) {
  const sorted = [...opts.items].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const first = sorted[0]?.start_at;
  const when = first ? `${fmtDate(first, { weekday: "long", day: "numeric", month: "long" })} at ${fmtTime(first)}` : "";
  const name = opts.clientName.split(" ")[0];
  const advance = Number(opts.advance || 0);
  const lines = sorted.map((i) => `• ${i.label}${i.staff_name ? ` (with ${i.staff_name})` : ""}`);
  const money = [`Total: ${rs(opts.total)}`];
  const remaining = opts.due ?? Math.max(opts.total - advance, 0);
  if (advance > 0) money.push(`Advance received: ${rs(advance)}`, `Remaining: ${rs(remaining)}`);
  return [
    `Assalam o Alaikum ${name}!`,
    ``,
    `Your appointment at ${opts.salonName} is confirmed for ${when}:`,
    ...lines,
    ``,
    ...money,
    ``,
    `Please reply if you need to change the time. See you soon!`,
  ].join("\n");
}
