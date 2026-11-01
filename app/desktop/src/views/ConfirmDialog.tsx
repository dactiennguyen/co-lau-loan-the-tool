import { useState, type ReactNode } from "react";
import { Button } from "../components/Button";
import { DIALOG, Dialog } from "../components/Dialog";
import type { IconName } from "../components/Icon";

interface Props {
  title: string;
  message: ReactNode;
  /** Label of the button that does it, and its icon (a bin by default). */
  confirm: string;
  icon?: IconName;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Asks before something that cannot be undone; focus starts on Huỷ, so Enter alone does nothing harmful. It closes once
 * `onConfirm` resolves; a rejection stays on screen with its message, so a failure never looks like success.
 */
export function ConfirmDialog({ title, message, confirm, icon = "trash", onConfirm, onClose }: Props) {
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
      <p className={DIALOG.text}>{message}</p>
      {error && (
        <p className={DIALOG.error} role="alert">
          {error}
        </p>
      )}
      <footer className={DIALOG.footer}>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button kind="danger" type="submit" icon={icon} disabled={busy}>
          {confirm}
        </Button>
      </footer>
    </Dialog>
  );
}
