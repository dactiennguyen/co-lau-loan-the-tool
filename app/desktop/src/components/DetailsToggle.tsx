import { Icon } from "./Icon";
import "./DetailsToggle.css";

/** "Chi tiết ▾" after the title of a summary row: shows or hides what is under it (`controls`, the id of that part). */
export function DetailsToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button type="button" className="details" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      Chi tiết
      <Icon name="chevron" size={12} className={open ? "details__chev details__chev--open" : "details__chev"} />
    </button>
  );
}
