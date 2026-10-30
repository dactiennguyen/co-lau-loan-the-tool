import { Button } from "../components/Button";
import appIcon from "../../app-icon.png";
import "./EmptyState.css";

/** Shown before the first account is added. */
export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty">
      <img className="empty__logo" src={appIcon} alt="" draggable={false} />
      <h1>Thêm nick đầu tiên để bắt đầu</h1>
      <p>Mỗi nick đăng nhập bằng một kết nối riêng. Tài khoản chỉ lưu trên máy này.</p>
      <Button kind="primary" icon="plus" onClick={onAdd}>
        Thêm nick
      </Button>
    </div>
  );
}
