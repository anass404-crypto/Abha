import { requireStudent } from "@/lib/auth";
import { Card } from "@/components/ui/card";

const TYPE_LABEL: Record<string, string> = {
  correct_answer: "إجابة صحيحة",
  reveal_gain: "كشف لاعب",
  admin_adjustment: "تعديل إداري",
  exposed_reset: "تصفير بسبب الكشف",
};

export default async function HistoryPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, profile } = await requireStudent(slug);

  const { data: entries } = await supabase
    .from("balance_ledger")
    .select("*")
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-xl font-black">سجل الرصيد</h1>
      <div className="space-y-2">
        {(entries ?? []).length === 0 && <p className="text-sm text-[var(--stage-fg)]/50">لا توجد حركات بعد</p>}
        {(entries ?? []).map((entry) => (
          <Card key={entry.id} className="flex items-center justify-between p-3.5">
            <div>
              <div className="text-sm font-bold">{TYPE_LABEL[entry.type] ?? entry.type}</div>
              {entry.reason && <div className="text-xs text-[var(--stage-fg)]/50">{entry.reason}</div>}
              <div className="text-[11px] text-[var(--stage-fg)]/40">
                {new Date(entry.created_at).toLocaleString("ar")}
              </div>
            </div>
            <div className="text-left">
              <div className={`font-black ${entry.amount >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">
                {entry.amount >= 0 ? "+" : ""}
                {entry.amount}
              </div>
              <div className="text-xs text-[var(--stage-fg)]/50" dir="ltr">
                {entry.balance_before} → {entry.balance_after}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
