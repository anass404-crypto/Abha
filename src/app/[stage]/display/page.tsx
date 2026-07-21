import { requireStageMember } from "@/lib/auth";
import { DisplayScreen } from "@/components/display/display-screen";

export default async function DisplayPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage } = await requireStageMember(slug);

  const [{ data: cards }, { data: currentRound }, { data: events }] = await Promise.all([
    supabase.rpc("get_stage_player_cards", { p_stage_id: stage.id }),
    supabase
      .from("rounds")
      .select("*")
      .eq("stage_id", stage.id)
      .in("status", ["open", "closed", "published"])
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("events_log")
      .select("*")
      .eq("stage_id", stage.id)
      .eq("visible_to_students", true)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  return (
    <DisplayScreen
      stage={stage}
      initialCards={cards ?? []}
      currentRound={currentRound ?? null}
      initialEvents={events ?? []}
    />
  );
}
