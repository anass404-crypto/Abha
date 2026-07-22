"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PlayerCard, RevealAttempt, Round, Submission } from "@/lib/supabase/database.types";

const REVEAL_STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار الاحتساب",
  executed: "كشف ناجح 🎯",
  wrong_guess: "تخمين خاطئ",
  cancelled_wrong_answer: "أُلغيت — إجابتك خاطئة",
  cancelled_target_exposed: "أُلغيت — الهدف انكشف قبلك",
  cancelled_revealer_exposed: "أُلغيت — انكشفتَ قبل تنفيذها",
  cancelled_admin: "أُلغيت إداريًا",
};

export function RoundResultsButton({
  round,
  submission,
  revealAttempts,
  cards,
}: {
  round: Round;
  submission: Submission | null;
  revealAttempts: RevealAttempt[];
  cards: PlayerCard[];
}) {
  const [open, setOpen] = useState(false);
  const cardById = new Map(cards.map((c) => [c.id, c]));

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        🏆 نتائج الجولة {round.round_number}: {round.title}
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-black">نتائج الجولة {round.round_number}</h2>
                  <button onClick={() => setOpen(false)} className="text-[var(--stage-fg)]/50">
                    ✕
                  </button>
                </div>

                <p className="mb-3 text-sm font-bold">{round.question}</p>
                <div className="mb-4 rounded-lg bg-white/5 p-3 text-sm">
                  <div className="mb-1 text-[var(--stage-fg)]/60">الإجابة الصحيحة</div>
                  <div className="font-black text-emerald-400">{round.options[round.correct_option]}</div>
                </div>

                {submission ? (
                  <div className="mb-4 rounded-lg bg-white/5 p-3 text-sm">
                    <div className="mb-1 text-[var(--stage-fg)]/60">إجابتك</div>
                    <div className="font-bold">{round.options[submission.selected_option]}</div>
                    <div className={`mt-1 font-black ${submission.is_correct ? "text-emerald-400" : "text-red-400"}`}>
                      {submission.is_correct ? `صحيحة (+${submission.points_awarded ?? 0} نقطة)` : "خاطئة"}
                    </div>
                  </div>
                ) : (
                  <p className="mb-4 text-sm text-[var(--stage-fg)]/50">لم تسلّم إجابة في هذه الجولة</p>
                )}

                <div className="text-sm">
                  <div className="mb-1 text-[var(--stage-fg)]/60">محاولات الكشف ({revealAttempts.length})</div>
                  {revealAttempts.length === 0 ? (
                    <p className="text-[var(--stage-fg)]/40">لم تحاول كشف أحد في هذه الجولة</p>
                  ) : (
                    <ul className="space-y-2">
                      {revealAttempts.map((a) => {
                        const target = cardById.get(a.target_id);
                        return (
                          <li key={a.id} className="rounded-lg bg-white/5 p-2.5">
                            <div className="font-bold">
                              {target?.emoji} {target?.display_name ?? "لاعب"} ← {a.guessed_real_name}
                            </div>
                            <div className="text-xs text-[var(--stage-fg)]/60">{REVEAL_STATUS_LABEL[a.status]}</div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
