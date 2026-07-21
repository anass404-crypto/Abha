import { requireStageAdmin } from "@/lib/auth";
import { PlayersTable } from "@/components/admin/players-table";

export default async function AdminPlayersPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const { data: players } = await supabase
    .from("profiles")
    .select("*")
    .eq("stage_id", stage.id)
    .eq("role", "student")
    .order("created_at", { ascending: false });

  return <PlayersTable stage={stage} initialPlayers={players ?? []} />;
}
