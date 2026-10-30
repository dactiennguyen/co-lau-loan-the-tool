import { useState } from "react";
import { api } from "./api";
import { useAppState, useLog } from "./hooks";
import { AccountDialog } from "./views/AccountDialog";
import { AccountPage } from "./views/AccountPage";
import { ConfirmDialog } from "./views/ConfirmDialog";
import { EmptyState } from "./views/EmptyState";
import { Sidebar } from "./views/Sidebar";
import "./App.css";

/** Sidebar of accounts, the selected account, the add/edit dialog and the question before removing an account. */
export default function App() {
  const { accounts, accountsError, ready } = useAppState();
  const [chosen, setChosen] = useState<number | null>(null);
  // "new" for "Thêm nick", an account id for "Sửa nick".
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  // The chosen account while it exists, else the first one.
  const account = accounts.find((a) => a.id === chosen) ?? accounts[0];
  const log = useLog(account?.id ?? null);
  const edited = accounts.find((a) => a.id === editing);
  const removed = accounts.find((a) => a.id === removing);

  return (
    <div className="app">
      <Sidebar
        accounts={accounts}
        error={accountsError}
        selected={account?.id ?? null}
        onSelect={setChosen}
        onAdd={() => setEditing("new")}
        onLogin={api.login}
        onLogout={api.logout}
        onEdit={setEditing}
        onRemove={setRemoving}
        onLoginAll={api.loginAll}
        onLogoutAll={api.logoutAll}
      />
      <main className="main">
        <div className="main__drag" data-tauri-drag-region />
        {account ? (
          <AccountPage
            key={account.id}
            account={account}
            log={log}
            onLogin={() => api.login(account.id)}
            onLogout={() => api.logout(account.id)}
            onRemove={() => setRemoving(account.id)}
            onFight={(target, count, losses) => api.fight(account.id, target, count, losses)}
            onQuest={(losses) => api.quest(account.id, losses)}
            onStop={() => api.stop(account.id)}
          />
        ) : (
          ready && <EmptyState onAdd={() => setEditing("new")} />
        )}
      </main>
      {(editing === "new" || edited) && (
        <AccountDialog
          account={edited}
          onClose={() => setEditing(null)}
          onSave={async (form) => {
            if (edited) await api.updateAccount(edited.id, form);
            else setChosen(await api.addAccount(form));
            setEditing(null);
          }}
        />
      )}
      {removed && (
        <ConfirmDialog
          title="Xoá nick"
          message={
            <>
              Xoá <b>{removed.label}</b> khỏi danh sách? Mật khẩu đã lưu của nick này cũng bị xoá.
            </>
          }
          confirm="Xoá nick"
          onConfirm={() => api.removeAccount(removed.id)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
