import { requireSystemAdmin } from "@/lib/auth";
import { StagesManager } from "@/components/admin/stages-manager";

export default async function SystemAdminHomePage() {
  const { supabase } = await requireSystemAdmin();

  const { data: stages } = await supabase.from("stages").select("*").order("created_at", { ascending: false });

  return <StagesManager initialStages={stages ?? []} />;
}
