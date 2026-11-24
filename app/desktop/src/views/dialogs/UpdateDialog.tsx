import { api } from "@/api";
import { inGame, useStore } from "@/store";
import { isAndroid } from "@/utils/platform";
import { ConfirmDialog } from "./ConfirmDialog";

/** Khởi động lại để cập nhật while accounts are in the game: they are logged out and their battles cut short. */
export function UpdateDialog({ onClose }: { onClose: () => void }) {
  const playing = useStore(inGame);
  const update = useStore((s) => s.update);
  const version = update?.state === "ready" ? update.version : "mới";
  return (
    <ConfirmDialog
      title="Khởi động lại để cập nhật"
      message={
        <>
          <b>{playing} nick</b> đang trong game sẽ bị thoát, trận đang đánh bị bỏ dở. Sau khi mở lại bản {version}, đăng nhập
          lại các nick.{" "}
          {isAndroid() ? "Android mở trình cài, bấm Cài đặt ở đó." : "Không vội thì cứ để đó: bản mới tự cài khi bạn tắt app."}
        </>
      }
      confirm="Khởi động lại"
      icon="refresh"
      onConfirm={api.installUpdate}
      onClose={onClose}
    />
  );
}
