import { requireStageAdmin } from "@/lib/auth";
import { MessagesAdminView } from "@/components/admin/messages-admin-view";

export default async function AdminMessagesPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const { supabase, stage } = await requireStageAdmin(slug);

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("stage_id", stage.id)
    .order("created_at", { ascending: false });

  const ids = Array.from(new Set((messages ?? []).flatMap((m) => [m.sender_id, m.recipient_id])));
  const { data: people } =
    ids.length > 0 ? await supabase.from("profiles").select("id, display_name, emoji").in("id", ids) : { data: [] };
  const peopleMap = new Map((people ?? []).map((p) => [p.id, p]));

  const rows = (messages ?? []).map((m) => ({
    ...m,
    sender_display_name: peopleMap.get(m.sender_id)?.display_name ?? "—",
    sender_emoji: peopleMap.get(m.sender_id)?.emoji ?? null,
    recipient_display_name: peopleMap.get(m.recipient_id)?.display_name ?? "—",
    recipient_emoji: peopleMap.get(m.recipient_id)?.emoji ?? null,
  }));

  return <MessagesAdminView rows={rows} />;
}
