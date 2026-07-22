"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type BottomNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

export function BottomNav({ items, mobileOnly }: { items: BottomNavItem[]; mobileOnly?: boolean }) {
  const pathname = usePathname();
  const visibility = mobileOnly ? "sm:hidden" : "";

  return (
    <>
      <div className={cn("h-16", visibility)} />
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-[var(--stage-border)] bg-[#0b0b16]/95 backdrop-blur-lg",
          visibility
        )}
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors",
                  active ? "text-[var(--stage-primary)]" : "text-[var(--stage-fg)]/50"
                )}
              >
                <Icon size={20} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
