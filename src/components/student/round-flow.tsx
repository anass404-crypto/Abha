"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { createClient } from "@/lib/supabase/client";
import { isPast } from "@/lib/utils";
import type { PlayerCard, Round, Stage } from "@/lib/supabase/database.types";

type Step = "answer" | "reveal" | "review" | "done";

interface RevealPick {
  target_id: string;
  display_name: string;
  emoji: string | null;
  guessed_real_name: string;
}

export function RoundFlow({
  stage,
  round,
  targets,
  realNames,
  revealFrozen = false,
  bonusRevealAttempts = 0,
}: {
  stage: Stage;
  round: Round;
  targets: PlayerCard[];
  realNames: string[];
  revealFrozen?: boolean;
  bonusRevealAttempts?: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("answer");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [picks, setPicks] = useState<RevealPick[]>([]);
  const [activeTarget, setActiveTarget] = useState<PlayerCard | null>(null);
  const [guess, setGuess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const options = useMemo(() => Object.entries(round.options ?? {}), [round.options]);
  const maxAttempts = round.reveal_attempts_allowed + bonusRevealAttempts;
  const canReveal = round.reveal_enabled && maxAttempts > 0 && !revealFrozen;
  const availableTargets = targets.filter((t) => !picks.some((p) => p.target_id === t.id));

  function addPick() {
    if (!activeTarget || !guess) return;
    setPicks((prev) => [
      ...prev,
      { target_id: activeTarget.id, display_name: activeTarget.display_name, emoji: activeTarget.emoji, guessed_real_name: guess },
    ]);
    setActiveTarget(null);
    setGuess("");
  }

  function removePick(target_id: string) {
    setPicks((prev) => prev.filter((p) => p.target_id !== target_id));
  }

  async function submit() {
    if (!selectedOption) return;
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("submit_round", {
      p_round_id: round.id,
      p_selected_option: selectedOption,
      p_reveal_targets: picks.map((p) => ({ target_id: p.target_id, guessed_real_name: p.guessed_real_name })),
    });
    setSubmitting(false);
    if (error) {
      toast.error("تعذر إرسال إجابتك، حاول مرة أخرى");
      return;
    }
    setStep("done");
  }

  const closesAtPast = round.closes_at ? isPast(round.closes_at) : false;

  if (step === "done") {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <Card>
          <div className="mb-3 text-4xl">✅</div>
          <p className="font-bold">{round.post_submit_message}</p>
          <Button className="mt-6" onClick={() => router.push(`/${stage.slug}`)}>
            العودة للرئيسية
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <div className="mb-4 flex items-center justify-between text-sm text-[var(--stage-fg)]/70">
        <span>
          الجولة {round.round_number}: {round.title}
        </span>
        {round.closes_at && !closesAtPast && (
          <span>
            ⏱ <Countdown target={round.closes_at} className="font-mono font-bold" />
          </span>
        )}
      </div>

      {step === "answer" && (
        <Card>
          <h2 className="mb-4 text-lg font-black leading-relaxed">{round.question}</h2>
          <div className="space-y-2">
            {options.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedOption(key)}
                className={`w-full rounded-xl border p-3 text-right text-sm font-bold transition-all ${
                  selectedOption === key
                    ? "border-[var(--stage-primary)] bg-[var(--stage-primary)]/20"
                    : "border-[var(--stage-border)] hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-between text-xs text-[var(--stage-fg)]/50">
            <span>نقاط الإجابة الصحيحة: {round.points}</span>
            <span>
              محاولات الكشف المتاحة: {canReveal ? maxAttempts : 0}
              {canReveal && bonusRevealAttempts > 0 && " (شاملة بطاقة الرؤية المزدوجة)"}
            </span>
          </div>
          <Button
            className="mt-5 w-full"
            disabled={!selectedOption}
            onClick={() => setStep(canReveal ? "reveal" : "review")}
          >
            متابعة
          </Button>
        </Card>
      )}

      {step === "reveal" && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black">لوحة الكشف</h2>
            <span className="text-xs text-[var(--stage-fg)]/60">
              {picks.length} / {maxAttempts}
            </span>
          </div>

          {picks.length > 0 && (
            <ul className="mb-4 space-y-2">
              {picks.map((p) => (
                <li key={p.target_id} className="flex items-center justify-between rounded-lg bg-white/5 p-2.5 text-sm">
                  <span>
                    {p.emoji} {p.display_name} ← {p.guessed_real_name}
                  </span>
                  <button className="text-red-400" onClick={() => removePick(p.target_id)}>
                    إزالة
                  </button>
                </li>
              ))}
            </ul>
          )}

          {activeTarget ? (
            <div className="mb-4 rounded-xl border border-[var(--stage-primary)] p-3">
              <div className="mb-2 font-bold">
                {activeTarget.emoji} {activeTarget.display_name}
                {stage.show_balances && ` — رصيده: ${activeTarget.balance}`}
              </div>
              <select
                className="w-full rounded-lg border border-[var(--stage-border)] bg-black/30 p-2.5 text-sm"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
              >
                <option value="">اختر الاسم الحقيقي المتوقع</option>
                {realNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" disabled={!guess} onClick={addPick}>
                  تأكيد المحاولة
                </Button>
                <Button variant="ghost" onClick={() => setActiveTarget(null)}>
                  إلغاء
                </Button>
              </div>
            </div>
          ) : (
            picks.length < maxAttempts && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableTargets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTarget(t)}
                    className="flex flex-col items-center gap-1 rounded-xl border border-[var(--stage-border)] p-3 hover:bg-white/5"
                  >
                    <span className="text-2xl">{t.emoji}</span>
                    <span className="text-xs font-bold">{t.display_name}</span>
                  </button>
                ))}
              </div>
            )
          )}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("answer")}>
              رجوع
            </Button>
            <Button className="flex-1" onClick={() => setStep("review")}>
              مراجعة وتسليم
            </Button>
          </div>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <h2 className="mb-4 text-lg font-black">مراجعة قبل التسليم</h2>
          <div className="mb-3 rounded-lg bg-white/5 p-3 text-sm">
            <div className="mb-1 text-[var(--stage-fg)]/60">إجابتك</div>
            <div className="font-bold">{selectedOption ? round.options[selectedOption] : "—"}</div>
          </div>
          <div className="mb-5 rounded-lg bg-white/5 p-3 text-sm">
            <div className="mb-1 text-[var(--stage-fg)]/60">محاولات الكشف ({picks.length})</div>
            {picks.length === 0 ? (
              <div className="text-[var(--stage-fg)]/50">لا توجد محاولات كشف</div>
            ) : (
              <ul className="space-y-1">
                {picks.map((p) => (
                  <li key={p.target_id} className="font-bold">
                    {p.emoji} {p.display_name} ← {p.guessed_real_name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(canReveal ? "reveal" : "answer")}>
              تعديل
            </Button>
            <Button className="flex-1" disabled={submitting} onClick={submit}>
              {submitting ? "جارٍ التسليم..." : "تسليم الجولة"}
            </Button>
          </div>
        </Card>
      )}
    </main>
  );
}
