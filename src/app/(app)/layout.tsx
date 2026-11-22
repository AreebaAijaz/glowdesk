"use client";

import { SalonProvider } from "@/components/salon-context";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SalonProvider>
      <AppShell>{children}</AppShell>
    </SalonProvider>
  );
}
