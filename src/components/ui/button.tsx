import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--stage-primary)] text-white hover:brightness-110 glow-primary",
  secondary:
    "bg-[var(--stage-secondary)] text-white hover:brightness-110",
  ghost:
    "bg-transparent border border-[var(--stage-border)] text-[var(--stage-fg)] hover:bg-white/5",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(({ className, variant = "primary", disabled, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
      "disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale",
      variants[variant],
      className
    )}
    {...props}
  />
));
Button.displayName = "Button";
