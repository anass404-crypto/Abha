import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { LeaderboardView } from "@/components/student/leaderboard-view";

export default async function LeaderboardPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage, profile } = await requireStudent(slug);
  if (!stage.show_leaderboard) redirect(`/${slug}`);

  const { data: cards } = await supabase.rpc("get_stage_player_cards", { p_stage_id: stage.id });

  return <LeaderboardView stage={stage} profile={profile} initialCards={cards ?? []} />;
}
