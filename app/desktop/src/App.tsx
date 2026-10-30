import { useState } from "react";
import { api } from "./api";
import { useAppState, useLog } from "./hooks";
import { AccountPage } from "./views/AccountPage";
import { AddAccountDialog } from "./views/AddAccountDialog";
import { EmptyState } from "./views/EmptyState";
import { Sidebar } from "./views/Sidebar";
import "./App.css";

/** Sidebar of accounts, the selected account, and the add-account dialog. */
export default function App() {
  const { accounts, accountsPath, accountsError, ready } = useAppState();
  const [chosen, setChosen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  // The chosen account while it exists, else the first one.
  const account = accounts.find((a) => a.id === chosen) ?? accounts[0];
  const log = useLog(account?.id ?? null);

  return (
    <div className="app">
      <Sidebar
        accounts={accounts}
        error={accountsError}
        selected={account?.id ?? null}
        onSelect={setChosen}
        onAdd={() => setAdding(true)}
        onLogin={api.login}
        onLogout={api.logout}
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
            onRemove={() => api.removeAccount(account.id)}
            onFight={(target, count, losses) => api.fight(account.id, target, count, losses)}
            onStop={() => api.stop(account.id)}
          />
        ) : (
          ready && <EmptyState onAdd={() => setAdding(true)} />
        )}
      </main>
      {adding && (
        <AddAccountDialog
          accountsPath={accountsPath}
          onClose={() => setAdding(false)}
          onSave={async (a) => {
            setChosen(await api.addAccount(a));
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
