"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStage } from "@/lib/stage-context";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginSchema } from "@/lib/validation/schemas";

const GENERIC_ERROR = "بيانات الدخول غير صحيحة";

export default function LoginPage() {
  const stage = useStage();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    try {
      const { data: email, error: rpcError } = await supabase.rpc("get_login_email", {
        p_stage_slug: stage.slug,
        p_identifier: parsed.data.identifier,
      });

      if (rpcError || !email) {
        setError(GENERIC_ERROR);
        return;
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: parsed.data.password,
      });
      if (signInError || !signInData.session) {
        setError(GENERIC_ERROR);
        return;
      }

      await supabase
        .from("profiles")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", signInData.user.id);

      router.push(`/${stage.slug}`);
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <img
          src="/logo-masked.svg"
          alt="الملثم"
          className="mx-auto mb-2 h-12 w-12 drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]"
        />
        <h2 className="text-lg font-black text-amber-400">الملثم</h2>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="اسم المستخدم أو رقم الجوال">
            <Input
              dir="ltr"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="p123456 أو 05xxxxxxxx"
              required
            />
          </Field>
          <Field label="كلمة المرور">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "جارٍ الدخول..." : "دخول"}
          </Button>

          <p className="text-center text-xs text-[var(--stage-fg)]/50">
            ليس لديك حساب؟{" "}
            <a href={`/${stage.slug}/register`} className="text-[var(--stage-primary)] underline">
              سجّل الآن
            </a>
          </p>
        </form>
      </Card>
    </main>
  );
}
