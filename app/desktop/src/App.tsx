import { api } from "./api";
import { useSync } from "./hooks";
import { selectedAccount, useStore } from "./store";
import { AccountDialog } from "./views/AccountDialog";
import { AccountPage } from "./views/AccountPage";
import { ConfirmDialog } from "./views/ConfirmDialog";
import { EmptyState } from "./views/EmptyState";
import { Sidebar } from "./views/Sidebar";
import { StopDialog } from "./views/StopDialog";
import { Toaster } from "./views/Toaster";
import "./App.css";

/** Sidebar of accounts, the selected account, the dialog the store says is open, and the toasts. */
export default function App() {
  useSync();
  const ready = useStore((s) => s.ready);
  const account = useStore(selectedAccount);
  const open = useStore((s) => s.open);
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <div className="main__drag" data-tauri-drag-region />
        {account ? <AccountPage key={account.id} account={account} /> : ready && <EmptyState onAdd={() => open({ kind: "add" })} />}
      </main>
      <Dialogs />
      <Toaster />
    </div>
  );
}

/** "Thêm nick", "Sửa nick", the question before removing one, and Dừng during a battle; nothing once the account it is
 * about is gone. */
function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  const account = useStore((s) => (dialog && dialog.kind !== "add" ? s.byId[dialog.id] : undefined));
  const { close, select } = useStore.getState();
  if (dialog?.kind === "add" || (dialog?.kind === "edit" && account)) {
    return (
      <AccountDialog
        account={account}
        onClose={close}
        onSave={async (form) => {
          if (account) await api.updateAccount(account.id, form);
          else select(await api.addAccount(form));
          close();
        }}
      />
    );
  }
  if (dialog?.kind === "stop" && account) {
    return <StopDialog account={account} onClose={close} />;
  }
  if (dialog?.kind === "remove" && account) {
    return (
      <ConfirmDialog
        title="Xoá nick"
        message={
          <>
            Xoá <b>{account.label}</b> khỏi danh sách? Mật khẩu đã lưu của nick này cũng bị xoá.
          </>
        }
        confirm="Xoá nick"
        onConfirm={() => api.removeAccount(account.id)}
        onClose={close}
      />
    );
  }
  return null;
}
