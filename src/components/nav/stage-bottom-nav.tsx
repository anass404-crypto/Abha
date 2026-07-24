"use client";

import { usePathname } from "next/navigation";
import { Home, Users, History, LayoutDashboard, ListChecks, Settings2, Sparkles } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@/components/ui/bottom-nav";

export function StageBottomNav({
  slug,
  showLeaderboard,
  enableActionCards,
}: {
  slug: string;
  showLeaderboard: boolean;
  enableActionCards: boolean;
}) {
  const pathname = usePathname();
  const base = `/${slug}`;

  const isAdmin = pathname.startsWith(`${base}/admin`);
  const studentPaths = [base, `${base}/round`, `${base}/leaderboard`, `${base}/history`, `${base}/cards`];
  const isStudent = studentPaths.includes(pathname);

  if (isAdmin) {
    const items: BottomNavItem[] = [
      { href: `${base}/admin`, label: "نظرة عامة", icon: LayoutDashboard, exact: true },
      { href: `${base}/admin/players`, label: "اللاعبون", icon: Users },
      { href: `${base}/admin/rounds`, label: "الجولات", icon: ListChecks },
      { href: `${base}/admin/cards`, label: "البطاقات", icon: Sparkles },
      { href: `${base}/admin/settings`, label: "الإعدادات", icon: Settings2 },
    ];
    return <BottomNav items={items} mobileOnly />;
  }

  if (isStudent) {
    const items: BottomNavItem[] = [
      { href: base, label: "الرئيسية", icon: Home, exact: true },
      ...(showLeaderboard ? [{ href: `${base}/leaderboard`, label: "المتنافسون", icon: Users }] : []),
      ...(enableActionCards ? [{ href: `${base}/cards`, label: "البطاقات", icon: Sparkles }] : []),
      { href: `${base}/history`, label: "السجل", icon: History },
    ];
    return <BottomNav items={items} />;
  }

  return null;
}
