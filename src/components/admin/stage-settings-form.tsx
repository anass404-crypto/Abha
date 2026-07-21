"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import type { Stage } from "@/lib/supabase/database.types";

const TOGGLES: { key: keyof Stage; label: string }[] = [
  { key: "registration_open", label: "التسجيل مفتوح" },
  { key: "auto_approve", label: "اعتماد التسجيل تلقائيًا" },
  { key: "show_leaderboard", label: "إظهار الترتيب" },
  { key: "show_balances", label: "إظهار أرصدة اللاعبين" },
  { key: "enable_risk_indicator", label: "تفعيل مؤشر الخطر" },
  { key: "enable_most_wanted", label: "تفعيل الأكثر طلبًا" },
  { key: "enable_badges", label: "تفعيل الأوسمة" },
  { key: "enable_streak", label: "تفعيل سلسلة الإجابات" },
  { key: "enable_sound_fx", label: "تفعيل المؤثرات الصوتية" },
  { key: "allow_answer_edit", label: "السماح بتعديل الإجابة قبل الإغلاق" },
];

export function StageSettingsForm({ stage: initialStage }: { stage: Stage }) {
  const [stage, setStage] = useState(initialStage);
  const [fields, setFields] = useState(stage.extra_field_defs);
  const [saving, setSaving] = useState(false);

  function toggle(key: keyof Stage) {
    setStage((s) => ({ ...s, [key]: !s[key] }));
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("stages")
      .update({ ...stage, extra_field_defs: fields })
      .eq("id", stage.id);
    setSaving(false);
    if (error) {
      toast.error("تعذر حفظ الإعدادات");
      return;
    }
    toast.success("تم حفظ الإعدادات");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">الإعدادات العامة</h1>

      <Card className="space-y-4">
        <h2 className="text-sm font-bold text-[var(--stage-fg)]/70">الهوية</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المنافسة">
            <Input value={stage.name} onChange={(e) => setStage((s) => ({ ...s, name: e.target.value }))} />
          </Field>
          <Field label="رابط الشعار">
            <Input value={stage.logo_url ?? ""} onChange={(e) => setStage((s) => ({ ...s, logo_url: e.target.value }))} />
          </Field>
          <Field label="اللون الأساسي">
            <Input
              type="color"
              value={stage.colors.primary}
              onChange={(e) => setStage((s) => ({ ...s, colors: { ...s.colors, primary: e.target.value } }))}
            />
          </Field>
          <Field label="اللون الثانوي">
            <Input
              type="color"
              value={stage.colors.secondary}
              onChange={(e) => setStage((s) => ({ ...s, colors: { ...s.colors, secondary: e.target.value } }))}
            />
          </Field>
          <Field label="لون الخلفية">
            <Input
              type="color"
              value={stage.colors.background}
              onChange={(e) => setStage((s) => ({ ...s, colors: { ...s.colors, background: e.target.value } }))}
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-bold text-[var(--stage-fg)]/70">اللعب والنقاط</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="نقاط البداية">
            <Input
              type="number"
              value={stage.starting_balance}
              onChange={(e) => setStage((s) => ({ ...s, starting_balance: Number(e.target.value) }))}
            />
          </Field>
          <Field label="محاولات الكشف الافتراضية">
            <Input
              type="number"
              value={stage.default_reveal_attempts}
              onChange={(e) => setStage((s) => ({ ...s, default_reveal_attempts: Number(e.target.value) }))}
            />
          </Field>
          <Field label="طريقة نشر النتائج">
            <select
              className="w-full rounded-lg border border-[var(--stage-border)] bg-black/20 p-2.5 text-sm"
              value={stage.results_publish_mode}
              onChange={(e) => setStage((s) => ({ ...s, results_publish_mode: e.target.value as Stage["results_publish_mode"] }))}
            >
              <option value="manual">يدويًا</option>
              <option value="auto">تلقائيًا</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--stage-fg)]/70">الأعلام (Feature Flags)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOGGLES.map((t) => (
            <label key={t.key as string} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(stage[t.key])} onChange={() => toggle(t.key)} />
              {t.label}
            </label>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--stage-fg)]/70">حقول تسجيل إضافية</h2>
        {fields.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="المفتاح (grade)"
              value={f.key}
              onChange={(e) => setFields((prev) => prev.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)))}
              className="w-40"
            />
            <Input
              placeholder="التسمية (الصف)"
              value={f.label}
              onChange={(e) => setFields((prev) => prev.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
              className="w-48"
            />
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => setFields((prev) => prev.map((x, idx) => (idx === i ? { ...x, required: e.target.checked } : x)))}
              />
              إلزامي
            </label>
            <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}>
              حذف
            </Button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => setFields((prev) => [...prev, { key: "", label: "", required: false }])}>
          + إضافة حقل
        </Button>
      </Card>

      <Button disabled={saving} onClick={save} className="w-full">
        {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
      </Button>
    </div>
  );
}
