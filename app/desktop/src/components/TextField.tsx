import { useId, type InputHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

/** The parts of a labelled field, TextField's and PasswordField's: the label over a dark input that lights its frame
 * while it has the focus, a hint under it. */
export const FIELD = {
  root: "grid gap-[5px]",
  label: "text-11 font-bold text-fg-2",
  input:
    "h-[34px] px-2.5 py-0 border-2 border-line bg-ink text-fg text-13 outline-none select-text placeholder:text-fg-3 focus:border-ring",
  hint: "text-10 text-fg-3",
};

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  /** On its <input>; `className` goes on the field around the label, the input and the hint. */
  inputClassName?: string;
}

/** Input with a visible label and an optional hint under it. */
export function TextField({ label, hint, className, inputClassName, ...input }: Props) {
  const id = useId();
  return (
    <div className={cn(FIELD.root, className)}>
      <label htmlFor={id} className={FIELD.label}>
        {label}
      </label>
      <input id={id} spellCheck={false} autoComplete="off" className={cn(FIELD.input, inputClassName)} {...input} />
      {hint && <small className={FIELD.hint}>{hint}</small>}
    </div>
  );
}
