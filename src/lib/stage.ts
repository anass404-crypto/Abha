import { createClient } from "@/lib/supabase/server";
import type { Stage } from "@/lib/supabase/database.types";

export async function getStageBySlug(slug: string): Promise<Stage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return data as Stage;
}

export function generateUsername(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `p${digits}`;
}
