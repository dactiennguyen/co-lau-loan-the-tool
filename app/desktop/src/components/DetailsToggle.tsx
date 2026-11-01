import { cn } from "@/utils/cn";
import { Icon } from "./Icon";

/** "Chi tiết ▾" after the title of a summary row: shows or hides what is under it (`controls`, the id of that part). A
 * small coloured chip that fits a row of 11–12 px text without making it taller; filled while open. */
export function DetailsToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      className={
        "inline-flex flex-none items-center gap-0.5 h-[18px] pr-1 pl-[7px] py-0 bg-bg-2 border border-primary-shade font-ui font-bold text-11 leading-none text-primary cursor-pointer " +
        "hover:border-primary aria-expanded:bg-primary aria-expanded:border-primary aria-expanded:text-on-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1"
      }
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      Chi tiết
      <Icon
        name="chevron"
        size={12}
        className={cn("transition-[transform] duration-(--fast) ease-[steps(2)]", open && "[transform:rotate(180deg)]")}
      />
    </button>
  );
}
