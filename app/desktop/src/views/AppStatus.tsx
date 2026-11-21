import { api } from "@/api";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { inGame, useStore } from "@/store";
import { cn } from "@/utils/cn";

const day = (ms: number) => new Date(ms).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const clock = (at: number) => new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/**
 * The key and the version of the app in two short lines, at the top right of the page beside Đăng xuất (HeroCard, and
 * EmptyState when no account is picked): until when the key holds and the accounts it allows (license.rs; "Đang kiểm
 * tra key…" during the check of each start); the version with Kiểm tra cập nhật, the download of a newer one, and once
 * it is ready Cập nhật (Khởi động lại, asking first while accounts play; the app also installs it when it quits).
 */
export function AppStatus({ className }: { className?: string }) {
  return (
    <div className={cn("grid justify-items-end gap-0.5 text-11 text-fg-3 leading-[1.35]", className)}>
      <KeyLine />
      <UpdateLine />
    </div>
  );
}

function KeyLine() {
  const license = useStore((s) => s.license);
  const count = useStore((s) => s.order.length);
  if (license?.state === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5" role="status">
        <Icon name="key" size={12} className="flex-none" />
        Đang kiểm tra key…
      </span>
    );
  }
  if (license?.state !== "valid") return null;
  const full = count >= license.maxAccounts;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      title={`Key hạn ${day(license.expiresAt)}, ${count}/${license.maxAccounts} nick. Key ${license.key}, kích hoạt ${day(license.activatedAt)}, kiểm tra lần cuối ${new Date(license.checkedAt).toLocaleTimeString("vi-VN")}`}
    >
      <Icon name="key" size={12} className="flex-none" />
      <span className="px text-10">{day(license.expiresAt)}</span>·
      <span className={full ? "text-danger" : undefined}>
        <span className="px text-10">{count}</span>/{license.maxAccounts}
      </span>
    </span>
  );
}

function UpdateLine() {
  const u = useStore((s) => s.update);
  const playing = useStore(inGame);
  if (!u) return null;
  const restart = async () => {
    if (playing) return useStore.getState().open({ kind: "update" });
    try {
      await api.installUpdate();
    } catch (e) {
      useStore.getState().toast({ tone: "warn", title: "Cập nhật", text: String(e instanceof Error ? e.message : e) });
    }
  };

  if (u.state === "ready") {
    return (
      <Button
        kind="primary"
        small
        icon="refresh"
        title={`Đang dùng ${u.current}. Bản ${u.version} tự cài khi tắt app, hay bấm để cài ngay.${u.notes.trim() ? `\n\nCó gì mới:\n${u.notes.trim()}` : ""}`}
        onClick={restart}
      >
        Cập nhật {u.version}
      </Button>
    );
  }
  if (u.state === "downloading" || u.state === "installing") {
    const part = u.state === "downloading" && u.total ? u.got / u.total : null;
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-exp" aria-live="polite">
        <Icon name="download" size={12} className="flex-none" />
        {u.state === "installing" ? `Đang cài ${u.version}…` : `Đang tải ${u.version}${part != null ? ` · ${Math.round(part * 100)}%` : ""}`}
        {part != null && <Bar value={part} fill="var(--exp)" thin className="w-[60px]" label={`Tải bản ${u.version}`} />}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="px text-10">v{u.current}</span>
      {u.state === "off" && (
        <span className="inline-flex" title={`Không tự cập nhật: ${u.reason}`} aria-label="Không tự cập nhật">
          <Icon name="lock" size={11} />
        </span>
      )}
      {u.state === "checking" && <span>· đang kiểm tra…</span>}
      {u.state === "latest" && (
        <span className="inline-flex text-good" title={`Bản mới nhất (kiểm tra lúc ${clock(u.checkedAt)})`} aria-label="Bản mới nhất">
          <Icon name="check" size={11} />
        </span>
      )}
      {u.state === "failed" && (
        <span className="text-danger" title={u.message}>
          · lỗi kiểm tra
        </span>
      )}
      {(u.state === "idle" || u.state === "latest" || u.state === "failed") && (
        <Button kind="ghost" small icon="refresh" aria-label="Kiểm tra cập nhật" className="-my-1 w-5 h-5" onClick={() => void api.checkUpdate()} />
      )}
    </span>
  );
}
