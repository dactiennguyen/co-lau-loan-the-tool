import { Icon } from "@/components/Icon";
import { useStore } from "@/store";

const day = (ms: number) => new Date(ms).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Key (license.rs) in the sidebar, over the version: until when it holds and the accounts it allows; "Đang kiểm tra
 * key…" during the check of each start, which LicenseGate does not cover. Otherwise LicenseGate covers the window. */
export function LicenseLine() {
  const license = useStore((s) => s.license);
  const count = useStore((s) => s.order.length);
  if (license?.state === "checking") {
    return (
      <div className="flex items-center gap-1.5 text-11 text-fg-3" role="status">
        <Icon name="key" size={12} className="flex-none" />
        Đang kiểm tra key… (chưa đăng nhập được nick)
      </div>
    );
  }
  if (license?.state !== "valid") return null;
  const full = count >= license.maxAccounts;
  return (
    <div
      className="flex items-center gap-1.5 text-11 text-fg-3"
      title={`Key ${license.key}, kích hoạt ${day(license.activatedAt)}, kiểm tra lần cuối ${new Date(license.checkedAt).toLocaleTimeString("vi-VN")}`}
    >
      <Icon name="key" size={12} className="flex-none" />
      <span className="flex-1 min-w-0 truncate">Key hạn {day(license.expiresAt)}</span>
      <span className={full ? "text-danger" : undefined}>
        <span className="px text-10">{count}</span>/{license.maxAccounts} nick
      </span>
    </div>
  );
}
