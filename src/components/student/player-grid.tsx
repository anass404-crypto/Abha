"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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

export function PlayerGrid({
  cards,
  currentUserId,
  showBalances = true,
  compact = false,
}: {
  cards: PlayerCard[];
  currentUserId?: string;
  showBalances?: boolean;
  compact?: boolean;
}) {
  const topBalance = Math.max(0, ...cards.filter((c) => c.status === "active").map((c) => c.balance));

  return (
    <div
      className={cn(
        "grid",
        compact
          ? "grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 2xl:grid-cols-14"
          : "grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      )}
    >
      {cards.map((card, i) => (
        <PlayerFlipCard
          key={card.id}
          card={card}
          isSelf={card.id === currentUserId}
          isLeader={card.status === "active" && topBalance > 0 && card.balance === topBalance}
          showBalance={showBalances}
          compact={compact}
          index={i}
        />
      ))}
    </div>
  );
}

function PlayerFlipCard({
  card,
  isSelf,
  isLeader,
  showBalance,
  compact,
  index,
}: {
  card: PlayerCard;
  isSelf: boolean;
  isLeader: boolean;
  showBalance: boolean;
  compact: boolean;
  index: number;
}) {
  const exposed = card.status === "exposed";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.02, 0.4) }}
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border text-center",
        compact ? "gap-0.5 p-1.5" : "aspect-[3/4] gap-1.5 p-3",
        exposed
          ? "border-zinc-600/50 bg-zinc-800/60 grayscale"
          : "border-emerald-400/40 bg-gradient-to-br from-emerald-500/15 via-transparent to-emerald-400/5",
        isSelf && !exposed && "ring-2 ring-[var(--stage-primary)] shadow-[0_0_28px_-6px_var(--stage-primary)]"
      )}
    >
      {!exposed && !compact && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          animate={{ boxShadow: ["0 0 0px rgba(16,185,129,0)", "0 0 22px rgba(16,185,129,0.35)", "0 0 0px rgba(16,185,129,0)"] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: (index % 5) * 0.3 }}
        />
      )}

      {isLeader && (
        <span className={cn("absolute right-1 top-1 drop-shadow-[0_0_6px_rgba(250,204,21,0.9)]", compact ? "text-xs" : "text-lg")}>
          👑
        </span>
      )}
      {exposed && !compact && (
        <span className="absolute right-2 top-2 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
          مكشوف
        </span>
      )}

      <span className={cn(compact ? "text-lg" : "text-3xl", exposed && "opacity-70")}>{card.emoji}</span>

      {exposed ? (
        <>
          <span className={cn("truncate text-center font-black text-zinc-300", compact ? "max-w-full text-[10px]" : "text-sm")}>
            {card.real_name}
          </span>
          {!compact && <span className="text-[11px] text-zinc-500">{card.display_name}</span>}
        </>
      ) : (
        <span className={cn("truncate text-center font-bold text-emerald-50", compact ? "max-w-full text-[10px]" : "text-sm")}>
          {card.display_name}
        </span>
      )}

      {showBalance && (
        <span className={cn("font-mono", compact ? "text-[9px]" : "text-xs", exposed ? "text-zinc-500" : "text-emerald-300")} dir="ltr">
          {card.balance}
        </span>
      )}
    </motion.div>
  );
}
