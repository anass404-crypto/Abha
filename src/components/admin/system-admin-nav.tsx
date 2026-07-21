"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SystemAdminNav() {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/system/login");
  }

  return (
    <nav className="glass-card m-3 flex items-center justify-between rounded-2xl px-4 py-3">
      <span className="font-black">لوحة مسؤول النظام</span>
      <button onClick={logout} className="text-sm text-red-400">
        خروج
      </button>
    </nav>
  );
}
