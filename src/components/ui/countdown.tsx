"use client";

import { formatCountdown } from "@/lib/utils";
import { useEffect, useState } from "react";

export function Countdown({ target, className }: { target: string; className?: string }) {
  const [label, setLabel] = useState(() => formatCountdown(target));

  useEffect(() => {
    const id = setInterval(() => setLabel(formatCountdown(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <span className={className} dir="ltr">
      {label}
    </span>
  );
}
