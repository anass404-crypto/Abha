"use client";

import { PlayerGrid, usePlayerCards } from "@/components/student/player-grid";
import type { PlayerCard } from "@/lib/supabase/database.types";

export function AdminCompetitionsView({ stageId, initialCards }: { stageId: string; initialCards: PlayerCard[] }) {
  const cards = usePlayerCards(stageId, initialCards);

  return (
    <div>
      <h1 className="mb-6 text-xl font-black">شاشة المنافسات</h1>
      <PlayerGrid cards={cards} />
    </div>
  );
}
