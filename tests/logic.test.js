const assert = require("assert");
const { bookingMoney } = require("./lib/money");
const { salesByDay, cashReceived } = require("./lib/sales");
const u = require("./lib/utils");
const av = require("./lib/availability");
const { confirmationMessage } = require("./lib/message");
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n     " + e.message); } }

console.log("Money rules (bookingMoney)");
t("booked, advance 40k of 75k → due 35k, nothing earned, 75k upcoming", () => {
  const m = bookingMoney({ status: "booked", advance_amount: 40000, paid_amount: null }, 75000);
  assert.deepStrictEqual([m.received, m.due, m.earned, m.upcoming], [40000, 35000, 0, 75000]);
});
t("completed after paying balance → earned 75k, due 0", () => {
  const m = bookingMoney({ status: "completed", advance_amount: 40000, paid_amount: 35000 }, 75000);
  assert.deepStrictEqual([m.received, m.due, m.earned, m.upcoming], [75000, 0, 75000, 0]);
});
t("completed with discount (paid less) → earned = actual money", () => {
  const m = bookingMoney({ status: "completed", advance_amount: 5000, paid_amount: 10000 }, 20000);
  assert.deepStrictEqual([m.earned, m.due], [15000, 0]);
});
t("cancelled → advance kept as earned, due written off", () => {
  const m = bookingMoney({ status: "cancelled", advance_amount: 40000, paid_amount: null }, 75000);
  assert.deepStrictEqual([m.received, m.due, m.earned, m.upcoming], [40000, 0, 40000, 0]);
});
t("no-show → advance kept, no due until rescheduled", () => {
  const m = bookingMoney({ status: "no_show", advance_amount: 10000, paid_amount: null }, 30000);
  assert.deepStrictEqual([m.earned, m.due], [10000, 0]);
});
t("no advance, booked → due = total", () => {
  const m = bookingMoney({ status: "booked", advance_amount: 0, paid_amount: null }, 3500);
  assert.strictEqual(m.due, 3500);
});
t("advance larger than total never makes due negative", () => {
  const m = bookingMoney({ status: "booked", advance_amount: 9000, paid_amount: null }, 5000);
  assert.strictEqual(m.due, 0);
});
t("string numbers from database are handled", () => {
  const m = bookingMoney({ status: "booked", advance_amount: "1500", paid_amount: null }, 4000);
  assert.strictEqual(m.due, 2500);
});

console.log("Sales by appointment day (salesByDay)");
const b = (status, adv, paid) => ({ status, advance_amount: adv, paid_amount: paid });
const items = [
  // booking A: two items on 27 Nov 17:30 PKT (12:30Z), booked, advance 40k
  { booking_id: "A", price: 50000, start_at: "2026-11-27T12:30:00+00:00", bookings: b("booked", 40000, null) },
  { booking_id: "A", price: 25000, start_at: "2026-11-27T12:30:00+00:00", bookings: b("booked", 40000, null) },
  // booking B: completed on 22 Nov
  { booking_id: "B", price: 3500, start_at: "2026-11-22T06:00:00+00:00", bookings: b("completed", 0, 3500) },
  // booking C: cancelled on 22 Nov with 2000 advance
  { booking_id: "C", price: 12000, start_at: "2026-11-22T09:00:00+00:00", bookings: b("cancelled", 2000, null) },
  // booking D: 00:30 PKT on 23 Nov = 19:30Z on 22 Nov → must count on 23 Nov (local)
  { booking_id: "D", price: 1000, start_at: "2026-11-22T19:30:00+00:00", bookings: b("completed", 0, 1000) },
];
const days = salesByDay(items);
t("27 Nov: 0 done, 75k upcoming, 40k advance paid, 35k to collect, 1 booking", () => {
  assert.deepStrictEqual(days.get("2026-11-27"), { day: "2026-11-27", done: 0, upcoming: 75000, paidAhead: 40000, toCollect: 35000, bookings: 1 });
});
t("22 Nov: done 3,500 + kept advance 2,000 = 5,500, 2 bookings", () => {
  const d = days.get("2026-11-22");
  assert.deepStrictEqual([d.done, d.upcoming, d.bookings], [5500, 0, 2]);
});
t("booking just after midnight Pakistan time counts on the next local day", () => {
  assert.strictEqual(days.get("2026-11-23").done, 1000);
});

console.log("Cash received (cashReceived)");
const { start, end } = u.dayRange("2026-11-22");
const rows = [
  { created_at: "2026-11-22T05:00:00.123456+00:00", status: "booked", advance_amount: 40000, advance_method: "cash", paid_amount: null, payment_method: null, paid_at: null },
  { created_at: "2026-11-20T05:00:00+00:00", status: "completed", advance_amount: 5000, advance_method: "jazzcash", paid_amount: 7000, payment_method: "card", paid_at: "2026-11-22T10:00:00+00:00" },
  { created_at: "2026-11-22T08:00:00+00:00", status: "cancelled", advance_amount: 2000, advance_method: "easypaisa", paid_amount: null, payment_method: null, paid_at: null },
  { created_at: "2026-11-21T18:59:00+00:00", status: "booked", advance_amount: 999, advance_method: "cash", paid_amount: null, payment_method: null, paid_at: null }, // 23:59 PKT on 21st → not today
];
const c = cashReceived(rows, start, end);
t("today's cash = 40k advance + 7k balance + 2k advance from a cancelled booking = 49k", () => assert.strictEqual(c.total, 49000));
t("old advance from another day is not counted today", () => assert.ok(!c.byMethod.has("jazzcash")));
t("split by method is right", () => assert.deepStrictEqual(Object.fromEntries(c.byMethod), { cash: 40000, card: 7000, easypaisa: 2000 }));

console.log("Phone numbers");
t("0300 1234567 → 923001234567", () => assert.strictEqual(u.normalizePhone("0300 1234567"), "923001234567"));
t("+92 300-1234567 → 923001234567", () => assert.strictEqual(u.normalizePhone("+92 300-1234567"), "923001234567"));
t("3001234567 → 923001234567", () => assert.strictEqual(u.normalizePhone("3001234567"), "923001234567"));
t("00923001234567 → 923001234567", () => assert.strictEqual(u.normalizePhone("00923001234567"), "923001234567"));
t("short number is invalid", () => assert.strictEqual(u.isValidPkPhone(u.normalizePhone("0300123")), false));
t("display 923001234567 → 0300 1234567", () => assert.strictEqual(u.displayPhone("923001234567"), "0300 1234567"));

console.log("Dates (Pakistan time)");
t("dayRange covers local midnight to midnight", () => {
  const r = u.dayRange("2026-11-22");
  assert.deepStrictEqual([r.start, r.end], ["2026-11-21T19:00:00.000Z", "2026-11-22T19:00:00.000Z"]);
});
t("monthRange for 30-day month", () => {
  const r = u.monthRange("2026-11-15");
  assert.deepStrictEqual([r.start, r.end], ["2026-10-31T19:00:00.000Z", "2026-11-30T19:00:00.000Z"]);
});
t("addDays crosses month end", () => assert.strictEqual(u.addDays("2026-11-30", 1), "2026-12-01"));
t("combine date+time → correct UTC", () => assert.strictEqual(u.combine("2026-11-27", "17:30"), "2026-11-27T12:30:00.000Z"));
t("rs formats with commas", () => assert.strictEqual(u.rs(75000), "Rs 75,000"));

console.log("Staff availability");
const levels = [{ id: "jr", name: "Junior", headcount: 5 }, { id: "sr", name: "Senior", headcount: null }];
const staff = [{ id: "s1", level_id: "sr", active: true, name: "Misbah" }, { id: "s2", level_id: "sr", active: true, name: "Sara" }];
const at = "2026-11-27T12:30:00.000Z";
t("headcount used when no named Juniors → 5", () => assert.strictEqual(av.levelCapacity("jr", levels, staff), 5));
t("named Seniors counted → 2", () => assert.strictEqual(av.levelCapacity("sr", levels, staff), 2));
t("one Senior busy at the same time → 1 busy", () => assert.strictEqual(av.levelBusy("sr", at, 60, [{ start_at: at, duration_min: 60, staff_id: "s1", level_id: "sr" }], staff), 1));
t("booking that ends exactly when the next starts is not a clash", () => assert.strictEqual(av.staffBusy("s1", at, 60, [{ start_at: "2026-11-27T11:30:00.000Z", duration_min: 60, staff_id: "s1", level_id: null }]), false));

console.log("WhatsApp message");
const msg = confirmationMessage({ clientName: "Areeba Aijaz", salonName: "Glow Salon", total: 75000, advance: 40000, items: [{ label: "Bridal Makeup · Senior", start_at: at, booked_for: null, staff_name: null }] });
t("greets by first name, shows total, advance and remaining", () => {
  assert.ok(msg.startsWith("Assalam o Alaikum Areeba!"));
  assert.ok(msg.includes("Total: Rs 75,000") && msg.includes("Advance received: Rs 40,000") && msg.includes("Remaining: Rs 35,000"));
});
t("no 4-byte emoji (they break on wa.me)", () => assert.ok(!/[\u{10000}-\u{10FFFF}]/u.test(msg)));

console.log("Pakistan time regardless of device timezone");
t("toDateStr of 23:30 PKT is still the same PK day", () => assert.strictEqual(u.toDateStr(new Date("2026-11-22T18:30:00Z")), "2026-11-22"));
t("toDateStr of 00:30 PKT is the next PK day", () => assert.strictEqual(u.toDateStr(new Date("2026-11-22T19:30:00Z")), "2026-11-23"));
t("timeOf shows PK clock time", () => assert.strictEqual(u.timeOf("2026-11-27T12:30:00.000Z"), "17:30"));
t("fmtTime shows PK clock time", () => assert.strictEqual(u.fmtTime("2026-11-27T12:30:00.000Z"), "5:30 PM"));
t("daysInMonth Feb 2027 = 28", () => assert.strictEqual(u.daysInMonth("2027-02-10"), 28));
t("dateKey rolls months", () => assert.strictEqual(u.dateKey(2026, 13, 1), "2027-01-01"));
t("money(): whole rupees, never negative", () => assert.deepStrictEqual([u.money("100.6"), u.money(-50), u.money(""), u.money("abc")], [101, 0, 0, 0]));
t("message 'Remaining' uses the real due", () => {
  const m2 = confirmationMessage({ clientName: "Sana", salonName: "S", total: 10000, advance: 2000, due: 0, items: [] });
  assert.ok(m2.includes("Remaining: Rs 0"));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
