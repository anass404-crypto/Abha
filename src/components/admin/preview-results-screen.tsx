"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlayerGrid } from "@/components/student/player-grid";
import type { PlayerCard, Round, Stage } from "@/lib/supabase/database.types";

export function PreviewResultsScreen({
  stage,
  round,
  cards,
}: {
  stage: Stage;
  round: Round;
  cards: PlayerCard[];
}) {
  return (
    <div>
      <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        <p className="font-black text-amber-400">👁️ معاينة خاصة بك فقط</p>
        <p className="text-[var(--stage-fg)]/70">
          هذا شكل شاشة العرض والمتنافسين بعد تطبيق نتائج الجولة {round.round_number}. الطلاب ما زالوا لا يرون هذا —
          البيانات الفعلية ما تغيّرت بعد. اضغط &quot;نشر النتائج للطلاب&quot; من صفحة الجولة عشان تصير حقيقية وتظهر لهم.
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-black">معاينة نتائج الجولة {round.round_number}: {round.title}</h1>
        <Link href={`/${stage.slug}/admin/rounds/${round.id}`}>
          <Button variant="ghost">رجوع لتحكم الجولة</Button>
        </Link>
      </div>

      <PlayerGrid cards={cards} />
    </div>
  );
}
