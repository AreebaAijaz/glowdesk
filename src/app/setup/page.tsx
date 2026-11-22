"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { Logo } from "@/components/logo";

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If this account already has a salon, go straight in.
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return router.replace("/login");
      const { data } = await sb.from("memberships").select("brand_id").eq("user_id", auth.user.id).limit(1);
      if (data && data.length) router.replace("/");
    })();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase().rpc("create_salon", { salon_name: name.trim(), branch_name: "Main" });
    setLoading(false);
    if (error) return setError(error.message);
    router.replace("/staff?welcome=1");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,#f9e8df_0%,#fbf8f6_55%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo size="lg" />
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-line bg-white p-6">
          <div>
            <h1 className="text-lg font-semibold">Welcome! Let&apos;s set up your salon</h1>
            <p className="mt-1 text-sm text-muted">This takes about a minute. You can change it later.</p>
          </div>
          <Field label="Salon name">
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Glow Salon, DHA" />
          </Field>
          <ErrorNote message={error} />
          <Button type="submit" className="w-full" loading={loading} disabled={!name.trim()}>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
