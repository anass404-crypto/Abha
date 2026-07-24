import { requireStageAdmin } from "@/lib/auth";
import { RevealLogAdminView } from "@/components/admin/reveal-log-admin-view";

export default async function AdminRevealLogPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const { data: rounds } = await supabase.from("rounds").select("id, round_number, status").eq("stage_id", stage.id);
  const roundIds = (rounds ?? []).map((r) => r.id);
  const roundMap = new Map((rounds ?? []).map((r) => [r.id, r]));

  const { data: attempts } =
    roundIds.length > 0
      ? await supabase
          .from("reveal_attempts")
          .select("*")
          .in("round_id", roundIds)
          .order("submitted_at", { ascending: false })
      : { data: [] };

  const ids = Array.from(
    new Set((attempts ?? []).flatMap((a) => [a.revealer_id, a.target_id]))
  );
  const { data: people } =
    ids.length > 0 ? await supabase.from("profiles").select("id, display_name, real_name").in("id", ids) : { data: [] };
  const peopleMap = new Map((people ?? []).map((p) => [p.id, p]));

  const effectIds = Array.from(new Set((attempts ?? []).map((a) => a.blocking_effect_id).filter(Boolean))) as string[];
  const { data: effects } =
    effectIds.length > 0
      ? await supabase.from("action_card_effects").select("id, effect_key, stage_action_card_id").in("id", effectIds)
      : { data: [] };
  const cardIds = Array.from(new Set((effects ?? []).map((e) => e.stage_action_card_id)));
  const { data: cards } =
    cardIds.length > 0 ? await supabase.from("stage_action_cards").select("id, name").in("id", cardIds) : { data: [] };
  const cardNameByCardId = new Map((cards ?? []).map((c) => [c.id, c.name]));
  const effectMap = new Map(
    (effects ?? []).map((e) => [e.id, { effect_key: e.effect_key, card_name: cardNameByCardId.get(e.stage_action_card_id) ?? "—" }])
  );

  const rows = (attempts ?? []).map((a) => ({
    ...a,
    round_number: roundMap.get(a.round_id)?.round_number ?? 0,
    round_status: roundMap.get(a.round_id)?.status ?? "draft",
    revealer_display_name: peopleMap.get(a.revealer_id)?.display_name ?? "—",
    target_display_name: peopleMap.get(a.target_id)?.display_name ?? "—",
    target_real_name: peopleMap.get(a.target_id)?.real_name ?? "—",
    blocking_card_name: a.blocking_effect_id ? effectMap.get(a.blocking_effect_id)?.card_name ?? null : null,
  }));

  return <RevealLogAdminView rows={rows} />;
}
