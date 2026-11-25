import { api } from "@/api";
import { useSync } from "@/hooks/useSync";
import { selectedAccount, useStore } from "@/store";
import { AccountDialog } from "@/views/dialogs/AccountDialog";
import { AccountPage } from "@/views/AccountPage";
import { CloseDialog } from "@/views/dialogs/CloseDialog";
import { ConfirmDialog } from "@/views/dialogs/ConfirmDialog";
import { PlaceDialog } from "@/views/dialogs/PlaceDialog";
import { ReportDialog } from "@/views/dialogs/ReportDialog";
import { SettingsDialog } from "@/views/dialogs/SettingsDialog";
import { AccountsJsonDialog } from "@/views/dialogs/AccountsJsonDialog";
import { QrAccountsDialog } from "@/views/dialogs/QrAccountsDialog";
import { BachHoModal } from "@/views/BachHoModal";
import { useBack } from "@/hooks/useBack";
import { usePhone } from "@/hooks/usePhone";
import { SkillsModal } from "@/views/SkillsModal";
import { StatsModal } from "@/views/StatsModal";
import { ShopModal } from "@/views/shop/ShopModal";
import { WelfareModal } from "@/views/WelfareModal";
import { EmptyState } from "@/views/EmptyState";
import { Sidebar } from "@/views/Sidebar";
import { StatPlanDialog } from "@/views/dialogs/StatPlanDialog";
import { StopDialog } from "@/views/dialogs/StopDialog";
import { Toaster } from "@/views/Toaster";
import { UpdateDialog } from "@/views/dialogs/UpdateDialog";
import { UpdateGate } from "@/views/UpdateGate";
import { CaptchaGate } from "@/views/dialogs/CaptchaDialog";
import { LicenseGate } from "@/views/LicenseGate";

/** Sidebar of accounts, the selected account, the dialog the store says is open, the toasts, and the cover of a
 * mandatory update. */
export default function App() {
  useSync();
  const ready = useStore((s) => s.ready);
  const account = useStore(selectedAccount);
  const open = useStore((s) => s.open);
  // A phone: two screens, the accounts (the sidebar, the whole width) then the account chosen; Back goes to the list.
  const phone = usePhone();
  const onAccount = useStore((s) => s.phoneView === "account") && !!account;
  useBack(phone && onAccount, useStore.getState().showList);
  const page = account ? <AccountPage key={account.id} account={account} /> : ready && <EmptyState onAdd={() => open({ kind: "add" })} />;
  return (
    <div className="grid grid-cols-[252px_minmax(0,1fr)] h-screen phone:grid-cols-1 phone:h-full">
      {(!phone || !onAccount) && <Sidebar />}
      {(!phone || onAccount) && (
        <main className="relative min-w-0 min-h-0 overflow-auto pt-[30px] px-4 pb-4 not-mac:pt-4 phone:p-0 phone:pt-0 phone:overflow-hidden">
          {/* No display class: the base layer of tailwind.css hides the drag strips outside macOS. */}
          <div className="absolute inset-x-0 top-0 h-7 phone:hidden" data-tauri-drag-region />
          {page}
        </main>
      )}
      <Dialogs />
      <Toaster />
      {/* Xác nhận người chơi: a captcha the server asked of an account, above the other dialogs. */}
      <CaptchaGate />
      {/* Until a key holds (license.rs) no account logs in; under UpdateGate, as an update needs no key. */}
      <LicenseGate />
      {/* Last, so that it opens above any dialog: a newer version is mandatory. */}
      <UpdateGate />
    </div>
  );
}

/** "Thêm nick", "Sửa nick", Bạch Hổ, the question before removing one, Dừng during a battle, Đổi khu / map, Tiện ích,
 * Báo lỗi, Khởi động lại để cập nhật while accounts play, the Cài đặt of the app and Đóng cửa sổ; nothing once the
 * account it is about is gone. */
function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  const account = useStore((s) => (dialog && "id" in dialog ? s.byId[dialog.id] : undefined));
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
  if (dialog?.kind === "update") {
    return <UpdateDialog onClose={close} />;
  }
  if (dialog?.kind === "settings") {
    return <SettingsDialog onClose={close} />;
  }
  if (dialog?.kind === "accountsJson") {
    return <AccountsJsonDialog onClose={close} />;
  }
  if (dialog?.kind === "qr") {
    return <QrAccountsDialog onClose={close} />;
  }
  if (dialog?.kind === "bachHo") {
    return <BachHoModal onClose={close} />;
  }
  if (dialog?.kind === "close") {
    // Huỷ, or the window back from the tray, finds the dialog that was open.
    const back = dialog.back;
    return <CloseDialog onClose={() => (back ? useStore.getState().open(back) : close())} />;
  }
  if (dialog?.kind === "stop" && account) {
    return <StopDialog account={account} onClose={close} />;
  }
  if (dialog?.kind === "stats" && account) {
    return <StatPlanDialog account={account} onClose={close} />;
  }
  if (dialog?.kind === "place" && account) {
    return <PlaceDialog account={account} onClose={close} />;
  }
  if (dialog?.kind === "report" && account) {
    return <ReportDialog account={account} onClose={close} />;
  }
  if (dialog?.kind === "skills" && account) {
    return <SkillsModal account={account} onClose={close} />;
  }
  if (dialog?.kind === "welfare" && account) {
    return <WelfareModal account={account} onClose={close} />;
  }
  if (dialog?.kind === "battles" && account) {
    return <StatsModal account={account} onClose={close} />;
  }
  if (dialog?.kind === "shop" && account) {
    return <ShopModal account={account} item={dialog.item} sub={dialog.sub} onClose={close} />;
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
