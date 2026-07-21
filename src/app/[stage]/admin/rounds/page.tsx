import { requireStageAdmin } from "@/lib/auth";
import { RoundsManager } from "@/components/admin/rounds-manager";

export default async function AdminRoundsPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const { data: rounds } = await supabase
    .from("rounds")
    .select("*")
    .eq("stage_id", stage.id)
    .order("round_number", { ascending: false });

  return <RoundsManager stage={stage} initialRounds={rounds ?? []} />;
}
