"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { CardEffectKey, CardRarity, CardShopEntry, MyActionCard, PlayerCard } from "@/lib/supabase/database.types";

const STATUS_LABEL: Record<MyActionCard["status"], string> = {
  available: "متاحة",
  reserved: "محجوزة",
  used: "مستخدمة",
  expired: "منتهية",
  cancelled: "ملغاة",
};

const RARITY_STYLES: Record<CardRarity, { label: string; border: string; glow: string; headerBg: string; chip: string }> = {
  common: {
    label: "عادية",
    border: "border-slate-400/40",
    glow: "shadow-[0_0_18px_-8px_rgba(148,163,184,0.5)]",
    headerBg: "from-slate-500/25 via-slate-400/5 to-transparent",
    chip: "bg-slate-500/20 text-slate-300",
  },
  rare: {
    label: "نادرة",
    border: "border-sky-400/50",
    glow: "shadow-[0_0_20px_-6px_rgba(56,189,248,0.55)]",
    headerBg: "from-sky-500/25 via-sky-400/5 to-transparent",
    chip: "bg-sky-500/20 text-sky-300",
  },
  epic: {
    label: "ملحمية",
    border: "border-purple-400/50",
    glow: "shadow-[0_0_22px_-6px_rgba(192,132,252,0.6)]",
    headerBg: "from-purple-500/25 via-purple-400/5 to-transparent",
    chip: "bg-purple-500/20 text-purple-300",
  },
  legendary: {
    label: "أسطورية",
    border: "border-amber-400/60",
    glow: "shadow-[0_0_28px_-4px_rgba(251,191,36,0.65)]",
    headerBg: "from-amber-500/30 via-amber-400/10 to-transparent",
    chip: "bg-amber-500/20 text-amber-300",
  },
};

const EFFECT_TAG: Record<CardEffectKey, string> = {
  shadow_shield: "🛡️ دفاع",
  protected_copy: "💎 حماية شاملة",
  double_vision: "👁️ كشف إضافي",
  double_points: "✨ تعزيز نقاط",
  reveal_freeze: "❄️ تعطيل خصم",
  temp_exclusion: "⛔ إقصاء خصم",
};

function PowerCard({
  icon,
  name,
  rarity,
  effectKey,
  description,
  footer,
}: {
  icon: string | null;
  name: string;
  rarity: CardRarity;
  effectKey: CardEffectKey | null;
  description: string | null;
  footer: React.ReactNode;
}) {
  const style = RARITY_STYLES[rarity];

  return (
    <div className={cn("overflow-hidden rounded-2xl border-2 bg-black/20", style.border, style.glow)}>
      <div className={cn("relative flex flex-col items-center gap-1 bg-gradient-to-b px-4 pb-3 pt-4", style.headerBg)}>
        <span className={cn("absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold", style.chip)}>
          {style.label}
        </span>
        <span className="text-5xl drop-shadow-[0_0_10px_rgba(255,255,255,0.25)]">{icon ?? "❔"}</span>
        <span className="text-center text-base font-black">{name}</span>
        {effectKey && (
          <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-bold text-[var(--stage-fg)]/80">
            {EFFECT_TAG[effectKey]}
          </span>
        )}
      </div>

      <div className="space-y-3 p-4">
        <p className="min-h-[2.5rem] text-xs leading-relaxed text-[var(--stage-fg)]/70">
          {description ?? "قوة هذه البطاقة غير معروفة بعد — جرّب اكتشافها."}
        </p>
        {footer}
      </div>
    </div>
  );
}

function ShopTab({ balance, entries }: { balance: number; entries: CardShopEntry[] }) {
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((card) => (
        <PowerCard
          key={card.id}
          icon={card.is_undiscovered ? "❔" : card.icon}
          name={card.name}
          rarity={card.rarity}
          effectKey={card.effect_key}
          description={card.description}
          footer={
            <>
              <div className="flex items-center justify-between text-xs text-[var(--stage-fg)]/60">
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
            </>
          }
        />
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {myCards.map((card) => {
        const usageId = cancellableUsageByCard[card.id];
        return (
          <PowerCard
            key={card.id}
            icon={card.card_icon}
            name={card.card_name}
            rarity={card.rarity}
            effectKey={card.effect_key}
            description={card.card_description}
            footer={
              <>
                <div className="text-center text-xs font-bold text-[var(--stage-fg)]/60">{STATUS_LABEL[card.status]}</div>

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
              </>
            }
          />
        );
      })}

      {pendingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass-card w-full max-w-sm p-5">
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
          </div>
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
