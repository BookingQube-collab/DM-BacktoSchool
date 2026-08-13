import type { ProfessionId } from "@/lib/professions";

const FLAIR_IDS = new Set<string>([
  "footballer",
  "astronaut",
  "pilot",
  "racer",
]);

/** CSS class for profession emoji celebration motion. */
export function professionEmojiFlairClass(
  id: ProfessionId | string,
  variant: "loop" | "once" = "loop",
): string {
  const flair = FLAIR_IDS.has(id) ? id : "pop";
  return variant === "once"
    ? `crew-emoji crew-emoji--${flair} crew-emoji--once`
    : `crew-emoji crew-emoji--${flair}`;
}
