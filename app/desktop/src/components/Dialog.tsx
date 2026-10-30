import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import "./Dialog.css";

interface Props {
  title: string;
  subtitle?: ReactNode;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  /** The fields, then a footer with the buttons. */
  children: ReactNode;
}

/** Modal form on a <dialog>: opens on mount, Escape closes it, focus starts on its first field or button. */
export function Dialog({ title, subtitle, onSubmit, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={onSubmit}>
        <header>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </header>
        {children}
      </form>
    </dialog>
  );
}
