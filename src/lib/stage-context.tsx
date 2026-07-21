"use client";

import { createContext, useContext } from "react";
import type { Stage } from "@/lib/supabase/database.types";

const StageContext = createContext<Stage | null>(null);

export function StageProvider({ stage, children }: { stage: Stage; children: React.ReactNode }) {
  return <StageContext.Provider value={stage}>{children}</StageContext.Provider>;
}

export function useStage(): Stage {
  const stage = useContext(StageContext);
  if (!stage) throw new Error("useStage must be used within a StageProvider");
  return stage;
}
