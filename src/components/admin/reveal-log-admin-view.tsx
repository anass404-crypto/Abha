"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { RevealAttempt, RoundStatus } from "@/lib/supabase/database.types";

type Row = RevealAttempt & {
  round_number: number;
  round_status: RoundStatus;
  revealer_display_name: string;
  target_display_name: string;
  target_real_name: string;
  blocking_card_name: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار الاحتساب",
  executed: "صحيحة ومنفذة",
  wrong_guess: "تخمين خاطئ",
  cancelled_wrong_answer: "ملغاة — إجابة خاطئة",
  cancelled_target_exposed: "ملغاة — الهدف مكشوف مسبقًا",
  cancelled_revealer_exposed: "ملغاة — الكاشف انكشف قبل التنفيذ",
  cancelled_admin: "ملغاة إداريًا",
  cancelled_card_effect: "ملغاة — بطاقة أكشن",
};

export function RevealLogAdminView({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [roundFilter, setRoundFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const rounds = useMemo(() => Array.from(new Set(rows.map((r) => r.round_number))).sort((a, b) => b - a), [rows]);

  const filtered = rows.filter(
    (r) => (roundFilter === "all" || r.round_number === roundFilter) && (statusFilter === "all" || r.status === statusFilter)
  );

  async function cancelAttempt(row: Row) {
    const reason = prompt("سبب الإلغاء:");
    if (!reason) return;
    setBusyId(row.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_cancel_reveal_attempt", { p_attempt_id: row.id, p_reason: reason });
    setBusyId(null);
    if (error) {
      toast.error(error.message || "تعذر إلغاء المحاولة");
      return;
    }
    toast.success("تم إلغاء المحاولة");
    router.refresh();
  }

  function exportCsv() {
    const header = "الجولة,الكاشف,الهدف,الاسم_المتوقع,الاسم_الصحيح,الحالة,البطاقة_المؤثرة,سبب_الإلغاء,وقت_التسليم\n";
    const csvRows = filtered
      .map((r) =>
        [
          r.round_number,
          r.revealer_display_name,
          r.target_display_name,
          r.guessed_real_name,
          r.target_real_name,
          STATUS_LABEL[r.status] ?? r.status,
          r.blocking_card_name ?? "",
          r.cancel_reason ?? "",
          r.submitted_at,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob(["﻿" + header + csvRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reveal-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">سجل الكشوف (تفصيلي)</h1>
        <Button variant="ghost" onClick={exportCsv}>
          تصدير CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-[var(--stage-border)] bg-black/20 px-2.5 py-1.5 text-xs"
          value={roundFilter}
          onChange={(e) => setRoundFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">كل الجولات</option>
          {rounds.map((r) => (
            <option key={r} value={r}>
              الجولة {r}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-[var(--stage-border)] bg-black/20 px-2.5 py-1.5 text-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">كل الحالات</option>
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--stage-border)] text-[var(--stage-fg)]/60">
              <th className="p-2 text-right">الجولة</th>
              <th className="p-2 text-right">الكاشف</th>
              <th className="p-2 text-right">الهدف</th>
              <th className="p-2 text-right">الاسم المتوقع</th>
              <th className="p-2 text-right">الاسم الصحيح</th>
              <th className="p-2 text-right">الحالة</th>
              <th className="p-2 text-right">البطاقة المؤثرة</th>
              <th className="p-2 text-right">سبب الإلغاء</th>
              <th className="p-2 text-right">وقت التسليم</th>
              <th className="p-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-[var(--stage-border)]/50">
                <td className="p-2">{r.round_number}</td>
                <td className="p-2">{r.revealer_display_name}</td>
                <td className="p-2">{r.target_display_name}</td>
                <td className="p-2">{r.guessed_real_name}</td>
                <td className="p-2">{r.target_real_name}</td>
                <td className="p-2 text-xs">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="p-2 text-xs">{r.blocking_card_name ?? "—"}</td>
                <td className="p-2 text-xs">{r.cancel_reason ?? "—"}</td>
                <td className="p-2 text-xs">{new Date(r.submitted_at).toLocaleString("ar")}</td>
                <td className="p-2">
                  {r.status === "pending" && r.round_status !== "published" && (
                    <Button
                      variant="danger"
                      className="!px-2 !py-1 text-xs"
                      disabled={busyId === r.id}
                      onClick={() => cancelAttempt(r)}
                    >
                      إلغاء
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="p-4 text-sm text-[var(--stage-fg)]/50">لا توجد محاولات كشف</p>}
      </Card>
    </div>
  );
}
