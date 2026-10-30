import { Toast } from "../components/Toast";
import { useStore } from "../store";
import "./Toaster.css";

/** The toasts of the store over the lower right corner, newest at the bottom. Always in the page, so a screen reader
 * hears each toast added to it. */
export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismiss);
  return (
    <div className="toaster" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <Toast key={t.id} tone={t.tone} title={t.title} text={t.text} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
