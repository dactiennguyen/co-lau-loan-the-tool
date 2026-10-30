import { useId, type InputHTMLAttributes } from "react";
import "./TextField.css";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

/** Input with a visible label and an optional hint under it. */
export function TextField({ label, hint, ...input }: Props) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} spellCheck={false} autoComplete="off" {...input} />
      {hint && <small>{hint}</small>}
    </div>
  );
}
