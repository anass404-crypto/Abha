import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass-card p-5", className)} {...props} />;
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-[var(--stage-fg)]/60">{label}</div>
      <div className="mt-1 text-2xl font-black text-gradient">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-[var(--stage-fg)]/50">{hint}</div>}
    </Card>
  );
}
