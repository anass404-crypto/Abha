"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { RevealLogView } from "@/components/student/reveal-log-view";
import { MessagesView } from "@/components/student/messages-view";
import type { BalanceLedgerEntry, InboxMessage, RevealLogEntry, SentMessage } from "@/lib/supabase/database.types";

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

type TabKey = "ledger" | "reveal" | "messages";

export function HistoryTabs({
  stageId,
  ledgerEntries,
  revealLogEntries,
  showRevealLog,
  inboxMessages,
  sentMessages,
  enableMessaging,
}: {
  stageId: string;
  ledgerEntries: BalanceLedgerEntry[];
  revealLogEntries: RevealLogEntry[];
  showRevealLog: boolean;
  inboxMessages: InboxMessage[];
  sentMessages: SentMessage[];
  enableMessaging: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("ledger");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "ledger", label: "سجل الرصيد" },
    ...(showRevealLog ? [{ key: "reveal" as TabKey, label: "الساحة" }] : []),
    ...(enableMessaging ? [{ key: "messages" as TabKey, label: "الرسائل" }] : []),
  ];

  if (tabs.length === 1) return <LedgerList entries={ledgerEntries} />;

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              tab === t.key ? "bg-[var(--stage-primary)] text-white" : "bg-white/5 text-[var(--stage-fg)]/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ledger" && <LedgerList entries={ledgerEntries} />}
      {tab === "reveal" && <RevealLogView entries={revealLogEntries} />}
      {tab === "messages" && <MessagesView stageId={stageId} inbox={inboxMessages} sent={sentMessages} />}
    </div>
  );
}
