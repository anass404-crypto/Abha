import { requireSystemAdmin } from "@/lib/auth";
import { SystemAdminNav } from "@/components/admin/system-admin-nav";

export default async function SystemAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSystemAdmin();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <SystemAdminNav />
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
