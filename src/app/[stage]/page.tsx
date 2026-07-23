import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStageBySlug } from "@/lib/stage";
import { StudentHome } from "@/components/student/student-home";

export default async function StageHomePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const stage = await getStageBySlug(slug);
  if (!stage) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${slug}/login`);

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect(`/${slug}/login`);

  if (profile.role === "stage_admin" || profile.role === "system_admin") {
    redirect(`/${slug}/admin`);
  }
  if (profile.stage_id !== stage.id) redirect(`/${slug}/login`);
  if (profile.status === "pending" || profile.status === "rejected") redirect(`/${slug}/pending`);

  const [{ data: currentRound }, { count: activeCount }, { data: notifications }] = await Promise.all([
    supabase
      .from("rounds")
      .select("*")
      .eq("stage_id", stage.id)
      .in("status", ["open", "closed", "calculating"])
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stage.id)
      .eq("role", "student")
      .neq("status", "exposed"),
    supabase
      .from("notifications")
      .select("*")
      .or(`student_id.eq.${profile.id},student_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const { data: rankData } = await supabase.rpc("get_stage_player_cards", { p_stage_id: stage.id });
  const rank = rankData ? rankData.findIndex((p) => p.id === profile.id) + 1 : null;
  const remaining = rankData ? rankData.filter((p) => p.status !== "exposed").length : activeCount ?? 0;

  let hasSubmitted = false;
  if (currentRound) {
    const { data: submission } = await supabase
      .from("submissions")
      .select("id")
      .eq("round_id", currentRound.id)
      .eq("student_id", profile.id)
      .maybeSingle();
    hasSubmitted = Boolean(submission);
  }

  return (
    <StudentHome
      stage={stage}
      profile={profile}
      currentRound={currentRound ?? null}
      rank={rank}
      remainingCount={remaining}
      notifications={notifications ?? []}
      hasSubmitted={hasSubmitted}
    />
  );
}
