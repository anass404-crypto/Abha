"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { InboxMessage, SentMessage } from "@/lib/supabase/database.types";

const MAX_LENGTH = 160;

function ReplyBox({ stageId, messageId, onSent }: { stageId: string; messageId: string; onSent: () => void }) {
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("send_message", {
      p_stage_id: stageId,
      p_recipient_id: null,
      p_body: body.trim(),
      p_anonymous: anonymous,
      p_reply_to_id: messageId,
    });
    setSending(false);
    if (error) {
      toast.error(error.message || "تعذر إرسال الرد");
      return;
    }
    toast.success("تم إرسال الرد");
    onSent();
  }

  return (
    <div className="mt-2 rounded-lg bg-white/5 p-2.5">
      <textarea
        className="w-full resize-none rounded-lg border border-[var(--stage-border)] bg-black/20 p-2 text-xs outline-none focus:border-[var(--stage-primary)]"
        rows={2}
        maxLength={MAX_LENGTH}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="اكتب ردك..."
      />
      <div className="mt-1 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          كمجهول
        </label>
        <Button className="!px-3 !py-1 text-xs" disabled={!body.trim() || sending} onClick={send}>
          {sending ? "جارٍ الإرسال..." : "إرسال الرد"}
        </Button>
      </div>
    </div>
  );
}

function InboxTab({ stageId, messages }: { stageId: string; messages: InboxMessage[] }) {
  const router = useRouter();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  if (messages.length === 0) {
    return <p className="text-sm text-[var(--stage-fg)]/50">لا توجد رسائل واردة</p>;
  }

  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <Card key={m.id} className="p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--stage-fg)]/50">
            <span className="font-bold">{m.is_anonymous ? "🕶️ مجهول" : `${m.sender_emoji ?? ""} ${m.sender_display_name}`}</span>
            <span>{new Date(m.created_at).toLocaleString("ar")}</span>
          </div>
          <p className="text-sm">{m.body}</p>
          <button
            className="mt-1.5 text-xs font-bold text-[var(--stage-primary)]"
            onClick={() => setReplyingTo(replyingTo === m.id ? null : m.id)}
          >
            {replyingTo === m.id ? "إلغاء الرد" : "رد"}
          </button>
          {replyingTo === m.id && (
            <ReplyBox
              stageId={stageId}
              messageId={m.id}
              onSent={() => {
                setReplyingTo(null);
                router.refresh();
              }}
            />
          )}
        </Card>
      ))}
    </div>
  );
}

function SentTab({ messages }: { messages: SentMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-[var(--stage-fg)]/50">لم ترسل أي رسائل بعد</p>;
  }

  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <Card key={m.id} className="p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-[var(--stage-fg)]/50">
            <span className="font-bold">
              إلى {m.recipient_emoji} {m.recipient_display_name}
              {m.is_anonymous && " (كمجهول)"}
            </span>
            <span>{new Date(m.created_at).toLocaleString("ar")}</span>
          </div>
          <p className="text-sm">{m.body}</p>
        </Card>
      ))}
    </div>
  );
}

export function MessagesView({
  stageId,
  inbox,
  sent,
}: {
  stageId: string;
  inbox: InboxMessage[];
  sent: SentMessage[];
}) {
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("inbox")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
            tab === "inbox" ? "bg-[var(--stage-primary)] text-white" : "bg-white/5 text-[var(--stage-fg)]/60"
          }`}
        >
          الواردة
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
            tab === "sent" ? "bg-[var(--stage-primary)] text-white" : "bg-white/5 text-[var(--stage-fg)]/60"
          }`}
        >
          المرسلة
        </button>
      </div>

      {tab === "inbox" ? <InboxTab stageId={stageId} messages={inbox} /> : <SentTab messages={sent} />}
    </div>
  );
}
