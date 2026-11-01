import { useEffect, useRef, useState } from "react";
import type { ToastTone } from "../toasts";
import { Button } from "./Button";
import { cn } from "../cn";
import { Icon, type IconName } from "./Icon";

const ICON: Record<ToastTone, IconName> = { info: "play", good: "check", warn: "flag" };
/** The tone of the stripe down the left side and of the icon. */
const TONE: Record<ToastTone, string> = { info: "[--tone:var(--s-fighting)]", good: "[--tone:var(--good)]", warn: "[--tone:var(--danger)]" };
/** Time on screen; why a run stopped takes longer to read. Paused while the pointer is over the toast. */
const STAY: Record<ToastTone, number> = { info: 3500, good: 4500, warn: 6000 };

interface Props {
  tone: ToastTone;
  title: string;
  text: string;
  onClose: () => void;
}

/** A short message that leaves by itself, or with its close button: the small notched frame with a stripe of its tone
 * down the left side. The live region around it reads it out. */
export function Toast({ tone, title, text, onClose }: Props) {
  const [held, setHeld] = useState(false);
  // The parent passes a new closure every render; the timer must not restart for it.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (held) return;
    const timer = setTimeout(() => close.current(), STAY[tone]);
    return () => clearTimeout(timer);
  }, [tone, held]);
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 w-[300px] pt-2.5 pr-1.5 pb-2.5 pl-3 bg-card-2 border-2 border-ink notch-sm pointer-events-auto animate-toast-in",
        "shadow-[inset_4px_0_0_var(--tone),var(--bevel-sm)]",
        TONE[tone],
      )}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      <span className="flex-none grid place-items-center size-[22px] mt-px bg-ink text-(--tone)" aria-hidden="true">
        <Icon name={ICON[tone]} size={12} />
      </span>
      <div className="flex-1 min-w-0 grid gap-0.5 pt-px">
        <span className="font-display font-extrabold text-[10.5px] leading-[1.3] tracking-[0.06em] uppercase text-fg-2">{title}</span>
        <span className="text-12 font-semibold leading-[1.4] text-fg wrap-anywhere">{text}</span>
      </div>
      <Button kind="ghost" small icon="close" aria-label="Đóng thông báo" onClick={onClose} />
    </div>
  );
}
