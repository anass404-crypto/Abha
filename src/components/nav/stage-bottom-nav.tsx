"use client";

import { usePathname } from "next/navigation";
import { Home, Swords, Users, History, LayoutDashboard, ListChecks, Settings2, Trophy } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@/components/ui/bottom-nav";

export function StageBottomNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/${slug}`;

  const isAdmin = pathname.startsWith(`${base}/admin`);
  const studentPaths = [base, `${base}/round`, `${base}/leaderboard`, `${base}/history`];
  const isStudent = studentPaths.includes(pathname);

  if (isAdmin) {
    const items: BottomNavItem[] = [
      { href: `${base}/admin`, label: "نظرة عامة", icon: LayoutDashboard, exact: true },
      { href: `${base}/admin/players`, label: "اللاعبون", icon: Users },
      { href: `${base}/admin/rounds`, label: "الجولات", icon: ListChecks },
      { href: `${base}/admin/leaderboard`, label: "المنافسات", icon: Trophy },
      { href: `${base}/admin/settings`, label: "الإعدادات", icon: Settings2 },
    ];
    return <BottomNav items={items} mobileOnly />;
  }

  if (isStudent) {
    const items: BottomNavItem[] = [
      { href: base, label: "الرئيسية", icon: Home, exact: true },
      { href: `${base}/round`, label: "الجولة", icon: Swords },
      { href: `${base}/leaderboard`, label: "المتنافسون", icon: Users },
      { href: `${base}/history`, label: "السجل", icon: History },
    ];
    return <BottomNav items={items} />;
  }

  return null;
}
