"use client";

import { useMemo, useState } from "react";
import { ALL_EMOJI, EMOJI_GROUPS } from "@/lib/emoji-data";
import { cn } from "@/lib/utils";

export function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>(EMOJI_GROUPS[0]);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term) {
      return ALL_EMOJI.filter((e) => e.name.includes(term)).slice(0, 300);
    }
    return ALL_EMOJI.filter((e) => e.group === group);
  }, [search, group]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-xl border text-2xl transition-all",
          value
            ? "border-[var(--stage-primary)] bg-[var(--stage-primary)]/20"
            : "border-[var(--stage-border)] bg-black/20 text-sm text-[var(--stage-fg)]/50"
        )}
      >
        {value || "اختر"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 w-72 rounded-xl border border-[var(--stage-border)] bg-[#14142f] p-3 shadow-2xl sm:w-80">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن إيموجي..."
              dir="ltr"
              className="mb-2 w-full rounded-lg border border-[var(--stage-border)] bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--stage-primary)]"
            />

            {!search && (
              <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                {EMOJI_GROUPS.map((g) => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => setGroup(g)}
                    className={cn(
                      "shrink-0 rounded-lg px-2 py-1 text-xs font-bold whitespace-nowrap transition-colors",
                      group === g ? "bg-[var(--stage-primary)] text-white" : "bg-white/5 text-[var(--stage-fg)]/60 hover:bg-white/10"
                    )}
                  >
                    {GROUP_LABEL[g] ?? g}
                  </button>
                ))}
              </div>
            )}

            <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
              {results.map((e) => (
                <button
                  type="button"
                  key={e.char}
                  title={e.name}
                  onClick={() => {
                    onChange(e.char);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-white/10",
                    value === e.char && "bg-[var(--stage-primary)]/30"
                  )}
                >
                  {e.char}
                </button>
              ))}
              {results.length === 0 && (
                <p className="col-span-6 py-4 text-center text-xs text-[var(--stage-fg)]/40">لا توجد نتائج</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const GROUP_LABEL: Record<string, string> = {
  "Smileys & Emotion": "وجوه",
  "Animals & Nature": "حيوانات",
  "Food & Drink": "طعام",
  Activities: "أنشطة",
  "Travel & Places": "سفر",
  Objects: "أدوات",
  Symbols: "رموز",
  "People & Body": "أشخاص",
  Flags: "أعلام",
};
