"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlayerCard } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export function usePlayerCards(stageId: string, initial: PlayerCard[]) {
  const [cards, setCards] = useState(initial);

  useEffect(() => {
    const supabase = createClient();

    async function refresh() {
      const { data } = await supabase.rpc("get_stage_player_cards", { p_stage_id: stageId });
      if (data) setCards(data);
    }

    const channel = supabase
      .channel(`stage-${stageId}-cards`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events_log", filter: `stage_id=eq.${stageId}` },
        refresh
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stageId]);

  return cards;
}

export function PlayerGrid({ cards, currentUserId }: { cards: PlayerCard[]; currentUserId?: string }) {
  const active = cards.filter((c) => c.status === "active");
  const exposed = cards.filter((c) => c.status === "exposed");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {active.map((card) => (
          <PlayerFlipCard key={card.id} card={card} isSelf={card.id === currentUserId} />
        ))}
      </div>

      {exposed.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-bold text-[var(--stage-fg)]/60">تم كشفهم</h3>
          <div className="grid grid-cols-2 gap-3 opacity-60 sm:grid-cols-3 md:grid-cols-4">
            {exposed.map((card) => (
              <PlayerFlipCard key={card.id} card={card} isSelf={card.id === currentUserId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerFlipCard({ card, isSelf }: { card: PlayerCard; isSelf: boolean }) {
  const flipped = card.status === "exposed";

  return (
    <div className="card-flip-scene aspect-[3/4]">
      <div className={cn("card-flip-inner h-full w-full", flipped && "card-flipped")}>
        <div
          className={cn(
            "card-flip-face glass-card flex h-full flex-col items-center justify-center gap-1.5 p-3",
            isSelf && "border-[var(--stage-primary)] glow-primary"
          )}
        >
          <span className="text-3xl">{card.emoji}</span>
          <span className="text-center text-sm font-bold">{card.display_name}</span>
          <span className="text-xs text-[var(--stage-fg)]/60" dir="ltr">
            {card.balance}
          </span>
        </div>
        <div className="card-flip-face card-flip-back glass-card flex h-full flex-col items-center justify-center gap-1 p-3 text-center">
          <span className="text-xs text-[var(--stage-fg)]/50">تم الكشف</span>
          <span className="text-sm font-black">{card.real_name}</span>
          <span className="text-[11px] text-[var(--stage-fg)]/50">{card.display_name}</span>
        </div>
      </div>
    </div>
  );
}
