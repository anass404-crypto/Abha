"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import type { Stage } from "@/lib/supabase/database.types";

export function StagesManager({ initialStages }: { initialStages: Stage[] }) {
  const [stages, setStages] = useState(initialStages);
  const [showForm, setShowForm] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [adminTarget, setAdminTarget] = useState<Stage | null>(null);

  async function createStage(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data, error } = await supabase.from("stages").insert({ slug, name }).select().single();
    if (error || !data) {
      toast.error("تعذر إنشاء المرحلة (تحقق من أن الرابط غير مستخدم)");
      return;
    }
    setStages((prev) => [data, ...prev]);
    setShowForm(false);
    setSlug("");
    setName("");
    toast.success("تم إنشاء المرحلة");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">إدارة المراحل والمنافسات</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "إلغاء" : "+ مرحلة جديدة"}</Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={createStage} className="grid gap-4 sm:grid-cols-2">
            <Field label="الرابط (slug) — أحرف إنجليزية وأرقام وشرطات فقط">
              <Input dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="middle-school" required />
            </Field>
            <Field label="اسم المرحلة">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">
                إنشاء
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {stages.map((s) => (
          <Card key={s.id} className="flex items-center justify-between">
            <div>
              <div className="font-bold">{s.name}</div>
              <div className="text-xs text-[var(--stage-fg)]/50" dir="ltr">
                /{s.slug}
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`/${s.slug}/admin`}>
                <Button variant="ghost" className="!px-2 !py-1 text-xs">
                  فتح لوحة المرحلة
                </Button>
              </Link>
              <Button className="!px-2 !py-1 text-xs" onClick={() => setAdminTarget(s)}>
                إضافة مشرف
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {adminTarget && <AddStageAdminModal stage={adminTarget} onClose={() => setAdminTarget(null)} />}
    </div>
  );
}

function AddStageAdminModal({ stage, onClose }: { stage: Stage; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/system/stage-admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: stage.id, email, password, display_name: displayName }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast.error(json.error ?? "تعذر إنشاء المشرف");
      return;
    }
    toast.success("تم إنشاء حساب المشرف");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-sm">
        <h2 className="mb-4 font-black">مشرف جديد لمرحلة {stage.name}</h2>
        <form onSubmit={submit} className="space-y-3">
          <Field label="اسم المشرف">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </Field>
          <Field label="البريد الإلكتروني">
            <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="كلمة المرور">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "جارٍ الإنشاء..." : "إنشاء"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
