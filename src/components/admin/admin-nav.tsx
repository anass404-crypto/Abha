"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "", label: "نظرة عامة" },
  { href: "/players", label: "اللاعبون" },
  { href: "/rounds", label: "الجولات" },
  { href: "/cards", label: "البطاقات" },
  { href: "/reveal-log", label: "سجل الكشوف" },
  { href: "/settings", label: "الإعدادات" },
];

export function AdminNav({ stageSlug, stageName }: { stageSlug: string; stageName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/${stageSlug}/admin`;

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${stageSlug}/login`);
  }

  return (
    <nav className="glass-card m-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-4">
        <span className="font-black">لوحة تحكم {stageName}</span>
        <div className="flex gap-1">
          {LINKS.map((link) => {
            const href = base + link.href;
            const active = pathname === href;
            return (
              <Link
                key={link.href}
                href={href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
                  active ? "bg-[var(--stage-primary)] text-white" : "hover:bg-white/5"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Link href={`/${stageSlug}/display`} className="text-sm underline">
          شاشة العرض
        </Link>
        <button onClick={logout} className="text-sm text-red-400">
          خروج
        </button>
      </div>
    </nav>
  );
}
