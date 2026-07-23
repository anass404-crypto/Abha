import { notFound } from "next/navigation";
import { requireStageAdmin } from "@/lib/auth";
import { PreviewResultsScreen } from "@/components/admin/preview-results-screen";
import type { PlayerCard } from "@/lib/supabase/database.types";

export default async function RoundResultsPreviewPage({
  params,
}: {
  params: Promise<{ stage: string; id: string }>;
}) {
  const { stage: slug, id } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const { data: round } = await supabase.from("rounds").select("*").eq("id", id).eq("stage_id", stage.id).maybeSingle();
  if (!round) notFound();

  const [{ data: cards }, { data: submissions }, { data: revealAttempts }] = await Promise.all([
    supabase.rpc("get_stage_player_cards", { p_stage_id: stage.id }),
    supabase.from("submissions").select("*").eq("round_id", id),
    supabase.from("reveal_attempts").select("*").eq("round_id", id),
  ]);

  const projected = projectRoundOutcome(cards ?? [], submissions ?? [], revealAttempts ?? []);

  return <PreviewResultsScreen stage={stage} round={round} cards={projected} />;
}

function projectRoundOutcome(
  cards: PlayerCard[],
  submissions: { student_id: string; is_correct: boolean | null; points_awarded: number | null }[],
  revealAttempts: { revealer_id: string; target_id: string; status: string; sequence_in_round: number | null }[]
): PlayerCard[] {
  const byId = new Map(cards.map((c) => [c.id, { ...c }]));

  for (const s of submissions) {
    if (s.is_correct && (s.points_awarded ?? 0) > 0) {
      const c = byId.get(s.student_id);
      if (c) c.balance += s.points_awarded!;
    }
  }

  const executed = revealAttempts
    .filter((a) => a.status === "executed")
    .sort((a, b) => (a.sequence_in_round ?? 0) - (b.sequence_in_round ?? 0));

  for (const a of executed) {
    const target = byId.get(a.target_id);
    const revealer = byId.get(a.revealer_id);
    if (target && revealer) {
      const transfer = target.balance;
      revealer.balance += transfer;
      target.balance = 0;
      target.status = "exposed";
    }
  }

  return Array.from(byId.values());
}
