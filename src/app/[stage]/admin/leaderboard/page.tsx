import { requireStageAdmin } from "@/lib/auth";
import { AdminCompetitionsView } from "@/components/admin/admin-competitions-view";

export default async function AdminCompetitionsPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const { data: cards } = await supabase.rpc("get_stage_player_cards", { p_stage_id: stage.id });

  return <AdminCompetitionsView stageId={stage.id} initialCards={cards ?? []} />;
}
