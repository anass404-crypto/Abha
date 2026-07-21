"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import type { Round, Stage } from "@/lib/supabase/database.types";

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  scheduled: "مجدولة",
  open: "مفتوحة",
  closed: "مغلقة",
  calculating: "جارٍ الاحتساب",
  calculated: "محتسبة (معاينة)",
  published: "منشورة",
};

export function RoundsManager({ stage, initialRounds }: { stage: Stage; initialRounds: Round[] }) {
  const [rounds, setRounds] = useState(initialRounds);
  const [showForm, setShowForm] = useState(false);
  const nextNumber = (rounds[0]?.round_number ?? 0) + 1;

  const [form, setForm] = useState({
    round_number: nextNumber,
    title: "",
    question: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    correct_option: "a",
    points: 10,
    reveal_attempts_allowed: stage.default_reveal_attempts,
    reveal_enabled: true,
    opens_at: "",
    closes_at: "",
  });

  async function createRound(e: React.FormEvent) {
    e.preventDefault();
    const options: Record<string, string> = {};
    if (form.optionA) options.a = form.optionA;
    if (form.optionB) options.b = form.optionB;
    if (form.optionC) options.c = form.optionC;
    if (form.optionD) options.d = form.optionD;

    if (!form.opens_at || !form.closes_at) {
      toast.error("حدد وقت الفتح والإغلاق");
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("rounds")
      .insert({
        stage_id: stage.id,
        round_number: form.round_number,
        title: form.title,
        question: form.question,
        options,
        correct_option: form.correct_option,
        points: form.points,
        reveal_attempts_allowed: form.reveal_attempts_allowed,
        reveal_enabled: form.reveal_enabled,
        opens_at: new Date(form.opens_at).toISOString(),
        closes_at: new Date(form.closes_at).toISOString(),
        status: "scheduled",
      })
      .select()
      .single();

    if (error || !data) {
      toast.error("تعذر إنشاء الجولة، تحقق من رقم الجولة");
      return;
    }
    setRounds((prev) => [data, ...prev]);
    setShowForm(false);
    toast.success("تم إنشاء الجولة");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">الأسئلة والجولات</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "إلغاء" : "+ جولة جديدة"}</Button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={createRound} className="grid gap-4 sm:grid-cols-2">
            <Field label="رقم الجولة">
              <Input
                type="number"
                value={form.round_number}
                onChange={(e) => setForm((f) => ({ ...f, round_number: Number(e.target.value) }))}
                required
              />
            </Field>
            <Field label="عنوان الجولة">
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </Field>
            <div className="sm:col-span-2">
              <Field label="السؤال">
                <Input value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} required />
              </Field>
            </div>
            <Field label="الخيار أ"><Input value={form.optionA} onChange={(e) => setForm((f) => ({ ...f, optionA: e.target.value }))} required /></Field>
            <Field label="الخيار ب"><Input value={form.optionB} onChange={(e) => setForm((f) => ({ ...f, optionB: e.target.value }))} required /></Field>
            <Field label="الخيار ج (اختياري)"><Input value={form.optionC} onChange={(e) => setForm((f) => ({ ...f, optionC: e.target.value }))} /></Field>
            <Field label="الخيار د (اختياري)"><Input value={form.optionD} onChange={(e) => setForm((f) => ({ ...f, optionD: e.target.value }))} /></Field>
            <Field label="الإجابة الصحيحة">
              <select
                className="w-full rounded-lg border border-[var(--stage-border)] bg-black/20 p-2.5 text-sm"
                value={form.correct_option}
                onChange={(e) => setForm((f) => ({ ...f, correct_option: e.target.value }))}
              >
                <option value="a">أ</option>
                <option value="b">ب</option>
                {form.optionC && <option value="c">ج</option>}
                {form.optionD && <option value="d">د</option>}
              </select>
            </Field>
            <Field label="نقاط الإجابة الصحيحة">
              <Input type="number" value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: Number(e.target.value) }))} />
            </Field>
            <Field label="عدد محاولات الكشف">
              <Input
                type="number"
                value={form.reveal_attempts_allowed}
                onChange={(e) => setForm((f) => ({ ...f, reveal_attempts_allowed: Number(e.target.value) }))}
              />
            </Field>
            <Field label="تفعيل الكشف في هذه الجولة">
              <select
                className="w-full rounded-lg border border-[var(--stage-border)] bg-black/20 p-2.5 text-sm"
                value={form.reveal_enabled ? "1" : "0"}
                onChange={(e) => setForm((f) => ({ ...f, reveal_enabled: e.target.value === "1" }))}
              >
                <option value="1">مفعّل</option>
                <option value="0">معطّل</option>
              </select>
            </Field>
            <Field label="وقت الفتح">
              <Input type="datetime-local" value={form.opens_at} onChange={(e) => setForm((f) => ({ ...f, opens_at: e.target.value }))} required />
            </Field>
            <Field label="وقت الإغلاق">
              <Input type="datetime-local" value={form.closes_at} onChange={(e) => setForm((f) => ({ ...f, closes_at: e.target.value }))} required />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">
                إنشاء الجولة
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {rounds.map((r) => (
          <Link key={r.id} href={`/${stage.slug}/admin/rounds/${r.id}`}>
            <Card className="flex items-center justify-between transition-colors hover:bg-white/5">
              <div>
                <div className="font-bold">
                  الجولة {r.round_number}: {r.title}
                </div>
                <div className="text-xs text-[var(--stage-fg)]/50">
                  {new Date(r.opens_at).toLocaleString("ar")} → {new Date(r.closes_at).toLocaleString("ar")}
                </div>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{STATUS_LABEL[r.status]}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
