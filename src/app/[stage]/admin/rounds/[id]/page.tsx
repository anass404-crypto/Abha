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

  const [{ data: submissions }, { data: attempts }, { data: usages }] = await Promise.all([
    supabase.from("submissions").select("*").eq("round_id", id).order("submitted_at", { ascending: true }),
    supabase.from("reveal_attempts").select("*").eq("round_id", id).order("submitted_at", { ascending: true }),
    supabase.from("action_card_usages").select("*").eq("effective_round_id", id).order("submitted_at", { ascending: true }),
  ]);

  const studentIds = Array.from(
    new Set([
      ...(submissions ?? []).map((s) => s.student_id),
      ...(attempts ?? []).flatMap((a) => [a.revealer_id, a.target_id]),
      ...(usages ?? []).flatMap((u) => [u.student_id, u.target_student_id].filter(Boolean) as string[]),
    ])
  );

  const { data: people } =
    studentIds.length > 0
      ? await supabase.from("profiles").select("id, display_name, real_name").in("id", studentIds)
      : { data: [] };

  const effectIds = Array.from(new Set((attempts ?? []).map((a) => a.blocking_effect_id).filter(Boolean))) as string[];
  const { data: effects } =
    effectIds.length > 0
      ? await supabase.from("action_card_effects").select("id, stage_action_card_id").in("id", effectIds)
      : { data: [] };
  const cardIds = Array.from(
    new Set([...(usages ?? []).map((u) => u.stage_action_card_id), ...(effects ?? []).map((e) => e.stage_action_card_id)])
  );
  const { data: cards } =
    cardIds.length > 0 ? await supabase.from("stage_action_cards").select("id, name").in("id", cardIds) : { data: [] };
  const cardNameById = new Map((cards ?? []).map((c) => [c.id, c.name]));
  const effectCardById = new Map((effects ?? []).map((e) => [e.id, cardNameById.get(e.stage_action_card_id) ?? "—"]));

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
    blocking_card_name: a.blocking_effect_id ? effectCardById.get(a.blocking_effect_id) ?? null : null,
  }));

  const cardUsageRows = (usages ?? []).map((u) => ({
    ...u,
    card_name: cardNameById.get(u.stage_action_card_id) ?? "—",
    student_display_name: peopleMap.get(u.student_id)?.display_name ?? "—",
    target_display_name: u.target_student_id ? peopleMap.get(u.target_student_id)?.display_name ?? "—" : null,
  }));

  return (
    <RoundControl
      stage={stage}
      round={round}
      submissionRows={submissionRows}
      attemptRows={attemptRows}
      cardUsageRows={cardUsageRows}
    />
  );
}
