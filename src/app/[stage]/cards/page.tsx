import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { CardsView } from "@/components/student/cards-view";

export default async function CardsPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage, profile } = await requireStudent(slug);
  if (!stage.enable_action_cards) redirect(`/${slug}`);

  const [{ data: shop }, { data: myCards }, { data: openRound }, { data: playerCards }, { data: usages }] =
    await Promise.all([
      supabase.rpc("get_stage_card_shop", { p_stage_id: stage.id }),
      supabase.rpc("get_my_action_cards", { p_stage_id: stage.id }),
      supabase
        .from("rounds")
        .select("id")
        .eq("stage_id", stage.id)
        .eq("status", "open")
        .order("round_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("get_stage_player_cards", { p_stage_id: stage.id }),
      supabase
        .from("action_card_usages")
        .select("id, player_action_card_id")
        .eq("student_id", profile.id)
        .eq("status", "reserved"),
    ]);

  const cancellableUsageByCard = Object.fromEntries(
    (usages ?? []).map((u) => [u.player_action_card_id, u.id])
  );
  const targets = (playerCards ?? []).filter((c) => c.id !== profile.id && c.status === "active");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-xl font-black">البطاقات</h1>
      <CardsView
        balance={profile.balance}
        shop={shop ?? []}
        myCards={myCards ?? []}
        cancellableUsageByCard={cancellableUsageByCard}
        openRoundId={openRound?.id ?? null}
        targets={targets}
      />
    </main>
  );
}
