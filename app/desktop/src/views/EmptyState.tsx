import { Button } from "@/components/Button";
import appIcon from "../../app-icon.png";
import { AppStatus } from "./AppStatus";

/** Shown before the first account is added. */
export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="relative h-full grid place-content-center justify-items-center gap-2.5 text-center">
      <AppStatus className="absolute top-0 right-0" />
      <img className="block size-[72px] mb-1.5 object-contain [image-rendering:pixelated]" src={appIcon} alt="" draggable={false} />
      <h1 className="font-display font-extrabold text-18 leading-[1.2] uppercase tracking-[0.04em]">Thêm nick đầu tiên để bắt đầu</h1>
      <p className="mb-1.5 text-fg-2">Mỗi nick đăng nhập bằng một kết nối riêng. Tài khoản chỉ lưu trên máy này.</p>
      <Button kind="primary" icon="plus" onClick={onAdd}>
        Thêm nick
      </Button>
    </div>
  );
}
