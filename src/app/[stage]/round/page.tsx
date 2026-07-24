import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { isPast } from "@/lib/utils";
import { RoundFlow } from "@/components/student/round-flow";
import { Card } from "@/components/ui/card";

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

  const [{ data: cards }, { data: realNames }, { data: participation }] = await Promise.all([
    supabase.rpc("get_stage_player_cards", { p_stage_id: stage.id }),
    supabase.rpc("get_stage_real_names", { p_stage_id: stage.id }),
    stage.enable_action_cards
      ? supabase.rpc("get_round_participation_status", { p_round_id: round.id })
      : Promise.resolve({ data: null }),
  ]);

  if (participation?.[0]?.excluded) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <Card>
          <div className="mb-3 text-4xl">⛔</div>
          <p className="font-bold">أنت غير مشارك في هذه الجولة</p>
        </Card>
      </main>
    );
  }

  const targets = (cards ?? []).filter((c) => c.id !== profile.id && c.status === "active");

  return (
    <RoundFlow
      stage={stage}
      round={round}
      targets={targets}
      realNames={(realNames ?? []).filter((n) => n !== profile.real_name)}
      revealFrozen={Boolean(participation?.[0]?.reveal_frozen)}
    />
  );
}
