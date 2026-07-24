"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlayerGrid, usePlayerCards } from "@/components/student/player-grid";
import type { PlayerCard, Profile, Stage } from "@/lib/supabase/database.types";

export function LeaderboardView({
  stage,
  profile,
  initialCards,
}: {
  stage: Stage;
  profile: Profile;
  initialCards: PlayerCard[];
}) {
  const router = useRouter();
  const cards = usePlayerCards(stage.id, initialCards);
  const topFive = [...cards].sort((a, b) => b.balance - a.balance).slice(0, 5);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-black">لوحة المتنافسين</h1>
        <Button variant="ghost" onClick={() => router.push(`/${stage.slug}`)}>
          الرئيسية
        </Button>
      </div>

      {stage.enable_most_wanted && topFive.length > 0 && (
        <div className="mb-6 glass-card p-4">
          <h2 className="mb-2 text-sm font-bold text-[var(--stage-fg)]/70">🔥 الأكثر طلبًا</h2>
          <div className="flex flex-wrap gap-3">
            {topFive.map((c, i) => (
              <span key={c.id} className="rounded-full bg-white/5 px-3 py-1 text-sm font-bold">
                #{i + 1} {c.emoji} {c.display_name}
                {stage.show_balances && ` — ${c.balance}`}
              </span>
            ))}
          </div>
        </div>
      )}

      <PlayerGrid cards={cards} currentUserId={profile.id} showBalances={stage.show_balances} />
    </main>
  );
}
