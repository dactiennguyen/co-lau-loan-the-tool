import { useEffect, useRef, useState } from "react";
import type { ToastTone } from "../toasts";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import "./Toast.css";

const ICON: Record<ToastTone, IconName> = { info: "play", good: "check", warn: "flag" };
/** Time on screen; why a run stopped takes longer to read. Paused while the pointer is over the toast. */
const STAY: Record<ToastTone, number> = { info: 3500, good: 4500, warn: 6000 };

interface Props {
  tone: ToastTone;
  title: string;
  text: string;
  onClose: () => void;
}

/** A short message that leaves by itself, or with its close button. The live region around it reads it out. */
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
    <div className={`toast toast--${tone}`} onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
      <span className="toast__icon" aria-hidden="true">
        <Icon name={ICON[tone]} size={12} />
      </span>
      <div className="toast__body">
        <span className="toast__title">{title}</span>
        <span className="toast__text">{text}</span>
      </div>
      <Button kind="ghost" small icon="close" aria-label="Đóng thông báo" onClick={onClose} />
    </div>
  );
}
