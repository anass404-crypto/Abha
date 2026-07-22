import rawEmoji from "unicode-emoji-json";

export type EmojiEntry = { char: string; name: string; group: string };

const GROUP_ORDER = [
  "Smileys & Emotion",
  "Animals & Nature",
  "Food & Drink",
  "Activities",
  "Travel & Places",
  "Objects",
  "Symbols",
  "People & Body",
  "Flags",
] as const;

export const EMOJI_GROUPS: readonly string[] = GROUP_ORDER;

export const ALL_EMOJI: EmojiEntry[] = Object.entries(
  rawEmoji as Record<string, { name: string; group: string }>
)
  .map(([char, meta]) => ({ char, name: meta.name, group: meta.group }))
  .sort((a, b) => GROUP_ORDER.indexOf(a.group as (typeof GROUP_ORDER)[number]) - GROUP_ORDER.indexOf(b.group as (typeof GROUP_ORDER)[number]));
