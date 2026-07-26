"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
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
  light = false,
  onMessage,
}: {
  cards: PlayerCard[];
  currentUserId?: string;
  showBalances?: boolean;
  compact?: boolean;
  light?: boolean;
  onMessage?: (card: PlayerCard) => void;
}) {
  const topBalance = Math.max(0, ...cards.filter((c) => c.status === "active").map((c) => c.balance));

  return (
    <div
      className={cn(
        "grid",
        compact ? "grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2" : "grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
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
          light={light}
          onMessage={
            onMessage && card.id !== currentUserId && card.status === "active" ? () => onMessage(card) : undefined
          }
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
  light,
  onMessage,
  index,
}: {
  card: PlayerCard;
  isSelf: boolean;
  isLeader: boolean;
  showBalance: boolean;
  compact: boolean;
  light: boolean;
  onMessage?: () => void;
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
        compact ? "gap-1 p-2" : "aspect-[3/4] gap-1.5 p-3",
        exposed
          ? light
            ? "border-zinc-300 bg-zinc-100"
            : "border-zinc-600/50 bg-zinc-800/60 grayscale"
          : light
            ? "border-emerald-500/50 bg-emerald-50"
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
        <span className={cn("absolute right-1 top-1 drop-shadow-[0_0_6px_rgba(250,204,21,0.9)]", compact ? "text-sm" : "text-lg")}>
          👑
        </span>
      )}
      {exposed && (
        <span
          className={cn(
            "absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            light ? "bg-red-100 text-red-700" : "bg-red-500/20 text-red-400"
          )}
        >
          مكشوف
        </span>
      )}

      <span className={cn(compact ? "text-2xl" : "text-3xl", exposed && !light && "opacity-70")}>{card.emoji}</span>

      {exposed ? (
        <>
          <span
            className={cn(
              "break-words text-center font-black leading-tight",
              light ? "text-zinc-800" : "text-zinc-300",
              compact ? "text-[11px]" : "text-sm"
            )}
          >
            {card.real_name}
          </span>
          <span
            className={cn(
              "truncate text-center font-bold",
              light ? "text-zinc-600" : "text-zinc-400",
              compact ? "text-[11px]" : "text-xs"
            )}
          >
            {card.display_name}
          </span>
        </>
      ) : (
        <span
          className={cn(
            "truncate text-center font-bold",
            light ? "text-emerald-900" : "text-emerald-50",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {card.display_name}
        </span>
      )}

      {showBalance && (
        <span
          className={cn(
            "font-mono",
            compact ? "text-[10px]" : "text-xs",
            exposed ? (light ? "text-zinc-500" : "text-zinc-500") : light ? "text-emerald-700" : "text-emerald-300"
          )}
          dir="ltr"
        >
          {card.balance}
        </span>
      )}

      {onMessage && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMessage();
          }}
          className={cn(
            "mt-0.5 flex items-center justify-center rounded-full p-1 transition-colors",
            light ? "bg-black/5 text-zinc-600 hover:bg-black/10" : "bg-white/10 text-[var(--stage-fg)]/70 hover:bg-white/20"
          )}
          title="إرسال رسالة"
        >
          <MessageCircle size={13} />
        </button>
      )}
    </motion.div>
  );
}
