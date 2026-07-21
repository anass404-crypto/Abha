import { notFound } from "next/navigation";
import { requireStageAdmin } from "@/lib/auth";
import { RoundControl } from "@/components/admin/round-control";

export default async function AdminRoundControlPage({
  params,
}: {
  params: Promise<{ stage: string; id: string }>;
}) {
  const { stage: slug, id } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const { data: round } = await supabase.from("rounds").select("*").eq("id", id).eq("stage_id", stage.id).maybeSingle();
  if (!round) notFound();

  const [{ data: submissions }, { data: attempts }] = await Promise.all([
    supabase.from("submissions").select("*").eq("round_id", id).order("submitted_at", { ascending: true }),
    supabase.from("reveal_attempts").select("*").eq("round_id", id).order("submitted_at", { ascending: true }),
  ]);

  const studentIds = Array.from(
    new Set([...(submissions ?? []).map((s) => s.student_id), ...(attempts ?? []).flatMap((a) => [a.revealer_id, a.target_id])])
  );

  const { data: people } =
    studentIds.length > 0
      ? await supabase.from("profiles").select("id, display_name, real_name").in("id", studentIds)
      : { data: [] };

  const peopleMap = new Map((people ?? []).map((p) => [p.id, p]));
  const submissionMap = new Map((submissions ?? []).map((s) => [s.id, s]));

  const submissionRows = (submissions ?? []).map((s) => ({
    ...s,
    student_display_name: peopleMap.get(s.student_id)?.display_name ?? "—",
    student_real_name: peopleMap.get(s.student_id)?.real_name ?? "—",
  }));

  const attemptRows = (attempts ?? []).map((a) => ({
    ...a,
    revealer_display_name: peopleMap.get(a.revealer_id)?.display_name ?? "—",
    target_display_name: peopleMap.get(a.target_id)?.display_name ?? "—",
    target_real_name: peopleMap.get(a.target_id)?.real_name ?? "—",
    revealer_answer_correct: submissionMap.get(a.submission_id)?.is_correct ?? null,
  }));

  return (
    <RoundControl
      stage={stage}
      round={round}
      submissionRows={submissionRows}
      attemptRows={attemptRows}
    />
  );
}
