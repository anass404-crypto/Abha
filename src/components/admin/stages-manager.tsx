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
  const [deleteTarget, setDeleteTarget] = useState<Stage | null>(null);

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
              <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => setDeleteTarget(s)}>
                حذف المرحلة
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {adminTarget && <AddStageAdminModal stage={adminTarget} onClose={() => setAdminTarget(null)} />}
      {deleteTarget && (
        <DeleteStageModal
          stage={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => setStages((prev) => prev.filter((s) => s.id !== deleteTarget.id))}
        />
      )}
    </div>
  );
}

async function exportStageData(stage: Stage) {
  const supabase = createClient();

  const [{ data: profiles }, { data: rounds }, { data: badges }] = await Promise.all([
    supabase.from("profiles").select("*").eq("stage_id", stage.id),
    supabase.from("rounds").select("*").eq("stage_id", stage.id),
    supabase.from("badges").select("*").eq("stage_id", stage.id),
  ]);

  const roundIds = (rounds ?? []).map((r) => r.id);
  const studentIds = (profiles ?? []).map((p) => p.id);

  const [{ data: submissions }, { data: revealAttempts }, { data: balanceLedger }, { data: notifications }] =
    await Promise.all([
      roundIds.length
        ? supabase.from("submissions").select("*").in("round_id", roundIds)
        : Promise.resolve({ data: [] }),
      roundIds.length
        ? supabase.from("reveal_attempts").select("*").in("round_id", roundIds)
        : Promise.resolve({ data: [] }),
      supabase.from("balance_ledger").select("*").eq("stage_id", stage.id),
      supabase.from("notifications").select("*").eq("stage_id", stage.id),
    ]);

  const studentBadges = studentIds.length
    ? (await supabase.from("student_badges").select("*").in("student_id", studentIds)).data
    : [];

  const bundle = {
    exported_at: new Date().toISOString(),
    stage,
    profiles,
    rounds,
    badges,
    submissions,
    reveal_attempts: revealAttempts,
    balance_ledger: balanceLedger,
    notifications,
    student_badges: studentBadges,
  };

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stage-${stage.slug}-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function DeleteStageModal({
  stage,
  onClose,
  onDeleted,
}: {
  stage: Stage;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await exportStageData(stage);
      setExported(true);
      toast.success("تم تنزيل نسخة كاملة من بيانات المرحلة");
    } catch {
      toast.error("تعذر تصدير البيانات، حاول مرة أخرى");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_stage_completely", { p_stage_id: stage.id });
    setDeleting(false);
    if (error) {
      toast.error("تعذر حذف المرحلة");
      return;
    }
    toast.success("تم حذف المرحلة نهائيًا");
    onDeleted();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-md">
        <h2 className="mb-2 font-black text-red-400">حذف مرحلة {stage.name} نهائيًا</h2>
        <p className="mb-4 text-sm text-[var(--stage-fg)]/70">
          هذا الإجراء يحذف كل بيانات المرحلة (اللاعبون، الجولات، الإجابات، الأرصدة، محاولات الكشف) نهائيًا ولا يمكن
          التراجع عنه. يجب تصدير نسخة كاملة من البيانات أولًا.
        </p>

        <div className="mb-4 space-y-3">
          <Button variant={exported ? "ghost" : "primary"} className="w-full" disabled={exporting} onClick={handleExport}>
            {exporting ? "جارٍ التصدير..." : exported ? "✅ تم التصدير — صدّر مرة أخرى" : "1) تصدير كل بيانات المرحلة"}
          </Button>

          <Field label={`2) اكتب "${stage.slug}" للتأكيد`}>
            <Input
              dir="ltr"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={!exported}
              placeholder={stage.slug}
            />
          </Field>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={!exported || confirmText !== stage.slug || deleting}
            onClick={handleDelete}
          >
            {deleting ? "جارٍ الحذف..." : "حذف نهائي"}
          </Button>
        </div>
      </Card>
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
