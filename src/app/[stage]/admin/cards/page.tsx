import { requireStageAdmin } from "@/lib/auth";
import { CardsAdminView } from "@/components/admin/cards-admin-view";

export default async function AdminCardsPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const [{ data: templates }, { data: stageCards }, { data: students }, { data: rules }, { data: rewards }, { data: pendingGrants }] =
    await Promise.all([
      supabase.from("action_card_templates").select("*").order("code"),
      supabase.from("stage_action_cards").select("*").eq("stage_id", stage.id).order("created_at"),
      supabase
        .from("profiles")
        .select("id, display_name, real_name")
        .eq("stage_id", stage.id)
        .eq("role", "student")
        .order("display_name"),
      supabase.from("action_card_rules").select("*").eq("stage_id", stage.id).order("created_at"),
      supabase
        .from("action_card_rule_rewards")
        .select("*, action_card_rules!inner(stage_id)")
        .eq("action_card_rules.stage_id", stage.id),
      supabase
        .from("action_card_rule_grants")
        .select("*")
        .eq("stage_id", stage.id)
        .eq("approved", false)
        .order("triggered_at", { ascending: false }),
    ]);

  const grantStudentIds = Array.from(new Set((pendingGrants ?? []).map((g) => g.student_id)));
  const { data: grantStudents } =
    grantStudentIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", grantStudentIds)
      : { data: [] };
  const grantStudentMap = new Map((grantStudents ?? []).map((s) => [s.id, s.display_name]));

  const pendingGrantRows = (pendingGrants ?? []).map((g) => ({
    ...g,
    student_display_name: grantStudentMap.get(g.student_id) ?? "—",
    rule_name: (rules ?? []).find((r) => r.id === g.rule_id)?.name ?? "—",
  }));

  return (
    <CardsAdminView
      stage={stage}
      templates={templates ?? []}
      stageCards={stageCards ?? []}
      students={students ?? []}
      rules={rules ?? []}
      rewards={(rewards ?? []).map((r) => ({
        id: r.id,
        rule_id: r.rule_id,
        stage_action_card_id: r.stage_action_card_id,
        quantity: r.quantity,
        validity_hours_override: r.validity_hours_override,
        reserved_for_next_round: r.reserved_for_next_round,
      }))}
      pendingGrants={pendingGrantRows}
    />
  );
}
