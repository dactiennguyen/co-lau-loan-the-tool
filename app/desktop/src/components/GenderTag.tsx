import { cn } from "@/utils/cn";
import { GENDER_ICON, GENDER_TEXT, GENDER_WORD } from "@/game/gender";
import { Icon } from "./Icon";

/** "♂ Nam" in blue or "♀ Nữ" in pink, the gender of the character (flag2 of s2c/9), beside its ElementTag; nothing while
 * it is not known. */
export function GenderTag({ gender, className }: { gender: number | null | undefined; className?: string }) {
  const word = gender != null ? GENDER_WORD[gender] : undefined;
  if (!word) return null;
  return (
    <span className={cn("inline-flex items-center gap-[3px] text-11 font-bold whitespace-nowrap", GENDER_TEXT[gender!], className)}>
      <Icon name={GENDER_ICON[gender!]} size={11} /> {word.charAt(0).toUpperCase() + word.slice(1)}
    </span>
  );
}
