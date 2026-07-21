import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  stage_id: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(2),
});

export async function POST(request: NextRequest) {
  await requireSystemAdmin(); // redirects if not a system admin; throws are caught by Next as a 500 otherwise

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: "تعذر إنشاء الحساب (ربما البريد مستخدم)" }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    role: "stage_admin",
    stage_id: parsed.data.stage_id,
    auth_email: parsed.data.email,
    display_name: parsed.data.display_name,
    status: "active",
    balance: 0,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "تعذر إنشاء المشرف" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
