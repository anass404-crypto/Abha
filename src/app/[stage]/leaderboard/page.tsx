import { requireStudent } from "@/lib/auth";
import { LeaderboardView } from "@/components/student/leaderboard-view";
import type { RevealAttempt, Submission } from "@/lib/supabase/database.types";

export default async function LeaderboardPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage, profile } = await requireStudent(slug);

  const { data: cards } = await supabase.rpc("get_stage_player_cards", { p_stage_id: stage.id });

  const { data: latestPublishedRound } = await supabase
    .from("rounds")
    .select("*")
    .eq("stage_id", stage.id)
    .eq("status", "published")
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  let mySubmission: Submission | null = null;
  let myRevealAttempts: RevealAttempt[] = [];
  if (latestPublishedRound) {
    const [{ data: submission }, { data: attempts }] = await Promise.all([
      supabase
        .from("submissions")
        .select("*")
        .eq("round_id", latestPublishedRound.id)
        .eq("student_id", profile.id)
        .maybeSingle(),
      supabase.from("reveal_attempts").select("*").eq("round_id", latestPublishedRound.id).eq("revealer_id", profile.id),
    ]);
    mySubmission = submission;
    myRevealAttempts = attempts ?? [];
  }

  return (
    <LeaderboardView
      stage={stage}
      profile={profile}
      initialCards={cards ?? []}
      latestPublishedRound={latestPublishedRound ?? null}
      mySubmission={mySubmission}
      myRevealAttempts={myRevealAttempts ?? []}
    />
  );
}
