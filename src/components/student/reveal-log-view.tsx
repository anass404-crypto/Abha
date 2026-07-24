"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import type { RevealLogEntry } from "@/lib/supabase/database.types";

const OUTCOME_LABEL: Record<RevealLogEntry["outcome"], string> = {
  exposed: "تم كشف الهوية",
  incomplete: "لم يكتمل الكشف",
};

export function RevealLogView({ entries }: { entries: RevealLogEntry[] }) {
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | RevealLogEntry["outcome"]>("all");
  const [roundFilter, setRoundFilter] = useState<number | "all">("all");

  const rounds = useMemo(
    () => Array.from(new Set(entries.map((e) => e.round_number))).sort((a, b) => b - a),
    [entries]
  );

  const filtered = entries.filter(
    (e) =>
      (outcomeFilter === "all" || e.outcome === outcomeFilter) &&
      (roundFilter === "all" || e.round_number === roundFilter)
  );

  const grouped = useMemo(() => {
    const map = new Map<number, RevealLogEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.round_number) ?? [];
      list.push(e);
      map.set(e.round_number, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const exposedCount = entries.filter((e) => e.outcome === "exposed").length;
  const incompleteCount = entries.filter((e) => e.outcome === "incomplete").length;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Card className="p-3 text-center">
          <div className="text-2xl font-black text-emerald-400">{exposedCount}</div>
          <div className="text-xs text-[var(--stage-fg)]/60">تم كشف الهوية</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-black text-[var(--stage-fg)]/60">{incompleteCount}</div>
          <div className="text-xs text-[var(--stage-fg)]/60">لم يكتمل الكشف</div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-[var(--stage-border)] bg-black/20 px-2.5 py-1.5 text-xs"
          value={roundFilter}
          onChange={(e) => setRoundFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">كل الجولات</option>
          {rounds.map((r) => (
            <option key={r} value={r}>
              الجولة {r}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-[var(--stage-border)] bg-black/20 px-2.5 py-1.5 text-xs"
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value as "all" | RevealLogEntry["outcome"])}
        >
          <option value="all">كل النتائج</option>
          <option value="exposed">تم كشف الهوية</option>
          <option value="incomplete">لم يكتمل الكشف</option>
        </select>
      </div>

      {grouped.length === 0 && <p className="text-sm text-[var(--stage-fg)]/50">لا توجد محاولات كشف بعد</p>}

      <div className="space-y-5">
        {grouped.map(([roundNumber, list]) => (
          <div key={roundNumber}>
            <h3 className="mb-2 text-sm font-bold text-[var(--stage-fg)]/70">الجولة {roundNumber}</h3>
            <div className="space-y-2">
              {list.map((e, i) => (
                <Card key={`${e.round_id}-${e.revealer_id}-${e.target_id}-${i}`} className="flex items-center justify-between p-3">
                  <div className="text-sm">
                    <span className="font-bold">
                      {e.revealer_emoji} {e.revealer_display_name}
                    </span>
                    <span className="mx-1.5 text-[var(--stage-fg)]/40">→</span>
                    <span className="font-bold">
                      {e.target_emoji} {e.target_display_name}
                    </span>
                    {e.outcome === "exposed" && e.target_real_name && (
                      <div className="mt-0.5 text-xs text-emerald-400">الاسم الحقيقي: {e.target_real_name}</div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      e.outcome === "exposed" ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-[var(--stage-fg)]/60"
                    }`}
                  >
                    {OUTCOME_LABEL[e.outcome]}
                  </span>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
