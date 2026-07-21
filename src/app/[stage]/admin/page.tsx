import { requireStageAdmin } from "@/lib/auth";
import { StatTile, Card } from "@/components/ui/card";

export default async function AdminOverviewPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const [
    { count: totalStudents },
    { count: pendingCount },
    { count: activeCount },
    { count: exposedCount },
    { data: currentRound },
    { data: recentReveals },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("stage_id", stage.id).eq("role", "student"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("stage_id", stage.id).eq("status", "pending"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("stage_id", stage.id).eq("status", "active"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("stage_id", stage.id).eq("status", "exposed"),
    supabase
      .from("rounds")
      .select("*")
      .eq("stage_id", stage.id)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("reveal_attempts").select("*").eq("status", "executed").order("processed_at", { ascending: false }).limit(5),
  ]);

  const revealNames = new Map<string, string>();
  if (recentReveals && recentReveals.length > 0) {
    const ids = Array.from(new Set(recentReveals.flatMap((r) => [r.revealer_id, r.target_id])));
    const { data: people } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    for (const p of people ?? []) revealNames.set(p.id, p.display_name ?? "—");
  }

  let submittedCount = 0;
  let notSubmittedCount = 0;
  if (currentRound) {
    const { count: submitted } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("round_id", currentRound.id);
    submittedCount = submitted ?? 0;
    notSubmittedCount = Math.max((activeCount ?? 0) - submittedCount, 0);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">نظرة عامة</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="إجمالي الطلاب" value={totalStudents ?? 0} />
        <StatTile label="طلبات جديدة" value={pendingCount ?? 0} />
        <StatTile label="متخفون" value={activeCount ?? 0} />
        <StatTile label="مكشوفون" value={exposedCount ?? 0} />
      </div>

      {currentRound && (
        <Card>
          <h2 className="mb-2 text-sm font-bold text-[var(--stage-fg)]/70">
            الجولة الحالية: {currentRound.round_number} — {currentRound.title}
          </h2>
          <div className="flex gap-6 text-sm">
            <span>الحالة: {currentRound.status}</span>
            <span>تسليمات مستلمة: {submittedCount}</span>
            <span>لم يسلّموا بعد: {notSubmittedCount}</span>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-bold text-[var(--stage-fg)]/70">آخر عمليات الكشف</h2>
        {(!recentReveals || recentReveals.length === 0) && (
          <p className="text-sm text-[var(--stage-fg)]/50">لا توجد عمليات كشف بعد</p>
        )}
        <ul className="space-y-1 text-sm">
          {recentReveals?.map((r) => (
            <li key={r.id}>
              {revealNames.get(r.revealer_id)} كشف {revealNames.get(r.target_id)}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
