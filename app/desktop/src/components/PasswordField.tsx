import { useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "../cn";
import { Icon } from "./Icon";
import { FIELD } from "./TextField";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
}

/** TextField for a password, hidden until the eye button at its end shows it; pressing it again hides it. */
export function PasswordField({ label, hint, disabled, className, ...input }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const say = shown ? "Ẩn mật khẩu" : "Hiện mật khẩu";
  return (
    <div className={cn(FIELD.root, className)}>
      <label htmlFor={id} className={FIELD.label}>
        {label}
      </label>
      {/* The eye button sits inside the right end of the input, which leaves room for it. */}
      <div className="relative min-w-0">
        <input
          id={id}
          type={shown ? "text" : "password"}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          className={cn(FIELD.input, "w-full min-w-0 pr-9")}
          {...input}
        />
        <button
          type="button"
          className={cn(
            "absolute top-0.5 right-0.5 bottom-0.5 w-8 grid place-items-center p-0 border-0 bg-transparent text-fg-3 cursor-pointer",
            "hover:text-fg hover:bg-bg-2 aria-pressed:text-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
          aria-label={say}
          title={say}
          aria-pressed={shown}
          disabled={disabled}
          onClick={() => setShown((s) => !s)}
        >
          <Icon name={shown ? "eyeOff" : "eye"} size={15} />
        </button>
      </div>
      {hint && <small className={FIELD.hint}>{hint}</small>}
    </div>
  );
}
