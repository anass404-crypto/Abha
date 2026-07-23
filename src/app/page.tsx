import Link from "next/link";

export default function RootPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <img src="/logo-masked.svg" alt="الملثم" className="mx-auto mb-4 h-20 w-20 drop-shadow-[0_0_14px_rgba(255,215,0,0.5)]" />
      <h1 className="text-3xl font-black text-amber-400 drop-shadow-[0_0_12px_rgba(255,215,0,0.35)]">الملثم</h1>
      <p className="mt-1 text-sm text-[var(--stage-fg)]/50">منصة المنافسة الطلابية</p>
      <p className="mt-3 text-sm text-[var(--stage-fg)]/60">
        هذه منصة متعددة المراحل — للدخول إلى منافستك استخدم الرابط الذي زوّدك به مشرف المرحلة، مثل
        <br />
        <code dir="ltr" className="text-[var(--stage-primary)]">
          /your-stage-slug/login
        </code>
      </p>
      <Link href="/admin/system/login" className="mt-8 text-sm underline text-[var(--stage-fg)]/50">
        دخول مسؤول النظام
      </Link>
    </main>
  );
}
