import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

export function isWithinWindow(startIso: string | null, endIso: string | null): boolean {
  if (!startIso || !endIso) return true; // no schedule set — manual status is the only gate
  const now = Date.now();
  return new Date(startIso).getTime() <= now && now <= new Date(endIso).getTime();
}

export function formatCountdown(targetIso: string, nowMs = Date.now()) {
  const diffMs = new Date(targetIso).getTime() - nowMs;
  if (diffMs <= 0) return "00:00:00";
  const totalSeconds = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
