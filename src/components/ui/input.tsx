import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef, LabelHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-[var(--stage-border)] bg-black/20 px-3.5 py-2.5 text-sm",
        "placeholder:text-[var(--stage-fg)]/40 outline-none focus:border-[var(--stage-primary)]",
        "focus:ring-2 focus:ring-[var(--stage-primary)]/30 transition-colors",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-bold text-[var(--stage-fg)]/85">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function FieldLabel(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="block text-sm font-bold text-[var(--stage-fg)]/85" {...props} />;
}
