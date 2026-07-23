"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useStage } from "@/lib/stage-context";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { registerSchema } from "@/lib/validation/schemas";

export default function RegisterPage() {
  const stage = useStage();
  const router = useRouter();
  const [values, setValues] = useState({
    real_name: "",
    display_name: "",
    phone: "",
    password: "",
    emoji: "",
  });
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!stage.registration_open) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <Card>
          <p className="text-lg font-bold">التسجيل مغلق حاليًا في {stage.name}</p>
        </Card>
      </main>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = registerSchema.safeParse({ ...values, extra_fields: extra });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/${stage.slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "حدث خطأ غير متوقع");
        return;
      }
      toast.success("تم إرسال طلب التسجيل بنجاح");
      router.push(`/${stage.slug}/pending`);
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
        <p className="mt-1 text-sm text-[var(--stage-fg)]/60">انضم إلى المنافسة — اختر هويتك المتخفية</p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="الاسم الحقيقي">
            <Input
              value={values.real_name}
              onChange={(e) => setValues((v) => ({ ...v, real_name: e.target.value }))}
              placeholder="الاسم الكامل"
              required
            />
          </Field>

          <Field label="الاسم المستعار (سيمثلك طوال المنافسة)">
            <Input
              value={values.display_name}
              onChange={(e) => setValues((v) => ({ ...v, display_name: e.target.value }))}
              placeholder="مثال: الظل الأزرق"
              required
            />
          </Field>

          <Field label="رقم الجوال">
            <Input
              dir="ltr"
              value={values.phone}
              onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
              placeholder="05xxxxxxxx"
              required
            />
          </Field>

          <Field label="كلمة المرور">
            <Input
              type="password"
              value={values.password}
              onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
              required
            />
          </Field>

          <Field label="أيقونة بطاقتك">
            <EmojiPicker value={values.emoji} onChange={(emoji) => setValues((v) => ({ ...v, emoji }))} />
          </Field>

          {stage.extra_field_defs?.map((def) => (
            <Field key={def.key} label={def.label}>
              <Input
                value={extra[def.key] ?? ""}
                onChange={(e) => setExtra((v) => ({ ...v, [def.key]: e.target.value }))}
                required={def.required}
              />
            </Field>
          ))}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "جارٍ التسجيل..." : "سجّل الآن"}
          </Button>

          <p className="text-center text-xs text-[var(--stage-fg)]/50">
            لديك حساب؟{" "}
            <a href={`/${stage.slug}/login`} className="text-[var(--stage-primary)] underline">
              سجّل الدخول
            </a>
          </p>
        </form>
      </Card>
    </main>
  );
}
