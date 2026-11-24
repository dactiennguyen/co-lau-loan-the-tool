import { useEffect, useRef, type FormEvent, type ReactNode, type SyntheticEvent } from "react";
import { cn } from "@/utils/cn";
import { useBack } from "@/hooks/useBack";
import { Button } from "./Button";

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
 * its first field or button. On a phone it takes the whole screen (whatever width or height the view asks), its form
 * scrolls, ✕ at the top right closes it, and so does Android's Back (useBack). */
export function Dialog({ title, subtitle, onSubmit, onClose, className, formClassName, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  // React bubbles cancel and close up its own tree, portals included: Escape in a confirm box opened from this dialog,
  // or a file picker dismissed in it, would close this one too. Only this dialog's own events close it.
  const own = (e: SyntheticEvent) => {
    if (e.target === e.currentTarget) onClose();
  };
  useBack(true, onClose);
  return (
    <dialog
      ref={dialog}
      className={cn(
        "w-[400px] m-auto p-0 border-[length:var(--px)] border-line-strong bg-card text-fg notch bevel backdrop:bg-[rgb(15_17_21/0.8)]",
        className,
        // A phone: the whole screen, out of Android's bars, over whatever size the view asked for.
        "phone:w-full phone:max-w-none phone:h-full phone:max-h-none phone:m-0 phone:border-0 phone:[clip-path:none] phone:shadow-none",
        "phone:pt-[env(safe-area-inset-top)] phone:pb-[env(safe-area-inset-bottom)]",
      )}
      onClose={own}
      onCancel={own}
    >
      <form
        className={cn("grid gap-3 p-5", formClassName, "phone:h-full phone:max-h-none phone:box-border phone:px-3.5 phone:py-3 phone:overflow-y-auto phone:grid-cols-[minmax(0,1fr)]",
          // A phone: the parts one under the other from the top, the whole form scrolling (not the rows a view set for
          // a desktop window, which would squeeze a list to nothing), its buttons kept at the bottom of the screen.
          "phone:grid-rows-none phone:content-start",
          "phone:[&_footer]:sticky phone:[&_footer]:bottom-0 phone:[&_footer]:z-1 phone:[&_footer]:py-2 phone:[&_footer]:bg-card")}
        onSubmit={onSubmit}
      >
        <header className="phone:grid phone:grid-cols-[minmax(0,1fr)_auto] phone:items-start phone:gap-2">
          <div>
            <h2 className="font-display font-extrabold text-16 leading-[1.2] uppercase tracking-[0.04em]">{title}</h2>
            {subtitle && <p className="mt-1 mb-0 text-11 text-fg-2">{subtitle}</p>}
          </div>
          <Button kind="ghost" icon="close" aria-label="Đóng" className="hidden phone:inline-flex -mt-1 -mr-1.5" onClick={onClose} />
        </header>
        {children}
      </form>
    </dialog>
  );
}
