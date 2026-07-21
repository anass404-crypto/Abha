import type { StageColors } from "@/lib/supabase/database.types";

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function stageCssVars(colors: StageColors): Record<string, string> {
  const fg = relativeLuminance(colors.background) > 0.4 ? "#12121c" : "#f4f4f8";
  return {
    "--stage-primary": colors.primary,
    "--stage-secondary": colors.secondary,
    "--stage-bg": colors.background,
    "--stage-fg": fg,
  } as Record<string, string>;
}
