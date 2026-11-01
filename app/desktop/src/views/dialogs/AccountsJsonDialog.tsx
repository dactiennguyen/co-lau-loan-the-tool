import { useId, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { TabPanel, Tabs, type Tab } from "@/components/Tabs";
import { useStore } from "@/store";
import { ExportAccountsPage } from "./ExportAccountsPage";
import { ImportAccountsPage } from "./ImportAccountsPage";

type Page = "import" | "export";
const PAGES: Tab<Page>[] = [
  { key: "import", label: "Nhập", icon: "download" },
  { key: "export", label: "Xuất", icon: "upload" },
];
const SUBTITLE: Record<Page, string> = {
  import: "Dán JSON đã xuất, hoặc chọn file",
  export: "Tài khoản, mật khẩu và cài đặt của app",
};

/** One page of the tabs. Both sit in the same grid cell, the hidden one inert and invisible, so the dialog is as tall as
 * the taller page and does not jump when the tab changes; each page keeps what was typed or ticked on it. */
const PAGE = "[grid-area:1/1] flex flex-col gap-3 min-w-0 inert:invisible";

/**
 * Nhập / Xuất JSON of the Tài khoản list (backup.rs of src-tauri), behind the one button at the right of the heading
 * TÀI KHOẢN in the sidebar, in two tabs. It opens on Xuất when there are accounts, else on Nhập.
 */
export function AccountsJsonDialog({ onClose }: { onClose: () => void }) {
  const any = useStore((s) => s.order.length > 0);
  const [page, setPage] = useState<Page>(any ? "export" : "import");
  const id = useId();

  return (
    <Dialog title="Nhập / Xuất JSON" subtitle={SUBTITLE[page]} onSubmit={(e) => e.preventDefault()} onClose={onClose} className="w-[min(520px,92vw)]">
      <Tabs id={`${id}tabs`} tabs={PAGES} value={page} onChange={setPage} label="Nhập hay xuất" />
      <TabPanel id={`${id}tabs`} value={page}>
        <div className="grid min-w-0">
          <div className={PAGE} inert={page !== "import"}>
            <ImportAccountsPage onClose={onClose} />
          </div>
          <div className={PAGE} inert={page !== "export"}>
            <ExportAccountsPage active={page === "export"} onClose={onClose} />
          </div>
        </div>
      </TabPanel>
    </Dialog>
  );
}
