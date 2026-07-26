"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { PlayerCard } from "@/lib/supabase/database.types";

const MAX_LENGTH = 160;

export function MessageComposeModal({
  stageId,
  target,
  onClose,
}: {
  stageId: string;
  target: PlayerCard;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("send_message", {
      p_stage_id: stageId,
      p_recipient_id: target.id,
      p_body: body.trim(),
      p_anonymous: anonymous,
    });
    setSending(false);
    if (error) {
      toast.error(error.message || "تعذر إرسال الرسالة");
      return;
    }
    toast.success(`تم إرسال الرسالة إلى ${target.display_name}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass-card w-full max-w-sm p-5">
        <h3 className="mb-3 font-bold">
          مراسلة {target.emoji} {target.display_name}
        </h3>
        <textarea
          className="w-full resize-none rounded-lg border border-[var(--stage-border)] bg-black/20 p-2.5 text-sm outline-none focus:border-[var(--stage-primary)]"
          rows={3}
          maxLength={MAX_LENGTH}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="اكتب رسالتك..."
          autoFocus
        />
        <div className="mt-1 text-left text-[11px] text-[var(--stage-fg)]/50" dir="ltr">
          {body.length} / {MAX_LENGTH}
        </div>

        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          إرسال كمجهول (لن يعرف باسمك المستعار)
        </label>

        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            إلغاء
          </Button>
          <Button className="flex-1" disabled={!body.trim() || sending} onClick={send}>
            {sending ? "جارٍ الإرسال..." : "إرسال"}
          </Button>
        </div>
      </div>
    </div>
  );
}
