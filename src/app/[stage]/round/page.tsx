import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { isPast } from "@/lib/utils";
import { RoundFlow } from "@/components/student/round-flow";

export default async function RoundPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage, profile } = await requireStudent(slug);

  const { data: round } = await supabase
    .from("rounds")
    .select("*")
    .eq("stage_id", stage.id)
    .eq("status", "open")
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!round || (round.closes_at && isPast(round.closes_at))) {
    redirect(`/${slug}`);
  }

  const { data: existingSubmission } = await supabase
    .from("submissions")
    .select("*")
    .eq("round_id", round.id)
    .eq("student_id", profile.id)
    .maybeSingle();

  if (existingSubmission && !stage.allow_answer_edit) {
    redirect(`/${slug}`);
  }

  const [{ data: cards }, { data: realNames }] = await Promise.all([
    supabase.rpc("get_stage_player_cards", { p_stage_id: stage.id }),
    supabase.rpc("get_stage_real_names", { p_stage_id: stage.id }),
  ]);

  const targets = (cards ?? []).filter((c) => c.id !== profile.id && c.status === "active");

  return (
    <RoundFlow
      stage={stage}
      round={round}
      targets={targets}
      realNames={(realNames ?? []).filter((n) => n !== profile.real_name)}
    />
  );
}
