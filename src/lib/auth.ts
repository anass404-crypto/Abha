import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStageBySlug } from "@/lib/stage";
import type { Profile, Stage } from "@/lib/supabase/database.types";

export async function requireStudent(stageSlug: string): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  stage: Stage;
  profile: Profile;
}> {
  const stage = await getStageBySlug(stageSlug);
  if (!stage) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${stageSlug}/login`);

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || profile.stage_id !== stage.id || profile.role !== "student") {
    await supabase.auth.signOut();
    redirect(`/${stageSlug}/login`);
  }
  if (profile.status === "pending" || profile.status === "rejected") {
    redirect(`/${stageSlug}/pending`);
  }
  if (profile.status === "exposed") {
    redirect(`/${stageSlug}/display`);
  }

  return { supabase, stage, profile: profile as Profile };
}

export async function requireStageMember(stageSlug: string): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  stage: Stage;
  profile: Profile;
}> {
  const stage = await getStageBySlug(stageSlug);
  if (!stage) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${stageSlug}/login`);

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const isMember =
    profile &&
    profile.stage_id === stage.id &&
    ((profile.role === "student" && profile.status !== "pending" && profile.status !== "rejected") ||
      profile.role === "stage_admin");
  const isSystemAdmin = profile?.role === "system_admin";

  if (!isMember && !isSystemAdmin) {
    redirect(`/${stageSlug}/login`);
  }

  return { supabase, stage, profile: profile as Profile };
}

export async function requireSystemAdmin(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  profile: Profile;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/system/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "system_admin") {
    await supabase.auth.signOut();
    redirect("/admin/system/login");
  }

  return { supabase, profile: profile as Profile };
}

export async function requireStageAdmin(stageSlug: string): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  stage: Stage;
  profile: Profile;
}> {
  const stage = await getStageBySlug(stageSlug);
  if (!stage) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${stageSlug}/login`);

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const isAllowed =
    profile && (profile.role === "system_admin" || (profile.role === "stage_admin" && profile.stage_id === stage.id));

  if (!isAllowed) {
    await supabase.auth.signOut();
    redirect(`/${stageSlug}/login`);
  }

  return { supabase, stage, profile: profile as Profile };
}
