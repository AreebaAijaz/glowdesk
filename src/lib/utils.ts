export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Normalise a Pakistani phone number to 92XXXXXXXXXX. Returns "" if empty. */
export function normalizePhone(input: string): string {
  let d = (input || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0092")) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = "92" + d.slice(1);
  if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d;
}

export function isValidPkPhone(p: string) {
  return /^92\d{10}$/.test(p);
}

export function displayPhone(p?: string | null) {
  if (!p) return "";
  if (/^92\d{10}$/.test(p)) return `0${p.slice(2, 5)} ${p.slice(5)}`;
  return p;
}

export function rs(n?: number | string | null) {
  const v = Math.round(Number(n || 0));
  return "Rs " + v.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Glowdesk always works in Pakistan time (UTC+05:00, no daylight saving),
 * whatever timezone the phone or computer is set to.
 */
export const TZ = "Asia/Karachi";
const PK_OFFSET = "+05:00";

/** Year, month (1-12), day, hours, minutes of a moment, in Pakistan time */
export function pkParts(d: Date | string = new Date()) {
  const date = typeof d === "string" ? new Date(d) : d;
  const shifted = new Date(date.getTime() + 5 * 3600000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate(), h: shifted.getUTCHours(), min: shifted.getUTCMinutes() };
}

/** yyyy-mm-dd from parts */
export function dateKey(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** yyyy-mm-dd of a moment in Pakistan time (today by default) */
export function toDateStr(d: Date = new Date()) {
  const p = pkParts(d);
  return dateKey(p.y, p.m, p.d);
}

export function addDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return dateKey(y, m, d + days);
}

/** Start/end ISO strings covering one Pakistan day */
export function dayRange(dateStr: string) {
  return { start: new Date(`${dateStr}T00:00:00${PK_OFFSET}`).toISOString(), end: new Date(`${addDays(dateStr, 1)}T00:00:00${PK_OFFSET}`).toISOString() };
}

export function monthRange(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  return { start: new Date(`${dateKey(y, m, 1)}T00:00:00${PK_OFFSET}`).toISOString(), end: new Date(`${dateKey(y, m + 1, 1)}T00:00:00${PK_OFFSET}`).toISOString() };
}

/** Number of days in the month of a yyyy-mm-dd date */
export function daysInMonth(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function combine(dateStr: string, time: string) {
  return new Date(`${dateStr}T${time}:00${PK_OFFSET}`).toISOString();
}

export function timeOf(iso: string) {
  const p = pkParts(iso);
  return `${pad(p.h)}:${pad(p.min)}`;
}

export function fmtTime(isoOrHHMM: string) {
  const d = isoOrHHMM.length <= 5 ? new Date(`2000-01-01T${isoOrHHMM}:00${PK_OFFSET}`) : new Date(isoOrHHMM);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
}

export function fmtDate(dateStrOrIso: string, opts?: Intl.DateTimeFormatOptions) {
  const d = dateStrOrIso.length === 10 ? new Date(`${dateStrOrIso}T12:00:00${PK_OFFSET}`) : new Date(dateStrOrIso);
  return d.toLocaleDateString("en-GB", { ...(opts ?? { weekday: "short", day: "numeric", month: "short" }), timeZone: TZ });
}

export function minutesLabel(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

/** 15-minute slots from 08:00 to 22:45 */
export function timeSlots() {
  const out: string[] = [];
  for (let h = 8; h <= 22; h++) for (let m = 0; m < 60; m += 15) out.push(`${pad(h)}:${pad(m)}`);
  return out;
}

export function nextSlot(now = new Date()) {
  const p = pkParts(now);
  const mins = p.h * 60 + p.min;
  const next = Math.ceil(mins / 15) * 15;
  const clamped = Math.min(Math.max(next, 8 * 60), 22 * 60 + 45);
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function addMinutes(time: string, mins: number) {
  const [h, m] = time.split(":").map(Number);
  const t = Math.min(h * 60 + m + mins, 22 * 60 + 45);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

export function overlaps(aStart: string, aDur: number, bStart: string, bDur: number) {
  const a1 = new Date(aStart).getTime();
  const a2 = a1 + aDur * 60000;
  const b1 = new Date(bStart).getTime();
  const b2 = b1 + bDur * 60000;
  return a1 < b2 && b1 < a2;
}

export function waLink(phone: string, text: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** Whole rupees, never negative (for money inputs) */
export function money(v: string | number) {
  const n = Math.round(Number(v || 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
