"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Loading } from "./ui";

export type Salon = {
  userId: string;
  email: string;
  brandId: string;
  brandName: string;
  branchId: string;
  branchName: string;
  role: string;
};

const Ctx = createContext<Salon | null>(null);

export function useSalon() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSalon must be used inside SalonProvider");
  return s;
}

export function SalonProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [salon, setSalon] = useState<Salon | null>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return router.replace("/login");

      const { data: m } = await sb
        .from("memberships")
        .select("brand_id, branch_id, role, brands(name)")
        .eq("user_id", auth.user.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (!m) return router.replace("/setup");

      let branchQuery = sb.from("branches").select("id, name").eq("brand_id", m.brand_id);
      if (m.branch_id) branchQuery = branchQuery.eq("id", m.branch_id);
      const { data: branch } = await branchQuery.order("created_at").limit(1).maybeSingle();
      if (!branch) return router.replace("/setup");

      const brands = m.brands as unknown as { name: string } | { name: string }[] | null;
      const brandName = Array.isArray(brands) ? brands[0]?.name : brands?.name;

      setSalon({
        userId: auth.user.id,
        email: auth.user.email ?? "",
        brandId: m.brand_id,
        brandName: brandName ?? "My Salon",
        branchId: branch.id,
        branchName: branch.name,
        role: m.role,
      });
    })();
  }, [router]);

  if (!salon) return <Loading text="Opening your salon…" />;
  return <Ctx.Provider value={salon}>{children}</Ctx.Provider>;
}
