import { requireStageAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ stage: string }>;
}) {
  const { stage: slug } = await params;
  const { stage } = await requireStageAdmin(slug);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <AdminNav stageSlug={stage.slug} stageName={stage.name} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
