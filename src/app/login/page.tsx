"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const missingEnv = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return setError("Email or password is incorrect.");
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,#f9e8df_0%,#fbf8f6_55%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo size="lg" />
          <p className="mt-2 text-sm text-muted">Run your salon, not your notebook.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-line bg-white p-6 shadow-[0_8px_30px_-12px_rgba(201,139,114,0.25)]">
          {missingEnv && <ErrorNote message="Supabase keys are missing. Add them to .env.local and restart." />}
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@salon.com" />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorNote message={error} />
          <Button type="submit" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">Need an account? Contact the Glowdesk team.</p>
      </div>
    </div>
  );
}
