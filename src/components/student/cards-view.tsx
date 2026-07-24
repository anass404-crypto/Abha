"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { CardShopEntry, MyActionCard, PlayerCard } from "@/lib/supabase/database.types";

const STATUS_LABEL: Record<MyActionCard["status"], string> = {
  available: "متاحة",
  reserved: "محجوزة",
  used: "مستخدمة",
  expired: "منتهية",
  cancelled: "ملغاة",
};

function ShopTab({
  balance,
  entries,
}: {
  balance: number;
  entries: CardShopEntry[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function purchase(card: CardShopEntry) {
    setBusyId(card.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("purchase_action_card", { p_stage_action_card_id: card.id });
    setBusyId(null);
    if (error) {
      toast.error(error.message.includes("insufficient") ? "رصيدك لا يكفي لشراء هذه البطاقة" : "تعذر إتمام الشراء");
      return;
    }
    toast.success(`تم شراء "${card.name}"`);
    router.refresh();
  }

  if (entries.length === 0) {
    return <p className="text-sm text-[var(--stage-fg)]/50">لا توجد بطاقات معروضة حاليًا</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map((card) => (
        <Card key={card.id} className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xl">{card.is_undiscovered ? "❔" : card.icon}</span>
            <div className="min-w-0">
              <div className="truncate font-bold">{card.name}</div>
              {card.description && <div className="text-xs text-[var(--stage-fg)]/50">{card.description}</div>}
            </div>
          </div>
          <div className="mb-3 flex items-center justify-between text-xs text-[var(--stage-fg)]/60">
            <span>السعر: {card.price_points}</span>
            <span>{card.sold_out ? "نفدت الكمية" : `المتبقي: ${card.remaining_copies}`}</span>
          </div>
          <Button
            className="w-full"
            disabled={!card.is_purchasable || card.sold_out || balance < card.price_points || busyId === card.id}
            onClick={() => purchase(card)}
          >
            {busyId === card.id ? "جارٍ الشراء..." : "شراء"}
          </Button>
        </Card>
      ))}
    </div>
  );
}

function MyCardsTab({
  myCards,
  cancellableUsageByCard,
  openRoundId,
  targets,
}: {
  myCards: MyActionCard[];
  cancellableUsageByCard: Record<string, string>;
  openRoundId: string | null;
  targets: PlayerCard[];
}) {
  const router = useRouter();
  const [pendingCard, setPendingCard] = useState<MyActionCard | null>(null);
  const [targetId, setTargetId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function activateCard(card: MyActionCard, target: string | null) {
    if (!openRoundId) return;
    setBusyId(card.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("use_action_card", {
      p_player_action_card_id: card.id,
      p_round_id: openRoundId,
      p_target_student_id: target,
    });
    setBusyId(null);
    if (error) {
      toast.error("تعذر استخدام البطاقة");
      return;
    }
    toast.success(`تم تفعيل بطاقة "${card.card_name}"`);
    setPendingCard(null);
    setTargetId("");
    router.refresh();
  }

  async function cancel(usageId: string) {
    setBusyId(usageId);
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_action_card_usage", { p_usage_id: usageId });
    setBusyId(null);
    if (error) {
      toast.error("لا يمكن إلغاء هذه البطاقة");
      return;
    }
    toast.success("تم إلغاء استخدام البطاقة");
    router.refresh();
  }

  if (myCards.length === 0) {
    return <p className="text-sm text-[var(--stage-fg)]/50">لا تملك أي بطاقات بعد</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {myCards.map((card) => {
        const usageId = cancellableUsageByCard[card.id];
        return (
          <Card key={card.id} className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-2xl">{card.card_icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{card.card_name}</div>
                <div className="text-xs text-[var(--stage-fg)]/50">{STATUS_LABEL[card.status]}</div>
              </div>
            </div>

            {card.status === "available" && (
              <Button
                className="w-full"
                disabled={!openRoundId || busyId === card.id}
                onClick={() => (card.requires_target ? setPendingCard(card) : activateCard(card, null))}
              >
                {!openRoundId ? "لا توجد جولة مفتوحة" : busyId === card.id ? "جارٍ التفعيل..." : "استخدام"}
              </Button>
            )}

            {card.status === "reserved" && usageId && (
              <Button variant="ghost" className="w-full" disabled={busyId === usageId} onClick={() => cancel(usageId)}>
                {busyId === usageId ? "جارٍ الإلغاء..." : "إلغاء الاستخدام"}
              </Button>
            )}
          </Card>
        );
      })}

      {pendingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-sm">
            <h3 className="mb-3 font-bold">اختر الهدف لبطاقة &quot;{pendingCard.card_name}&quot;</h3>
            <select
              className="mb-3 w-full rounded-lg border border-[var(--stage-border)] bg-black/20 p-2.5 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">اختر لاعبًا</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.display_name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setPendingCard(null)}>
                إلغاء
              </Button>
              <Button className="flex-1" disabled={!targetId} onClick={() => activateCard(pendingCard, targetId)}>
                تأكيد
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export function CardsView({
  balance,
  shop,
  myCards,
  cancellableUsageByCard,
  openRoundId,
  targets,
}: {
  balance: number;
  shop: CardShopEntry[];
  myCards: MyActionCard[];
  cancellableUsageByCard: Record<string, string>;
  openRoundId: string | null;
  targets: PlayerCard[];
}) {
  const [tab, setTab] = useState<"shop" | "mine">("shop");

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setTab("shop")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
            tab === "shop" ? "bg-[var(--stage-primary)] text-white" : "bg-white/5 text-[var(--stage-fg)]/60"
          }`}
        >
          المتجر
        </button>
        <button
          onClick={() => setTab("mine")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
            tab === "mine" ? "bg-[var(--stage-primary)] text-white" : "bg-white/5 text-[var(--stage-fg)]/60"
          }`}
        >
          بطاقاتي
        </button>
      </div>

      {tab === "shop" ? (
        <ShopTab balance={balance} entries={shop} />
      ) : (
        <MyCardsTab
          myCards={myCards}
          cancellableUsageByCard={cancellableUsageByCard}
          openRoundId={openRoundId}
          targets={targets}
        />
      )}
    </div>
  );
}
