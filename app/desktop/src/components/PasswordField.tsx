import { useId, useState, type InputHTMLAttributes } from "react";
import { Icon } from "./Icon";
import "./TextField.css";
import "./PasswordField.css";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
}

/** TextField for a password, hidden until the eye button at its end shows it; pressing it again hides it. */
export function PasswordField({ label, hint, disabled, ...input }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const say = shown ? "Ẩn mật khẩu" : "Hiện mật khẩu";
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password">
        <input id={id} type={shown ? "text" : "password"} spellCheck={false} autoComplete="off" disabled={disabled} {...input} />
        <button type="button" className="password__eye" aria-label={say} title={say} aria-pressed={shown} disabled={disabled} onClick={() => setShown((s) => !s)}>
          <Icon name={shown ? "eyeOff" : "eye"} size={15} />
        </button>
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}
