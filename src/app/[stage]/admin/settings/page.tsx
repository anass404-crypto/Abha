import { requireStageAdmin } from "@/lib/auth";
import { StageSettingsForm } from "@/components/admin/stage-settings-form";

export default async function AdminSettingsPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { stage } = await requireStageAdmin(slug);

  return <StageSettingsForm stage={stage} />;
}
