import { NextRequest, NextResponse } from "next/server";
import { registerSchema, containsBlockedTerm } from "@/lib/validation/schemas";
import { getStageBySlug } from "@/lib/stage";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest, { params }: { params: Promise<{ stage: string }> }) {
  const { stage: stageSlug } = await params;
  const stage = await getStageBySlug(stageSlug);
  if (!stage) {
    return NextResponse.json({ error: "المرحلة غير موجودة" }, { status: 404 });
  }
  if (!stage.registration_open) {
    return NextResponse.json({ error: "التسجيل مغلق حاليًا لهذه المرحلة" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  for (const def of stage.extra_field_defs ?? []) {
    const value = input.extra_fields[def.key]?.trim();
    if (def.required && !value) {
      return NextResponse.json({ error: `حقل "${def.label}" مطلوب` }, { status: 400 });
    }
    if (value && containsBlockedTerm(value)) {
      return NextResponse.json({ error: `حقل "${def.label}" غير مناسب` }, { status: 400 });
    }
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id, status")
    .eq("stage_id", stage.id)
    .eq("role", "student")
    .eq("phone", input.phone)
    .maybeSingle();

  if (existing) {
    if (existing.status === "rejected") {
      // A rejected applicant is allowed to apply again — clear out the old
      // rejected account (auth user delete cascades the profile row) so the
      // phone/display-name uniqueness checks below don't block the retry.
      await admin.auth.admin.deleteUser(existing.id);
    } else {
      return NextResponse.json({ error: "رقم الجوال مسجل مسبقًا في هذه المرحلة" }, { status: 409 });
    }
  }

  const syntheticEmail = `${randomUUID()}@stage-${stage.slug}.invalid`;

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: input.password,
    email_confirm: true,
  });

  if (createUserError || !created.user) {
    return NextResponse.json({ error: "تعذر إنشاء الحساب، حاول مرة أخرى" }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    stage_id: stage.id,
    role: "student",
    real_name: input.real_name,
    display_name: input.display_name,
    phone: input.phone,
    emoji: input.emoji,
    auth_email: syntheticEmail,
    extra_fields: input.extra_fields,
    status: stage.auto_approve ? "active" : "pending",
    balance: stage.starting_balance,
    approved_at: stage.auto_approve ? new Date().toISOString() : null,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);

    const message = profileError.message ?? "";
    if (message.includes("profiles_stage_phone_uk")) {
      return NextResponse.json({ error: "رقم الجوال مسجل مسبقًا في هذه المرحلة" }, { status: 409 });
    }
    if (message.includes("profiles_stage_display_name_uk")) {
      return NextResponse.json({ error: "الاسم المستعار مستخدم بالفعل، اختر اسمًا آخر" }, { status: 409 });
    }
    return NextResponse.json({ error: "تعذر إكمال التسجيل، حاول مرة أخرى" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, autoApproved: stage.auto_approve });
}
