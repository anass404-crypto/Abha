"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { motion } from "framer-motion";

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

type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
> & { variant?: Variant };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "primary", disabled, ...props }, ref) => (
  <motion.button
    ref={ref}
    disabled={disabled}
    whileTap={disabled ? undefined : { scale: 0.94 }}
    whileHover={disabled ? undefined : { scale: 1.015 }}
    transition={{ type: "spring", stiffness: 500, damping: 25 }}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors",
      "disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale",
      variants[variant],
      className
    )}
    {...props}
  />
));
Button.displayName = "Button";
