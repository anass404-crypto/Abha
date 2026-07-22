"use client";

import { useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import type { Round, Stage } from "@/lib/supabase/database.types";

const CORRECT_LETTER_MAP: Record<string, string> = {
  أ: "a",
  ب: "b",
  ج: "c",
  د: "d",
  a: "a",
  b: "b",
  c: "c",
  d: "d",
};

function parseYesNo(value: unknown, fallback: boolean): boolean {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return s === "نعم" || s === "yes" || s === "true" || s === "1";
}

function parseImportDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value).trim().replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

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
  const [importing, setImporting] = useState(false);
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
    scheduled: false,
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

    if (form.scheduled && (!form.opens_at || !form.closes_at)) {
      toast.error("حدد وقت الفتح والإغلاق، أو ألغِ تفعيل الجدولة للتحكم اليدوي");
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
        opens_at: form.scheduled ? new Date(form.opens_at).toISOString() : null,
        closes_at: form.scheduled ? new Date(form.closes_at).toISOString() : null,
        status: form.scheduled ? "scheduled" : "draft",
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

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const errors: string[] = [];
      const inserts: Partial<Round>[] = [];

      sheetRows.forEach((row, i) => {
        const line = i + 2; // header occupies row 1
        const roundNumber = Number(row["رقم الجولة"]);
        const title = String(row["عنوان الجولة"] ?? "").trim();
        const question = String(row["السؤال"] ?? "").trim();
        const optionA = String(row["الخيار أ"] ?? "").trim();
        const optionB = String(row["الخيار ب"] ?? "").trim();
        const optionC = String(row["الخيار ج"] ?? "").trim();
        const optionD = String(row["الخيار د"] ?? "").trim();
        const correctRaw = String(row["الإجابة الصحيحة"] ?? "").trim();

        if (!roundNumber || !title || !question || !optionA || !optionB) {
          if (!roundNumber && !title && !question && !optionA && !optionB) return; // fully blank row, skip silently
          errors.push(`صف ${line}: رقم الجولة والعنوان والسؤال والخيارين أ/ب كلها مطلوبة`);
          return;
        }

        const options: Record<string, string> = { a: optionA, b: optionB };
        if (optionC) options.c = optionC;
        if (optionD) options.d = optionD;

        const correct = CORRECT_LETTER_MAP[correctRaw] ?? CORRECT_LETTER_MAP[correctRaw.toLowerCase()];
        if (!correct || !options[correct]) {
          errors.push(`صف ${line}: الإجابة الصحيحة "${correctRaw}" غير صالحة أو لا تطابق خيارًا معبّأً`);
          return;
        }

        const scheduled = parseYesNo(row["جدول زمني؟"], false);
        let opensAt: string | null = null;
        let closesAt: string | null = null;
        if (scheduled) {
          opensAt = parseImportDate(row["وقت الفتح"]);
          closesAt = parseImportDate(row["وقت الإغلاق"]);
          if (!opensAt || !closesAt) {
            errors.push(`صف ${line}: حدد وقت الفتح والإغلاق بصيغة صحيحة لأن "جدول زمني؟" = نعم`);
            return;
          }
        }

        inserts.push({
          stage_id: stage.id,
          round_number: roundNumber,
          title,
          question,
          options,
          correct_option: correct,
          points: row["النقاط"] !== "" ? Number(row["النقاط"]) : 10,
          reveal_attempts_allowed:
            row["عدد محاولات الكشف"] !== "" ? Number(row["عدد محاولات الكشف"]) : stage.default_reveal_attempts,
          reveal_enabled: parseYesNo(row["تفعيل الكشف"], true),
          opens_at: opensAt,
          closes_at: closesAt,
          status: scheduled ? "scheduled" : "draft",
        } as Partial<Round>);
      });

      if (errors.length > 0) {
        toast.error(`تعذر الاستيراد (${errors.length} خطأ): ${errors.slice(0, 4).join(" | ")}`);
        return;
      }
      if (inserts.length === 0) {
        toast.error("لم يتم العثور على أي صفوف صالحة في الملف");
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase.from("rounds").insert(inserts).select();
      if (error || !data) {
        toast.error(
          error?.message.includes("duplicate") || error?.message.includes("unique")
            ? "تعذر الاستيراد — رقم جولة مكرر (موجود مسبقًا أو مكرر داخل الملف)"
            : "تعذر استيراد الجولات، تحقق من البيانات"
        );
        return;
      }

      setRounds((prev) => [...data, ...prev].sort((a, b) => b.round_number - a.round_number));
      toast.success(`تم استيراد ${data.length} جولة بنجاح`);
    } catch {
      toast.error("تعذر قراءة الملف — تأكد أنه بصيغة Excel (.xlsx) صحيحة");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">الأسئلة والجولات</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "إلغاء" : "+ جولة جديدة"}</Button>
      </div>

      <Card className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold">استيراد الجولات من ملف إكسل</p>
          <p className="text-xs text-[var(--stage-fg)]/50">حمّل القالب، عبّه بجولاتك، ثم ارفعه هنا لإضافتها دفعة واحدة.</p>
        </div>
        <a
          href="/templates/rounds-import-template.xlsx"
          download
          className="rounded-lg border border-[var(--stage-border)] px-3 py-2 text-sm font-bold hover:bg-white/5"
        >
          تنزيل القالب
        </a>
        <label className="cursor-pointer rounded-lg bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15">
          {importing ? "جارٍ الاستيراد..." : "رفع ملف"}
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} disabled={importing} />
        </label>
      </Card>

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
                <option value="a">أ{form.optionA && ` — ${form.optionA}`}</option>
                <option value="b">ب{form.optionB && ` — ${form.optionB}`}</option>
                {form.optionC && <option value="c">ج — {form.optionC}</option>}
                {form.optionD && <option value="d">د — {form.optionD}</option>}
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
            <div className="sm:col-span-2">
              <Field label="طريقة التحكم بالوقت">
                <select
                  className="w-full rounded-lg border border-[var(--stage-border)] bg-black/20 p-2.5 text-sm"
                  value={form.scheduled ? "1" : "0"}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled: e.target.value === "1" }))}
                >
                  <option value="0">يدوي (فتح وإغلاق بالزر فقط، بدون وقت محدد)</option>
                  <option value="1">جدول زمني (وقت فتح ووقت إغلاق تلقائي)</option>
                </select>
              </Field>
            </div>
            {form.scheduled && (
              <>
                <Field label="وقت الفتح">
                  <Input type="datetime-local" value={form.opens_at} onChange={(e) => setForm((f) => ({ ...f, opens_at: e.target.value }))} required />
                </Field>
                <Field label="وقت الإغلاق">
                  <Input type="datetime-local" value={form.closes_at} onChange={(e) => setForm((f) => ({ ...f, closes_at: e.target.value }))} required />
                </Field>
              </>
            )}
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
                  {r.opens_at && r.closes_at
                    ? `${new Date(r.opens_at).toLocaleString("ar")} → ${new Date(r.closes_at).toLocaleString("ar")}`
                    : "يدوي (بدون جدول زمني)"}
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
