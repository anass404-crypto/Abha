"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { MessageRow } from "@/lib/supabase/database.types";

type Row = MessageRow & {
  sender_display_name: string;
  sender_emoji: string | null;
  recipient_display_name: string;
  recipient_emoji: string | null;
};

export function MessagesAdminView({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function deleteMessage(id: string) {
    if (!confirm("حذف هذه الرسالة نهائيًا؟")) return;
    setBusyId(id);
    const supabase = createClient();
    const { error } = await supabase.from("messages").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error("تعذر حذف الرسالة");
      return;
    }
    toast.success("تم حذف الرسالة");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">الرسائل (سجل إداري كامل)</h1>
      <p className="text-xs text-[var(--stage-fg)]/50">
        هويّة المرسل الحقيقية ظاهرة لك دائمًا هنا حتى لو اختار المرسل الإرسال كـ&quot;مجهول&quot; أمام الطرف الآخر.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--stage-fg)]/50">لا توجد رسائل بعد</p>
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <Card key={m.id} className="p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-[var(--stage-fg)]/60">
                <span className="inline-flex items-center gap-1.5 font-bold">
                  <span>
                    {m.sender_emoji} {m.sender_display_name}
                  </span>
                  <ArrowLeft size={12} className="shrink-0 opacity-50" />
                  <span>
                    {m.recipient_emoji} {m.recipient_display_name}
                  </span>
                  {m.is_anonymous && (
                    <span className="mr-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                      أُرسلت كمجهول
                    </span>
                  )}
                </span>
                <span>{new Date(m.created_at).toLocaleString("ar")}</span>
              </div>
              <p className="text-sm">{m.body}</p>
              <Button
                variant="danger"
                className="mt-2 !px-2 !py-1 text-xs"
                disabled={busyId === m.id}
                onClick={() => deleteMessage(m.id)}
              >
                حذف
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
