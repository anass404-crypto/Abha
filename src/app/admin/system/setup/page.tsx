"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SystemAdminSetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/system/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, setupCode }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "حدث خطأ");
      return;
    }
    router.push("/admin/system/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <img src="/logo-masked.svg" alt="الملثم" className="mx-auto mb-2 h-12 w-12" />
        <h1 className="text-2xl font-black text-amber-400 drop-shadow-[0_0_10px_rgba(255,215,0,0.35)]">الملثم</h1>
        <p className="text-sm text-[var(--stage-fg)]/50">تهيئة مسؤول النظام</p>
      </div>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="البريد الإلكتروني">
            <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="كلمة المرور">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Field label="رمز التهيئة (SYSTEM_ADMIN_SETUP_CODE)">
            <Input value={setupCode} onChange={(e) => setSetupCode(e.target.value)} required />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "جارٍ الإنشاء..." : "إنشاء حساب مسؤول النظام"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
