"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase/client";
import type { Category, Deal, DealItem, Group, Level, Service, Staff } from "./types";

export type Catalog = {
  groups: Group[];
  levels: Level[];
  staff: Staff[];
  categories: Category[];
  services: Service[];
  deals: Deal[];
  dealItems: DealItem[];
};

const empty: Catalog = { groups: [], levels: [], staff: [], categories: [], services: [], deals: [], dealItems: [] };

/** Loads everything a salon has set up: staff levels, staff, services and deals. */
export function useCatalog(branchId: string) {
  const [data, setData] = useState<Catalog>(empty);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const sb = supabase();
    const [groups, levels, staff, categories, services, deals, dealItems] = await Promise.all([
      sb.from("service_groups").select("*").eq("branch_id", branchId).order("sort").order("name"),
      sb.from("staff_levels").select("*").eq("branch_id", branchId).order("sort"),
      sb.from("staff").select("*").eq("branch_id", branchId).order("name"),
      sb.from("service_categories").select("*").eq("branch_id", branchId).order("sort").order("name"),
      sb.from("services").select("*").eq("branch_id", branchId).order("price"),
      sb.from("deals").select("*").eq("branch_id", branchId).order("name"),
      sb.from("deal_items").select("*").eq("branch_id", branchId),
    ]);
    setData({
      groups: (groups.data ?? []) as Group[],
      levels: (levels.data ?? []) as Level[],
      staff: (staff.data ?? []) as Staff[],
      categories: (categories.data ?? []) as Category[],
      services: ((services.data ?? []) as Service[]).map((s) => ({ ...s, price: Number(s.price) })),
      deals: ((deals.data ?? []) as Deal[]).map((d) => ({ ...d, price: Number(d.price) })),
      dealItems: (dealItems.data ?? []) as DealItem[],
    });
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...data, loading, reload };
}

export function serviceLabel(s: Service, categories: Category[]) {
  const cat = categories.find((c) => c.id === s.category_id);
  if (!cat) return s.name;
  if (!s.name || s.name.toLowerCase() === "standard") return cat.name;
  return `${cat.name} · ${s.name}`;
}
