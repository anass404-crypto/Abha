"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import type { Round, Stage, Submission, RevealAttempt } from "@/lib/supabase/database.types";

type SubmissionRow = Submission & { student_display_name: string; student_real_name: string };
type AttemptRow = RevealAttempt & {
  revealer_display_name: string;
  target_display_name: string;
  target_real_name: string;
  revealer_answer_correct: boolean | null;
};

const REVEAL_STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار الاحتساب",
  executed: "صحيحة ومنفذة",
  wrong_guess: "تخمين خاطئ",
  cancelled_wrong_answer: "ملغاة — إجابة خاطئة",
  cancelled_target_exposed: "ملغاة — الهدف مكشوف مسبقًا",
  cancelled_revealer_exposed: "ملغاة — الكاشف انكشف قبل التنفيذ",
  cancelled_admin: "ملغاة إداريًا",
};

function toEditForm(round: Round) {
  return {
    title: round.title,
    question: round.question,
    optionA: round.options.a ?? "",
    optionB: round.options.b ?? "",
    optionC: round.options.c ?? "",
    optionD: round.options.d ?? "",
    correct_option: round.correct_option,
    points: round.points,
    reveal_attempts_allowed: round.reveal_attempts_allowed,
    reveal_enabled: round.reveal_enabled,
    scheduled: Boolean(round.opens_at && round.closes_at),
    opens_at: round.opens_at ? round.opens_at.slice(0, 16) : "",
    closes_at: round.closes_at ? round.closes_at.slice(0, 16) : "",
  };
}

export function RoundControl({
  stage,
  round: initialRound,
  submissionRows,
  attemptRows,
}: {
  stage: Stage;
  round: Round;
  submissionRows: SubmissionRow[];
  attemptRows: AttemptRow[];
}) {
  const router = useRouter();
  const [round, setRound] = useState(initialRound);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(() => toEditForm(initialRound));
  const supabase = createClient();

  async function updateRound(changes: Partial<Round>) {
    const { data, error } = await supabase.from("rounds").update(changes).eq("id", round.id).select().single();
    if (error || !data) {
      toast.error("تعذر تنفيذ العملية");
      return;
    }
    setRound(data);
    router.refresh();
  }

  async function runRpc(fn: "calculate_round" | "publish_round" | "undo_calculation", confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    const { error } = await supabase.rpc(fn, { p_round_id: round.id });
    setBusy(false);
    if (error) {
      toast.error(error.message || "تعذر تنفيذ العملية");
      return;
    }
    toast.success("تم بنجاح");
    router.refresh();
  }

  async function extend() {
    if (!round.closes_at) return; // manual round, no schedule to extend
    const input = prompt("أدخل وقت الإغلاق الجديد (YYYY-MM-DDTHH:mm):", round.closes_at.slice(0, 16));
    if (!input) return;
    await updateRound({ closes_at: new Date(input).toISOString() });
  }

  async function reopen() {
    if (!round.closes_at) {
      // manual round with no schedule — status alone gates submissions
      await updateRound({ status: "open" });
      return;
    }
    let closesAt = round.closes_at;
    if (new Date(closesAt).getTime() <= Date.now()) {
      const input = prompt(
        "وقت إغلاق الجولة الحالي قد مضى — أدخل وقت إغلاق جديد حتى يقدر الطلاب يجاوبون (YYYY-MM-DDTHH:mm):",
        new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16)
      );
      if (!input) return;
      closesAt = new Date(input).toISOString();
    }
    await updateRound({ status: "open", closes_at: closesAt });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const options: Record<string, string> = {};
    if (editForm.optionA) options.a = editForm.optionA;
    if (editForm.optionB) options.b = editForm.optionB;
    if (editForm.optionC) options.c = editForm.optionC;
    if (editForm.optionD) options.d = editForm.optionD;

    if (editForm.scheduled && (!editForm.opens_at || !editForm.closes_at)) {
      toast.error("حدد وقت الفتح والإغلاق، أو ألغِ تفعيل الجدولة للتحكم اليدوي");
      return;
    }

    await updateRound({
      title: editForm.title,
      question: editForm.question,
      options,
      correct_option: editForm.correct_option,
      points: editForm.points,
      reveal_attempts_allowed: editForm.reveal_attempts_allowed,
      reveal_enabled: editForm.reveal_enabled,
      opens_at: editForm.scheduled ? new Date(editForm.opens_at).toISOString() : null,
      closes_at: editForm.scheduled ? new Date(editForm.closes_at).toISOString() : null,
    });
    setEditing(false);
  }

  async function sendNotification() {
    const title = prompt("عنوان الإشعار:");
    if (!title) return;
    const body = prompt("نص الإشعار (اختياري):") ?? "";
    const { error } = await supabase
      .from("notifications")
      .insert({ stage_id: stage.id, student_id: null, type: "admin_broadcast", title, body });
    if (error) {
      toast.error("تعذر إرسال الإشعار");
      return;
    }
    toast.success("تم إرسال الإشعار");
  }

  function exportCsv() {
    const header = "الاسم_المستعار,الاسم_الحقيقي,الإجابة,صحيحة,النقاط,وقت_التسليم\n";
    const rows = submissionRows
      .map((s) =>
        [s.student_display_name, s.student_real_name, s.selected_option, s.is_correct ? "نعم" : "لا", s.points_awarded ?? "", s.submitted_at].join(",")
      )
      .join("\n");
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `round-${round.round_number}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">
            الجولة {round.round_number}: {round.title}
          </h1>
          <p className="text-xs text-[var(--stage-fg)]/50">
            {round.opens_at && round.closes_at
              ? `${new Date(round.opens_at).toLocaleString("ar")} → ${new Date(round.closes_at).toLocaleString("ar")}`
              : "تحكم يدوي (بدون جدول زمني)"}
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{round.status}</span>
      </div>

      <Card className="flex flex-wrap gap-2">
        {(round.status === "draft" || round.status === "scheduled") && (
          <Button disabled={busy} onClick={() => updateRound({ status: "open" })}>
            فتح الجولة الآن
          </Button>
        )}
        {round.status === "open" && (
          <>
            <Button disabled={busy} variant="danger" onClick={() => updateRound({ status: "closed" })}>
              إغلاق الجولة الآن
            </Button>
            {round.closes_at && (
              <Button disabled={busy} variant="ghost" onClick={extend}>
                تمديد الوقت
              </Button>
            )}
          </>
        )}
        {round.status === "closed" && (
          <>
            <Button disabled={busy} onClick={() => runRpc("calculate_round")}>
              احتساب نقاط الجولة وتنفيذ محاولات الكشف
            </Button>
            <Button disabled={busy} variant="ghost" onClick={reopen}>
              إعادة فتح الجولة للطلاب
            </Button>
          </>
        )}
        {round.status === "calculated" && (
          <>
            <Button disabled={busy} onClick={() => runRpc("publish_round", "نشر النتائج الآن؟ لا يمكن التراجع بعد النشر.")}>
              نشر النتائج
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => runRpc("undo_calculation", "التراجع عن الاحتساب؟")}>
              التراجع عن الاحتساب
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setEditForm(toEditForm(round));
            setEditing((v) => !v);
          }}
        >
          {editing ? "إلغاء التعديل" : "تعديل إعدادات الجولة"}
        </Button>
        <Button variant="ghost" onClick={sendNotification}>
          إرسال إشعار
        </Button>
        <Button variant="ghost" onClick={exportCsv}>
          تصدير النتائج CSV
        </Button>
      </Card>

      {editing && (
        <Card>
          <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
            <Field label="عنوان الجولة">
              <Input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} required />
            </Field>
            <div className="sm:col-span-2">
              <Field label="السؤال">
                <Input value={editForm.question} onChange={(e) => setEditForm((f) => ({ ...f, question: e.target.value }))} required />
              </Field>
            </div>
            <Field label="الخيار أ">
              <Input value={editForm.optionA} onChange={(e) => setEditForm((f) => ({ ...f, optionA: e.target.value }))} required />
            </Field>
            <Field label="الخيار ب">
              <Input value={editForm.optionB} onChange={(e) => setEditForm((f) => ({ ...f, optionB: e.target.value }))} required />
            </Field>
            <Field label="الخيار ج (اختياري)">
              <Input value={editForm.optionC} onChange={(e) => setEditForm((f) => ({ ...f, optionC: e.target.value }))} />
            </Field>
            <Field label="الخيار د (اختياري)">
              <Input value={editForm.optionD} onChange={(e) => setEditForm((f) => ({ ...f, optionD: e.target.value }))} />
            </Field>
            <Field label="الإجابة الصحيحة">
              <select
                className="w-full rounded-lg border border-[var(--stage-border)] bg-black/20 p-2.5 text-sm"
                value={editForm.correct_option}
                onChange={(e) => setEditForm((f) => ({ ...f, correct_option: e.target.value }))}
              >
                <option value="a">أ</option>
                <option value="b">ب</option>
                {editForm.optionC && <option value="c">ج</option>}
                {editForm.optionD && <option value="d">د</option>}
              </select>
            </Field>
            <Field label="نقاط الإجابة الصحيحة">
              <Input
                type="number"
                value={editForm.points}
                onChange={(e) => setEditForm((f) => ({ ...f, points: Number(e.target.value) }))}
              />
            </Field>
            <Field label="عدد محاولات الكشف">
              <Input
                type="number"
                value={editForm.reveal_attempts_allowed}
                onChange={(e) => setEditForm((f) => ({ ...f, reveal_attempts_allowed: Number(e.target.value) }))}
              />
            </Field>
            <Field label="تفعيل الكشف في هذه الجولة">
              <select
                className="w-full rounded-lg border border-[var(--stage-border)] bg-black/20 p-2.5 text-sm"
                value={editForm.reveal_enabled ? "1" : "0"}
                onChange={(e) => setEditForm((f) => ({ ...f, reveal_enabled: e.target.value === "1" }))}
              >
                <option value="1">مفعّل</option>
                <option value="0">معطّل</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="طريقة التحكم بالوقت">
                <select
                  className="w-full rounded-lg border border-[var(--stage-border)] bg-black/20 p-2.5 text-sm"
                  value={editForm.scheduled ? "1" : "0"}
                  onChange={(e) => setEditForm((f) => ({ ...f, scheduled: e.target.value === "1" }))}
                >
                  <option value="0">يدوي (فتح وإغلاق بالزر فقط، بدون وقت محدد)</option>
                  <option value="1">جدول زمني (وقت فتح ووقت إغلاق تلقائي)</option>
                </select>
              </Field>
            </div>
            {editForm.scheduled && (
              <>
                <Field label="وقت الفتح">
                  <Input
                    type="datetime-local"
                    value={editForm.opens_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, opens_at: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="وقت الإغلاق">
                  <Input
                    type="datetime-local"
                    value={editForm.closes_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, closes_at: e.target.value }))}
                    required
                  />
                </Field>
              </>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy} className="w-full">
                حفظ التعديلات
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <h2 className="mb-3 text-sm font-bold text-[var(--stage-fg)]/70">قائمة الإجابات ({submissionRows.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--stage-border)] text-[var(--stage-fg)]/60">
              <th className="p-2 text-right">الاسم المستعار</th>
              <th className="p-2 text-right">الاسم الحقيقي</th>
              <th className="p-2 text-right">الإجابة</th>
              <th className="p-2 text-right">صحيحة؟</th>
              <th className="p-2 text-right">النقاط</th>
              <th className="p-2 text-right">وقت التسليم</th>
            </tr>
          </thead>
          <tbody>
            {submissionRows.map((s) => (
              <tr key={s.id} className="border-b border-[var(--stage-border)]/50">
                <td className="p-2">{s.student_display_name}</td>
                <td className="p-2">{s.student_real_name}</td>
                <td className="p-2">{s.selected_option}</td>
                <td className="p-2">{s.is_correct === null ? "—" : s.is_correct ? "نعم" : "لا"}</td>
                <td className="p-2">{s.points_awarded ?? "—"}</td>
                <td className="p-2 text-xs">{new Date(s.submitted_at).toLocaleString("ar")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-3 text-sm font-bold text-[var(--stage-fg)]/70">محاولات الكشف ({attemptRows.length})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--stage-border)] text-[var(--stage-fg)]/60">
              <th className="p-2 text-right">الكاشف</th>
              <th className="p-2 text-right">الهدف</th>
              <th className="p-2 text-right">الاسم المتوقع</th>
              <th className="p-2 text-right">الاسم الصحيح</th>
              <th className="p-2 text-right">إجابة الكاشف صحيحة؟</th>
              <th className="p-2 text-right">صحة التخمين</th>
              <th className="p-2 text-right">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {attemptRows.map((a) => (
              <tr key={a.id} className="border-b border-[var(--stage-border)]/50">
                <td className="p-2">{a.revealer_display_name}</td>
                <td className="p-2">{a.target_display_name}</td>
                <td className="p-2">{a.guessed_real_name}</td>
                <td className="p-2">{a.target_real_name}</td>
                <td className="p-2">{a.revealer_answer_correct === null ? "—" : a.revealer_answer_correct ? "نعم" : "لا"}</td>
                <td className="p-2">{a.is_correct === null ? "—" : a.is_correct ? "صحيح" : "خطأ"}</td>
                <td className="p-2 text-xs">{REVEAL_STATUS_LABEL[a.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
