"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, StatTile } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { createClient } from "@/lib/supabase/client";
import { isWithinWindow } from "@/lib/utils";
import type { NotificationRow, Profile, Round, Stage } from "@/lib/supabase/database.types";

const STATUS_LABEL: Record<string, string> = {
  active: "متخفٍ 🥷",
  exposed: "مكشوف 🎭",
  suspended: "موقوف",
  excluded: "مستبعد",
  pending: "بانتظار الاعتماد",
  rejected: "مرفوض",
};

export function StudentHome({
  stage,
  profile,
  currentRound,
  rank,
  remainingCount,
  notifications,
}: {
  stage: Stage;
  profile: Profile;
  currentRound: Round | null;
  rank: number | null;
  remainingCount: number;
  notifications: NotificationRow[];
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`stage-${stage.id}-home`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `stage_id=eq.${stage.id}` },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `student_id=eq.${profile.id}` },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stage.id, profile.id, router]);

  const roundIsOpen =
    currentRound?.status === "open" && isWithinWindow(currentRound.opens_at, currentRound.closes_at);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-3xl">{profile.emoji}</div>
          <h1 className="text-xl font-black">{profile.display_name}</h1>
          <span className="text-xs text-[var(--stage-fg)]/60">{STATUS_LABEL[profile.status]}</span>
        </div>
        <div className="text-left">
          <div className="text-xs text-[var(--stage-fg)]/60">رصيدك</div>
          <div className="text-3xl font-black text-gradient" dir="ltr">
            {profile.balance}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatTile label="ترتيبك" value={rank ? `#${rank}` : "—"} />
        <StatTile label="المتبقون" value={remainingCount} />
      </div>

      <Card className="mb-6">
        {currentRound ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--stage-fg)]/70">
                الجولة {currentRound.round_number}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  roundIsOpen ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-[var(--stage-fg)]/60"
                }`}
              >
                {roundIsOpen ? "مفتوحة" : currentRound.status === "closed" ? "مغلقة" : "بانتظار النتائج"}
              </span>
            </div>
            <h2 className="mb-1 text-lg font-black">{currentRound.title}</h2>
            {roundIsOpen && (
              <p className="mb-3 text-sm text-[var(--stage-fg)]/70">
                الوقت المتبقي: <Countdown target={currentRound.closes_at} className="font-mono font-bold" />
              </p>
            )}
            <div className="mb-3 flex gap-4 text-xs text-[var(--stage-fg)]/60">
              <span>نقاط الجولة: {currentRound.points}</span>
              <span>محاولات الكشف: {currentRound.reveal_attempts_allowed}</span>
            </div>
            {roundIsOpen ? (
              <Button className="w-full" onClick={() => router.push(`/${stage.slug}/round`)}>
                دخول الجولة
              </Button>
            ) : (
              <Button className="w-full" variant="ghost" disabled>
                {currentRound.status === "closed" ? "بانتظار اعتماد النتائج" : "لا توجد جولة مفتوحة الآن"}
              </Button>
            )}
          </>
        ) : (
          <p className="text-center text-sm text-[var(--stage-fg)]/60">لا توجد جولة متاحة حاليًا</p>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => router.push(`/${stage.slug}/leaderboard`)}>
          لوحة المتنافسين
        </Button>
        <Button variant="ghost" onClick={() => router.push(`/${stage.slug}/history`)}>
          سجل الرصيد
        </Button>
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-bold text-[var(--stage-fg)]/80">آخر الإشعارات</h3>
        {notifications.length === 0 ? (
          <p className="text-sm text-[var(--stage-fg)]/50">لا توجد إشعارات بعد</p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className="rounded-lg bg-white/5 p-2.5 text-sm">
                <div className="font-bold">{n.title}</div>
                {n.body && <div className="text-xs text-[var(--stage-fg)]/60">{n.body}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
