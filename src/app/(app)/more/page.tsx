"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardList, LogOut, Scissors, UserRound } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { useSalon } from "@/components/salon-context";
import { supabase } from "@/lib/supabase/client";

export default function MorePage() {
  const salon = useSalon();
  const router = useRouter();

  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const rows = [
    { href: "/bookings", label: "Bookings", icon: ClipboardList },
    { href: "/services", label: "Services & deals", icon: Scissors },
    { href: "/staff", label: "Staff & levels", icon: UserRound },
  ];

  return (
    <div>
      <PageHeader title="More" subtitle={salon.brandName} />
      <Card className="divide-y divide-line">
        {rows.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-4 py-4">
            <Icon className="size-5 text-peach-500" />
            <span className="flex-1">{label}</span>
            <ChevronRight className="size-4 text-muted" />
          </Link>
        ))}
        <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-4 text-left cursor-pointer">
          <LogOut className="size-5 text-muted" />
          <span className="flex-1">Sign out</span>
        </button>
      </Card>
      <p className="mt-3 px-1 text-xs text-muted">Signed in as {salon.email}</p>
    </div>
  );
}
