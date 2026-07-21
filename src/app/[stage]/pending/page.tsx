import { getStageBySlug } from "@/lib/stage";
import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";

export default async function PendingPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage: slug } = await params;
  const stage = await getStageBySlug(slug);
  if (!stage) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <Card>
        <div className="mb-3 text-4xl">⏳</div>
        <h1 className="text-xl font-black">طلبك بانتظار الاعتماد</h1>
        <p className="mt-2 text-sm text-[var(--stage-fg)]/70">
          راجع المشرف طلب تسجيلك في {stage.name}. بعد الاعتماد ستحصل على اسم مستخدم خاص، ويمكنك حينها تسجيل
          الدخول برقم جوالك أو اسم المستخدم مع كلمة المرور.
        </p>
        <a
          href={`/${stage.slug}/login`}
          className="mt-6 inline-block text-sm text-[var(--stage-primary)] underline"
        >
          الذهاب لصفحة الدخول
        </a>
      </Card>
    </main>
  );
}
