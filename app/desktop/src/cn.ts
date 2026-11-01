import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge with the theme of tailwind.css: text-9 … text-20 are font sizes (not colours), bevel a shadow. The app's
 * font sizes carry no line height, so a later text-12 does not drop an earlier leading-none.
 */
const merge = extendTailwindMerge<"clip-path">({
  extend: {
    theme: { text: ["9", "10", "11", "12", "13", "14", "15", "16", "18", "20"] },
    classGroups: { shadow: ["bevel", "bevel-sm"], "clip-path": ["notch", "notch-sm"] },
  },
  override: { conflictingClassGroups: { "font-size": [] } },
});

/**
 * Class names joined, the falsy ones left out. Of two Tailwind classes that set the same thing the later wins, so the
 * className a view passes to a component overrides the component's own (cn("h-[18px] px-1", "h-5") is "px-1 h-5").
 */
export function cn(...parts: (string | false | null | undefined)[]) {
  return merge(...parts);
}
