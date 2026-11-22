export const STATUS: Record<string, { label: string; tone: "peach" | "green" | "red" | "gray" }> = {
  booked: { label: "Booked", tone: "peach" },
  completed: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "gray" },
  no_show: { label: "No-show", tone: "red" },
};
