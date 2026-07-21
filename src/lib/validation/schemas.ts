import { z } from "zod";

// Small, extendable blacklist — admins can extend this later via settings.
// Intentionally conservative: catches common inappropriate terms without
// trying to be an exhaustive profanity filter.
const BLOCKED_TERMS = ["كس", "خرا", "شرموط", "fuck", "shit", "sex", "نيك"];

export function containsBlockedTerm(value: string): boolean {
  const normalized = value.toLowerCase();
  return BLOCKED_TERMS.some((term) => normalized.includes(term));
}

export const registerSchema = z
  .object({
    real_name: z.string().trim().min(3, "الاسم الحقيقي قصير جدًا").max(80),
    display_name: z
      .string()
      .trim()
      .min(2, "الاسم المستعار قصير جدًا")
      .max(30)
      .refine((v) => !containsBlockedTerm(v), "الاسم المستعار غير مناسب"),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{8,15}$/, "رقم جوال غير صالح"),
    password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف").max(72),
    emoji: z.string().trim().min(1, "اختر إيموجي لبطاقتك").max(8),
    extra_fields: z.record(z.string(), z.string()).default({}),
  })
  .refine((v) => v.real_name.trim() !== v.display_name.trim(), {
    message: "يجب ألا يطابق الاسم المستعار الاسم الحقيقي",
    path: ["display_name"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "أدخل اسم المستخدم أو رقم الجوال"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

export type LoginInput = z.infer<typeof loginSchema>;
