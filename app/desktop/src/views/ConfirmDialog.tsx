import { useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";

interface Props {
  title: string;
  message: ReactNode;
  /** Label of the button that does it. */
  confirm: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Asks before something that cannot be undone; focus starts on Huỷ, so Enter alone does nothing harmful. It closes once
 * `onConfirm` resolves; a rejection stays on screen with its message, so a failure never looks like success.
 */
export function ConfirmDialog({ title, message, confirm, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      title={title}
      onClose={onClose}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onConfirm();
          onClose();
        } catch (err) {
          setError(String(err instanceof Error ? err.message : err));
          setBusy(false);
        }
      }}
    >
      <p className="dialog__text">{message}</p>
      {error && (
        <p className="dialog__error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button kind="danger" type="submit" icon="trash" disabled={busy}>
          {confirm}
        </Button>
      </footer>
    </Dialog>
  );
}
