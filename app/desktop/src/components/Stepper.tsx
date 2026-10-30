import "./Stepper.css";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}

/** Integer with − and + buttons. */
export function Stepper({ value, onChange, min = 1, max = 999, label }: Props) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Giảm ${label}`} disabled={value <= min} onClick={() => set(value - 1)}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`Tăng ${label}`} disabled={value >= max} onClick={() => set(value + 1)}>
        +
      </button>
    </div>
  );
}
