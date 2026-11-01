import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/** The parts views put in a Dialog: a line of text (its <b> brighter), a note on a dark plate, an error, the footer of
 * buttons at the right. */
export const DIALOG = {
  text: "text-fg-2 [&_b]:text-fg",
  note: "px-2.5 py-2 bg-ink text-11 text-fg-2",
  error: "text-11 text-danger",
  footer: "flex justify-end gap-1.5",
};

interface Props {
  title: string;
  subtitle?: ReactNode;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  /** On the <dialog>, for one that needs another width. */
  className?: string;
  /** On its <form>, the grid of the title and the children. */
  formClassName?: string;
  /** The fields, then a footer with the buttons. */
  children: ReactNode;
}

/** Modal form on a <dialog> in the notched frame over a dimmed page: opens on mount, Escape closes it, focus starts on
 * its first field or button. */
export function Dialog({ title, subtitle, onSubmit, onClose, className, formClassName, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={cn(
        "w-[400px] m-auto p-0 border-[length:var(--px)] border-line-strong bg-card text-fg notch bevel backdrop:bg-[rgb(15_17_21/0.8)]",
        className,
      )}
      onClose={onClose}
      onCancel={onClose}
    >
      <form className={cn("grid gap-3 p-5", formClassName)} onSubmit={onSubmit}>
        <header>
          <h2 className="font-display font-extrabold text-16 leading-[1.2] uppercase tracking-[0.04em]">{title}</h2>
          {subtitle && <p className="mt-1 mb-0 text-11 text-fg-2">{subtitle}</p>}
        </header>
        {children}
      </form>
    </dialog>
  );
}
