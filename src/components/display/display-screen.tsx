"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { Countdown } from "@/components/ui/countdown";
import { PlayerGrid, usePlayerCards } from "@/components/student/player-grid";
import { createClient } from "@/lib/supabase/client";
import type { EventLogRow, Round, Stage } from "@/lib/supabase/database.types";

const EVENT_LABEL: Record<string, (payload: Record<string, unknown>) => string> = {
  round_results_published: () => "ظهرت نتائج الجولة",
  player_exposed: () => "انكشف أحد اللاعبين!",
};

export function DisplayScreen({
  stage,
  initialCards,
  currentRound,
  initialEvents,
}: {
  stage: Stage;
  initialCards: import("@/lib/supabase/database.types").PlayerCard[];
  currentRound: Round | null;
  initialEvents: EventLogRow[];
}) {
  const cards = usePlayerCards(stage.id, initialCards);
  const [events, setEvents] = useState(initialEvents);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`stage-${stage.id}-display-events`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events_log", filter: `stage_id=eq.${stage.id}` },
        (payload) => {
          const row = payload.new as EventLogRow;
          if (row.visible_to_students) setEvents((prev) => [row, ...prev].slice(0, 15));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stage.id]);

  const activeCount = cards.filter((c) => c.status === "active").length;
  const exposedCount = cards.filter((c) => c.status === "exposed").length;
  const topBalances = [...cards].sort((a, b) => b.balance - a.balance).slice(0, 5);

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  return (
    <div ref={containerRef} className="min-h-screen flex-1 overflow-y-auto px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo-masked.svg" alt="الملثم" className="h-10 w-10 drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]" />
          <div>
            <h1 className="text-2xl font-black text-amber-400 drop-shadow-[0_0_10px_rgba(255,215,0,0.35)]">الملثم</h1>
            <p className="text-xs text-[var(--stage-fg)]/50">{stage.name}</p>
          </div>
        </div>
        <button onClick={toggleFullscreen} className="rounded-lg border border-[var(--stage-border)] p-2">
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-[var(--stage-fg)]/60">الجولة الحالية</div>
          <div className="text-2xl font-black">{currentRound?.round_number ?? "—"}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-[var(--stage-fg)]/60">الوقت المتبقي</div>
          <div className="text-2xl font-black" dir="ltr">
            {currentRound?.status === "open" && currentRound.closes_at ? <Countdown target={currentRound.closes_at} /> : "—"}
          </div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-[var(--stage-fg)]/60">متخفون</div>
          <div className="text-2xl font-black text-emerald-400">{activeCount}</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-xs text-[var(--stage-fg)]/60">مكشوفون</div>
          <div className="text-2xl font-black text-red-400">{exposedCount}</div>
        </div>
      </div>

      {stage.enable_most_wanted && topBalances.length > 0 && (
        <div className="mb-6 glass-card p-4">
          <h2 className="mb-2 text-sm font-bold text-[var(--stage-fg)]/70">🔥 الأكثر طلبًا</h2>
          <div className="flex flex-wrap gap-3">
            {topBalances.map((c, i) => (
              <span key={c.id} className="rounded-full bg-white/5 px-3 py-1.5 text-sm font-bold">
                #{i + 1} {c.emoji} {c.display_name}
                {stage.show_balances && ` — ${c.balance}`}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <PlayerGrid cards={cards} showBalances={stage.show_balances} compact />

        <div className="glass-card h-fit p-4">
          <h2 className="mb-3 text-sm font-bold text-[var(--stage-fg)]/70">آخر الأحداث</h2>
          <ul className="space-y-2 text-sm">
            {events.length === 0 && <li className="text-[var(--stage-fg)]/40">لا توجد أحداث بعد</li>}
            {events.map((e) => (
              <li key={e.id} className="animate-pulse-glow rounded-lg bg-white/5 p-2.5">
                {EVENT_LABEL[e.type]?.(e.payload) ?? e.type}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
