"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlayerStatus, Profile, Stage } from "@/lib/supabase/database.types";

const STATUS_LABEL: Record<PlayerStatus, string> = {
  pending: "بانتظار الاعتماد",
  rejected: "مرفوض",
  active: "متخفٍ",
  suspended: "موقوف",
  excluded: "مستبعد",
  exposed: "مكشوف",
};

export function PlayersTable({ stage, initialPlayers }: { stage: Stage; initialPlayers: Profile[] }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [query, setQuery] = useState("");
  const supabase = createClient();

  function patch(id: string, changes: Partial<Profile>) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }

  async function approve(id: string) {
    const res = await fetch(`/api/admin/${stage.slug}/players/${id}/approve`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "تعذر الاعتماد");
      return;
    }
    patch(id, { status: "active", username: json.username, approved_at: new Date().toISOString() });
    toast.success(`تم الاعتماد — اسم المستخدم: ${json.username}`);
  }

  async function setStatus(id: string, status: PlayerStatus) {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) {
      toast.error("تعذر تنفيذ العملية");
      return;
    }
    patch(id, { status });
  }

  async function adjustBalance(id: string, current: number) {
    const amountStr = prompt("مقدار التعديل (موجب أو سالب):");
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (Number.isNaN(amount)) {
      toast.error("قيمة غير صالحة");
      return;
    }
    const reason = prompt("سبب التعديل (إلزامي):");
    if (!reason) {
      toast.error("السبب مطلوب");
      return;
    }
    const { error } = await supabase.rpc("admin_adjust_balance", {
      p_student_id: id,
      p_amount: amount,
      p_reason: reason,
    });
    if (error) {
      toast.error("تعذر تعديل الرصيد");
      return;
    }
    patch(id, { balance: current + amount });
    toast.success("تم تعديل الرصيد");
  }

  async function changePassword(id: string) {
    const password = prompt("كلمة المرور الجديدة (6 أحرف على الأقل):");
    if (!password) return;
    const res = await fetch(`/api/admin/${stage.slug}/players/${id}/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "تعذر تغيير كلمة المرور");
      return;
    }
    toast.success("تم تغيير كلمة المرور");
  }

  async function exposeAdmin(id: string) {
    if (!confirm("هل تريد كشف هذا اللاعب إداريًا؟")) return;
    const reason = prompt("سبب الكشف الإداري (اختياري):") ?? "كشف إداري";
    const { error } = await supabase.rpc("admin_expose_player", { p_student_id: id, p_reason: reason });
    if (error) {
      toast.error("تعذر الكشف");
      return;
    }
    patch(id, { status: "exposed", balance: 0 });
    toast.success("تم كشف اللاعب");
  }

  const filtered = players.filter(
    (p) =>
      p.display_name?.includes(query) ||
      p.real_name?.includes(query) ||
      p.phone?.includes(query) ||
      p.username?.includes(query)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">إدارة اللاعبين</h1>
        <Input placeholder="بحث..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-56" />
      </div>

      <div className="glass-card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--stage-border)] text-[var(--stage-fg)]/60">
              <th className="p-3 text-right">الاسم الحقيقي</th>
              <th className="p-3 text-right">المستعار</th>
              <th className="p-3 text-right">الجوال</th>
              <th className="p-3 text-right">المستخدم</th>
              <th className="p-3 text-right">الرصيد</th>
              <th className="p-3 text-right">الحالة</th>
              <th className="p-3 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-[var(--stage-border)]/50">
                <td className="p-3">{p.real_name}</td>
                <td className="p-3">
                  {p.emoji} {p.display_name}
                </td>
                <td className="p-3" dir="ltr">
                  {p.phone}
                </td>
                <td className="p-3" dir="ltr">
                  {p.username ?? "—"}
                </td>
                <td className="p-3" dir="ltr">
                  {p.balance}
                </td>
                <td className="p-3">{STATUS_LABEL[p.status]}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {p.status === "pending" && (
                      <>
                        <Button className="!px-2 !py-1 text-xs" onClick={() => approve(p.id)}>
                          اعتماد
                        </Button>
                        <Button
                          variant="danger"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => setStatus(p.id, "rejected")}
                        >
                          رفض
                        </Button>
                      </>
                    )}
                    {p.status === "active" && (
                      <>
                        <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setStatus(p.id, "suspended")}>
                          إيقاف
                        </Button>
                        <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => adjustBalance(p.id, p.balance)}>
                          تعديل الرصيد
                        </Button>
                        <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => exposeAdmin(p.id)}>
                          كشف إداري
                        </Button>
                        <Button
                          variant="danger"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => setStatus(p.id, "excluded")}
                        >
                          استبعاد
                        </Button>
                      </>
                    )}
                    {p.status === "suspended" && (
                      <Button className="!px-2 !py-1 text-xs" onClick={() => setStatus(p.id, "active")}>
                        إعادة تفعيل
                      </Button>
                    )}
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => changePassword(p.id)}>
                      تغيير كلمة المرور
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
