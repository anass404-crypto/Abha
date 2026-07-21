import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  setupCode: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const secret = process.env.SYSTEM_ADMIN_SETUP_CODE;
  if (!secret) {
    return NextResponse.json({ error: "لم يتم إعداد رمز التهيئة على الخادم" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  if (parsed.data.setupCode !== secret) {
    return NextResponse.json({ error: "رمز التهيئة غير صحيح" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "system_admin");
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "تم إنشاء مسؤول النظام مسبقًا" }, { status: 409 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: "تعذر إنشاء الحساب" }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    role: "system_admin",
    stage_id: null,
    auth_email: parsed.data.email,
    display_name: "مسؤول النظام",
    status: "active",
    balance: 0,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "تعذر إكمال الإعداد" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
