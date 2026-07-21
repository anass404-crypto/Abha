import { NextRequest, NextResponse } from "next/server";
import { requireStageAdmin } from "@/lib/auth";
import { generateUsername } from "@/lib/stage";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ stage: string; id: string }> }
) {
  const { stage: slug, id } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  let username = generateUsername();
  let attempts = 0;
  let updated = false;
  let lastError: string | null = null;

  while (attempts < 8 && !updated) {
    attempts += 1;
    const { error } = await supabase
      .from("profiles")
      .update({
        status: "active",
        username,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("stage_id", stage.id)
      .eq("status", "pending");

    if (!error) {
      updated = true;
    } else if (error.message.includes("profiles_stage_username_uk")) {
      username = generateUsername();
    } else {
      lastError = error.message;
      break;
    }
  }

  if (!updated) {
    return NextResponse.json({ error: lastError ?? "تعذر الاعتماد، حاول مرة أخرى" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, username });
}
