export function BrandStrip({ stageName }: { stageName: string }) {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-[var(--stage-border)] bg-black/30 px-3 py-2.5">
      <img
        src="/logo-masked.svg"
        alt="الملثم"
        className="h-7 w-7 drop-shadow-[0_0_6px_rgba(255,215,0,0.6)]"
      />
      <span className="text-lg font-black tracking-wide text-amber-400 drop-shadow-[0_0_8px_rgba(255,215,0,0.35)]">
        الملثم
      </span>
      <span className="text-[var(--stage-fg)]/30">•</span>
      <span className="text-xs text-[var(--stage-fg)]/50">{stageName}</span>
    </div>
  );
}
