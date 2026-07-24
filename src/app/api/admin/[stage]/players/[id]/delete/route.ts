import { NextRequest, NextResponse } from "next/server";
import { requireStageAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stage: string; id: string }> }
) {
  const { stage: slug, id } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", id)
    .eq("stage_id", stage.id)
    .eq("role", "student")
    .eq("status", "rejected")
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "لا يمكن حذف هذا اللاعب (يجب أن يكون طلبه مرفوضًا)" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: "تعذر حذف الطلب" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
