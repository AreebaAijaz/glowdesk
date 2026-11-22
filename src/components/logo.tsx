export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-3xl" : "text-xl";
  const mark = size === "lg" ? 28 : 20;
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold tracking-tight ${text}`}>
      <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 6.2A8 8 0 1 0 17 6.2" stroke="#D8A08A" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="12" cy="13" r="2.6" fill="#E8B8A0" />
      </svg>
      <span>
        <span className="text-peach-400">Glow</span>
        <span className="text-ink">desk</span>
      </span>
    </span>
  );
}
