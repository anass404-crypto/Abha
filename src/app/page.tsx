import Link from "next/link";

export default function RootPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-black text-gradient">منصة المنافسة الطلابية</h1>
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
