"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  ActionCardRule,
  ActionCardRuleGrant,
  ActionCardRuleReward,
  ActionCardTemplate,
  CardEffectKey,
  RuleConditionType,
  Stage,
  StageActionCard,
} from "@/lib/supabase/database.types";

const EFFECT_LABEL: Record<CardEffectKey, string> = {
  shadow_shield: "درع الظل",
  double_vision: "الرؤية المزدوجة",
  double_points: "مضاعفة النقاط",
  reveal_freeze: "تجميد الكشف",
  temp_exclusion: "الإقصاء المؤقت",
  protected_copy: "النسخة المحمية",
};

const CONDITION_LABEL: Record<RuleConditionType, string> = {
  most_targeted_unexposed: "الأكثر استهدافًا (غير مكشوف)",
  consecutive_participation: "مشاركة متتالية",
  consecutive_correct_answers: "إجابات صحيحة متتالية",
  first_successful_reveal: "أول كشف ناجح",
  largest_balance_transfer: "أكبر تحويل رصيد",
  survivor_rounds: "الصمود عدد جولات",
  balance_threshold: "بلوغ حد رصيد",
  leaderboard_rank: "الترتيب في المتصدرين",
};

function defaultsForEffect(effect: CardEffectKey) {
  const nextRound = effect === "reveal_freeze" || effect === "temp_exclusion";
  return {
    usage_timing: nextRound ? ("next_round" as const) : ("before_round" as const),
    requires_target: nextRound,
  };
}

export function CardsAdminView({
  stage,
  templates,
  stageCards,
  students,
  rules,
  rewards,
  pendingGrants,
}: {
  stage: Stage;
  templates: ActionCardTemplate[];
  stageCards: StageActionCard[];
  students: { id: string; display_name: string | null; real_name: string | null }[];
  rules: ActionCardRule[];
  rewards: ActionCardRuleReward[];
  pendingGrants: (ActionCardRuleGrant & { student_display_name: string; rule_name: string })[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);

  const availableTemplates = templates.filter((t) => !stageCards.some((c) => c.template_id === t.id));

  async function addFromTemplate(template: ActionCardTemplate) {
    const defaults = defaultsForEffect(template.effect_key);
    const { error } = await supabase.from("stage_action_cards").insert({
      stage_id: stage.id,
      template_id: template.id,
      effect_key: template.effect_key,
      name: template.name,
      description: template.description,
      icon: template.icon,
      image_url: template.image_url,
      price_points: 0,
      total_copies: 10,
      remaining_copies: 10,
      usage_timing: defaults.usage_timing,
      requires_target: defaults.requires_target,
    });
    if (error) {
      toast.error("تعذر إضافة البطاقة للمرحلة");
      return;
    }
    toast.success(`تمت إضافة "${template.name}"`);
    router.refresh();
  }

  async function updateCard(card: StageActionCard, changes: Partial<StageActionCard>) {
    const { error } = await supabase.from("stage_action_cards").update(changes).eq("id", card.id);
    if (error) {
      toast.error("تعذر تحديث البطاقة");
      return;
    }
    router.refresh();
  }

  async function adjustStock(card: StageActionCard) {
    const deltaStr = prompt("مقدار التغيير في المخزون (موجب للزيادة، سالب للنقصان):");
    if (!deltaStr) return;
    const delta = Number(deltaStr);
    if (Number.isNaN(delta)) {
      toast.error("قيمة غير صالحة");
      return;
    }
    const reason = prompt("سبب التعديل:");
    if (!reason) {
      toast.error("السبب مطلوب");
      return;
    }
    setBusy(card.id);
    const { error } = await supabase.rpc("admin_adjust_card_stock", {
      p_stage_action_card_id: card.id,
      p_delta: delta,
      p_reason: reason,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "تعذر تعديل المخزون");
      return;
    }
    toast.success("تم تعديل المخزون");
    router.refresh();
  }

  async function grantCard() {
    if (stageCards.length === 0 || students.length === 0) return;
    const studentLabel = students.map((s, i) => `${i + 1}) ${s.display_name}`).join("\n");
    const studentIdx = prompt(`اختر رقم الطالب:\n${studentLabel}`);
    const student = studentIdx ? students[Number(studentIdx) - 1] : null;
    if (!student) return;

    const cardLabel = stageCards.map((c, i) => `${i + 1}) ${c.name}`).join("\n");
    const cardIdx = prompt(`اختر رقم البطاقة:\n${cardLabel}`);
    const card = cardIdx ? stageCards[Number(cardIdx) - 1] : null;
    if (!card) return;

    const qtyStr = prompt("الكمية:", "1");
    const qty = Number(qtyStr);
    if (!qty || qty < 1) {
      toast.error("كمية غير صالحة");
      return;
    }
    const reason = prompt("سبب المنح:");
    if (!reason) {
      toast.error("السبب مطلوب");
      return;
    }

    const { error } = await supabase.rpc("admin_grant_action_card", {
      p_student_id: student.id,
      p_stage_action_card_id: card.id,
      p_quantity: qty,
      p_reason: reason,
    });
    if (error) {
      toast.error(error.message || "تعذر منح البطاقة");
      return;
    }
    toast.success(`تم منح "${card.name}" لـ ${student.display_name}`);
    router.refresh();
  }

  async function createRule() {
    const code = prompt("رمز القاعدة (حروف/أرقام/شرطة سفلية فقط):");
    if (!code) return;
    const name = prompt("اسم القاعدة:");
    if (!name) return;

    const conditionLabel = Object.values(CONDITION_LABEL).map((v, i) => `${i + 1}) ${v}`).join("\n");
    const conditionIdx = prompt(`نوع الشرط:\n${conditionLabel}`);
    const conditionKeys = Object.keys(CONDITION_LABEL) as RuleConditionType[];
    const condition = conditionIdx ? conditionKeys[Number(conditionIdx) - 1] : null;
    if (!condition) return;

    const scope = confirm("هل القاعدة لكل جولة (موافق) أم نهاية المنافسة (إلغاء)؟") ? "per_round" : "end_of_competition";
    const targetValueStr = prompt("القيمة المستهدفة (رقم، اختياري):");
    const targetValue = targetValueStr ? Number(targetValueStr) : null;
    const repeatable = confirm("هل يمكن أن تتكرر للطالب نفسه أكثر من مرة؟");
    const maxGrantsStr = prompt("الحد الأقصى لعدد مرات المنح لهذه القاعدة (اتركه فارغًا لعدم التحديد):");
    const maxGrants = maxGrantsStr ? Number(maxGrantsStr) : null;
    const requiresApproval = confirm("هل يتطلب المنح موافقة إدارية قبل تسليم البطاقة؟");

    const { data: newRule, error } = await supabase
      .from("action_card_rules")
      .insert({
        stage_id: stage.id,
        code,
        name,
        condition_type: condition,
        scope,
        target_value: targetValue,
        repeatable,
        max_grants: maxGrants,
        requires_admin_approval: requiresApproval,
      })
      .select()
      .single();
    if (error || !newRule) {
      toast.error("تعذر إنشاء القاعدة");
      return;
    }

    if (stageCards.length > 0) {
      const cardLabel = stageCards.map((c, i) => `${i + 1}) ${c.name}`).join("\n");
      const cardIdx = prompt(`اختر رقم البطاقة التي تُمنح عند تحقق الشرط:\n${cardLabel}`);
      const rewardCard = cardIdx ? stageCards[Number(cardIdx) - 1] : null;
      if (rewardCard) {
        const qtyStr = prompt("الكمية الممنوحة:", "1");
        const qty = Number(qtyStr) || 1;
        await supabase
          .from("action_card_rule_rewards")
          .insert({ rule_id: newRule.id, stage_action_card_id: rewardCard.id, quantity: qty });
      }
    }

    toast.success("تم إنشاء القاعدة");
    router.refresh();
  }

  async function approveGrant(grantId: string) {
    setBusy(grantId);
    const { error } = await supabase.rpc("approve_rule_grant", { p_grant_id: grantId });
    setBusy(null);
    if (error) {
      toast.error(error.message || "تعذر اعتماد المنح");
      return;
    }
    toast.success("تم اعتماد المنح");
    router.refresh();
  }

  async function runEndOfCompetition() {
    if (!confirm("تشغيل تقييم قواعد نهاية المنافسة الآن؟")) return;
    const { error } = await supabase.rpc("evaluate_end_of_competition_rules", { p_stage_id: stage.id });
    if (error) {
      toast.error(error.message || "تعذر تشغيل التقييم");
      return;
    }
    toast.success("تم تشغيل تقييم قواعد نهاية المنافسة");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">إدارة بطاقات الأكشن</h1>
        <Button variant="ghost" onClick={grantCard}>
          منح بطاقة يدويًا
        </Button>
      </div>

      {availableTemplates.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-[var(--stage-fg)]/70">إضافة بطاقة من البنك العام</h2>
          <div className="flex flex-wrap gap-2">
            {availableTemplates.map((t) => (
              <Button key={t.id} variant="ghost" className="text-xs" onClick={() => addFromTemplate(t)}>
                + {t.icon} {t.name}
              </Button>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <h2 className="mb-3 text-sm font-bold text-[var(--stage-fg)]/70">بطاقات المرحلة ({stageCards.length})</h2>
        {stageCards.length === 0 ? (
          <p className="text-sm text-[var(--stage-fg)]/50">لم تُضف أي بطاقات لهذه المرحلة بعد</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--stage-border)] text-[var(--stage-fg)]/60">
                <th className="p-2 text-right">البطاقة</th>
                <th className="p-2 text-right">السعر</th>
                <th className="p-2 text-right">المتبقي/الإجمالي</th>
                <th className="p-2 text-right">مبيعة/ممنوحة/مستخدمة</th>
                <th className="p-2 text-right">مفعّلة</th>
                <th className="p-2 text-right">قابلة للشراء</th>
                <th className="p-2 text-right">منح تلقائي</th>
                <th className="p-2 text-right">منح يدوي</th>
                <th className="p-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {stageCards.map((c) => (
                <tr key={c.id} className="border-b border-[var(--stage-border)]/50">
                  <td className="p-2">
                    {c.icon} {c.name}
                    <div className="text-[11px] text-[var(--stage-fg)]/50">{EFFECT_LABEL[c.effect_key]}</div>
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      defaultValue={c.price_points}
                      className="w-20"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== c.price_points) updateCard(c, { price_points: v });
                      }}
                    />
                  </td>
                  <td className="p-2" dir="ltr">
                    {c.remaining_copies} / {c.total_copies}
                  </td>
                  <td className="p-2 text-xs" dir="ltr">
                    {c.sold_count} / {c.granted_count} / {c.used_count}
                  </td>
                  <td className="p-2">
                    <input type="checkbox" checked={c.is_active} onChange={(e) => updateCard(c, { is_active: e.target.checked })} />
                  </td>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={c.is_purchasable}
                      onChange={(e) => updateCard(c, { is_purchasable: e.target.checked })}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={c.is_auto_grantable}
                      onChange={(e) => updateCard(c, { is_auto_grantable: e.target.checked })}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={c.is_manual_grantable}
                      onChange={(e) => updateCard(c, { is_manual_grantable: e.target.checked })}
                    />
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      disabled={busy === c.id}
                      onClick={() => adjustStock(c)}
                    >
                      تعديل المخزون
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--stage-fg)]/70">قواعد المنح التلقائي ({rules.length})</h2>
          <div className="flex gap-2">
            <Button variant="ghost" className="text-xs" onClick={runEndOfCompetition}>
              تشغيل قواعد نهاية المنافسة
            </Button>
            <Button className="text-xs" onClick={createRule}>
              + قاعدة جديدة
            </Button>
          </div>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-[var(--stage-fg)]/50">لا توجد قواعد منح تلقائي</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="rounded-lg bg-white/5 p-3 text-sm">
                <div className="font-bold">{r.name}</div>
                <div className="text-xs text-[var(--stage-fg)]/50">
                  {CONDITION_LABEL[r.condition_type]} — {r.scope === "per_round" ? "كل جولة" : "نهاية المنافسة"}
                  {r.target_value !== null && ` — القيمة: ${r.target_value}`}
                  {!r.repeatable && " — مرة واحدة لكل طالب"}
                  {r.requires_admin_approval && " — يتطلب موافقة إدارية"}
                </div>
                <div className="mt-1 text-xs text-[var(--stage-fg)]/40">
                  المكافآت:{" "}
                  {rewards
                    .filter((rw) => rw.rule_id === r.id)
                    .map((rw) => `${stageCards.find((c) => c.id === rw.stage_action_card_id)?.name ?? "—"} ×${rw.quantity}`)
                    .join("، ") || "لا يوجد"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {pendingGrants.length > 0 && (
        <Card className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--stage-fg)]/70">منح بانتظار الموافقة ({pendingGrants.length})</h2>
          {pendingGrants.map((g) => (
            <div key={g.id} className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
              <span>
                {g.student_display_name} — {g.rule_name}
              </span>
              <Button className="!px-2 !py-1 text-xs" disabled={busy === g.id} onClick={() => approveGrant(g.id)}>
                اعتماد
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
