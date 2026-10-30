import "./Chip.css";

/** Selectable chip (a quick value). */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string | number }) {
  return (
    <button type="button" className={`chip${active ? " chip--active" : ""}`} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}
