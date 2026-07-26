import { requireStudent } from "@/lib/auth";
import { HistoryTabs } from "@/components/student/history-tabs";

export default async function HistoryPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage, profile } = await requireStudent(slug);

  const [{ data: ledgerEntries }, revealLog, inbox, sent] = await Promise.all([
    supabase.from("balance_ledger").select("*").eq("student_id", profile.id).order("created_at", { ascending: false }),
    stage.show_reveal_log
      ? supabase.rpc("get_stage_reveal_log", { p_stage_id: stage.id })
      : Promise.resolve({ data: [] }),
    stage.enable_messaging ? supabase.rpc("get_my_inbox", { p_stage_id: stage.id }) : Promise.resolve({ data: [] }),
    stage.enable_messaging
      ? supabase.rpc("get_my_sent_messages", { p_stage_id: stage.id })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="mb-6 text-xl font-black">السجل</h1>
      <HistoryTabs
        stageId={stage.id}
        ledgerEntries={ledgerEntries ?? []}
        revealLogEntries={revealLog.data ?? []}
        showRevealLog={stage.show_reveal_log}
        inboxMessages={inbox.data ?? []}
        sentMessages={sent.data ?? []}
        enableMessaging={stage.enable_messaging}
      />
    </main>
  );
}
