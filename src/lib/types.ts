export type Level = { id: string; branch_id: string; name: string; sort: number; headcount: number | null };
export type Staff = { id: string; branch_id: string; level_id: string | null; name: string; phone: string | null; active: boolean };
export type Group = { id: string; branch_id: string; name: string; sort: number };
export type Category = { id: string; branch_id: string; name: string; sort: number; group_id: string | null };
export type Service = {
  id: string;
  branch_id: string;
  category_id: string;
  name: string;
  level_id: string | null;
  price: number;
  duration_min: number;
  active: boolean;
};
export type Deal = { id: string; branch_id: string; name: string; price: number; active: boolean };
export type DealItem = { id: string; deal_id: string; branch_id: string; service_id: string | null; label: string | null };
export type Client = {
  id: string;
  branch_id: string;
  name: string;
  phone: string | null;
  birthday: string | null;
  notes: string | null;
  created_at: string;
};
export type BookingStatus = "booked" | "completed" | "cancelled" | "no_show";
export type Booking = {
  id: string;
  branch_id: string;
  client_id: string;
  status: BookingStatus;
  is_walk_in: boolean;
  notes: string | null;
  confirmation_sent_at: string | null;
  paid_amount: number | null;
  payment_method: string | null;
  paid_at: string | null;
  advance_amount: number;
  advance_method: string | null;
  discount_amount: number | null;
  created_at: string;
};
export type BookingItem = {
  id: string;
  booking_id: string;
  branch_id: string;
  service_id: string | null;
  deal_id: string | null;
  staff_id: string | null;
  level_id: string | null;
  booked_for: string | null;
  label: string;
  start_at: string;
  duration_min: number;
  price: number;
};

export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "jazzcash", label: "JazzCash" },
  { id: "easypaisa", label: "Easypaisa" },
  { id: "bank", label: "Bank transfer" },
  { id: "other", label: "Other" },
] as const;
