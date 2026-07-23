export function BrandStrip({ stageName }: { stageName: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 bg-black/20 px-3 py-1 text-[11px] text-[var(--stage-fg)]/50">
      <img src="/logo-masked.svg" alt="" className="h-3.5 w-3.5" />
      <span className="font-bold">الملثم</span>
      <span className="opacity-50">·</span>
      <span>{stageName}</span>
    </div>
  );
}
