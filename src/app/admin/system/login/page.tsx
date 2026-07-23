"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SystemAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError("بيانات الدخول غير صحيحة");
      return;
    }
    router.push("/admin/system");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <img src="/logo-masked.svg" alt="الملثم" className="mx-auto mb-2 h-12 w-12" />
        <h1 className="text-2xl font-black text-gradient">الملثم</h1>
        <p className="text-sm text-[var(--stage-fg)]/50">دخول مسؤول النظام</p>
      </div>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="البريد الإلكتروني">
            <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="كلمة المرور">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "جارٍ الدخول..." : "دخول"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
