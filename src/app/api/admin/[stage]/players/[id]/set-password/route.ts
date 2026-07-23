import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStageAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف").max(72) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stage: string; id: string }> }
) {
  const { stage: slug, id } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", id)
    .eq("stage_id", stage.id)
    .eq("role", "student")
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "اللاعب غير موجود في هذه المرحلة" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: parsed.data.password });
  if (error) {
    return NextResponse.json({ error: "تعذر تغيير كلمة المرور" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
