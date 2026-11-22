"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, Users, Scissors, UserRound, Wallet, Plus, LogOut, Menu } from "lucide-react";
import { Logo } from "./logo";
import { useSalon } from "./salon-context";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Calendar", icon: CalendarDays },
  { href: "/bookings", label: "Bookings", icon: ClipboardList },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/services", label: "Services & deals", icon: Scissors },
  { href: "/staff", label: "Staff", icon: UserRound },
  { href: "/sales", label: "Sales", icon: Wallet },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const salon = useSalon();

  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white/70 px-4 py-5 md:flex">
        <div className="px-2">
          <Logo />
          <p className="mt-1 truncate text-xs text-muted">{salon.brandName}</p>
        </div>
        <Link
          href="/bookings/new"
          className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-peach-300 font-medium text-ink hover:bg-peach-400"
        >
          <Plus className="size-4" /> New booking
        </Link>
        <nav className="mt-5 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px]",
                isActive(path, href) ? "bg-peach-100 font-medium text-ink" : "text-muted hover:bg-peach-50 hover:text-ink"
              )}
            >
              <Icon className="size-[18px]" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <p className="truncate px-3 text-xs text-muted">{salon.email}</p>
          <button onClick={signOut} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-muted hover:bg-peach-50 hover:text-ink cursor-pointer">
            <LogOut className="size-[18px]" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <span className="max-w-[45%] truncate text-xs text-muted">{salon.brandName}</span>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <MobileLink href="/" label="Calendar" icon={CalendarDays} active={isActive(path, "/")} />
        <MobileLink href="/clients" label="Clients" icon={Users} active={isActive(path, "/clients")} />
        <Link href="/bookings/new" className="flex flex-col items-center justify-center py-2">
          <span className="flex size-11 items-center justify-center rounded-full bg-peach-300 text-ink shadow-sm">
            <Plus className="size-5" />
          </span>
        </Link>
        <MobileLink href="/sales" label="Sales" icon={Wallet} active={isActive(path, "/sales")} />
        <MobileLink href="/more" label="More" icon={Menu} active={["/more", "/services", "/staff"].some((p) => path.startsWith(p)) || path === "/bookings"} />
      </nav>
    </div>
  );
}

function MobileLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Users; active: boolean }) {
  return (
    <Link href={href} className={cn("flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px]", active ? "text-ink" : "text-muted")}>
      <Icon className={cn("size-5", active && "text-peach-500")} />
      {label}
    </Link>
  );
}
