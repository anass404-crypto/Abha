"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { RevealLogView } from "@/components/student/reveal-log-view";
import type { BalanceLedgerEntry, RevealLogEntry } from "@/lib/supabase/database.types";

const TYPE_LABEL: Record<string, string> = {
  correct_answer: "إجابة صحيحة",
  reveal_gain: "كشف لاعب",
  admin_adjustment: "تعديل إداري",
  exposed_reset: "تصفير بسبب الكشف",
  card_purchase: "شراء بطاقة",
  card_refund: "استرجاع بطاقة",
};

function LedgerList({ entries }: { entries: BalanceLedgerEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-[var(--stage-fg)]/50">لا توجد حركات بعد</p>;
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <Card key={entry.id} className="flex items-center justify-between p-3.5">
          <div>
            <div className="text-sm font-bold">{TYPE_LABEL[entry.type] ?? entry.type}</div>
            {entry.reason && <div className="text-xs text-[var(--stage-fg)]/50">{entry.reason}</div>}
            <div className="text-[11px] text-[var(--stage-fg)]/40">{new Date(entry.created_at).toLocaleString("ar")}</div>
          </div>
          <div className="text-left">
            <div className={`font-black ${entry.amount >= 0 ? "text-emerald-400" : "text-red-400"}`} dir="ltr">
              {entry.amount >= 0 ? "+" : ""}
              {entry.amount}
            </div>
            <div className="text-xs text-[var(--stage-fg)]/50" dir="ltr">
              {entry.balance_before} → {entry.balance_after}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function HistoryTabs({
  ledgerEntries,
  revealLogEntries,
  showRevealLog,
}: {
  ledgerEntries: BalanceLedgerEntry[];
  revealLogEntries: RevealLogEntry[];
  showRevealLog: boolean;
}) {
  const [tab, setTab] = useState<"ledger" | "reveal">("ledger");

  if (!showRevealLog) return <LedgerList entries={ledgerEntries} />;

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setTab("ledger")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
            tab === "ledger" ? "bg-[var(--stage-primary)] text-white" : "bg-white/5 text-[var(--stage-fg)]/60"
          }`}
        >
          سجل الرصيد
        </button>
        <button
          onClick={() => setTab("reveal")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
            tab === "reveal" ? "bg-[var(--stage-primary)] text-white" : "bg-white/5 text-[var(--stage-fg)]/60"
          }`}
        >
          الساحة
        </button>
      </div>

      {tab === "ledger" ? <LedgerList entries={ledgerEntries} /> : <RevealLogView entries={revealLogEntries} />}
    </div>
  );
}
