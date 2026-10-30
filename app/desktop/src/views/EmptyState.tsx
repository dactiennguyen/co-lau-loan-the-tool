import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import "./EmptyState.css";

/** Shown before the first account is added. */
export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty">
      <span className="empty__logo">
        <Icon name="flag" size={40} />
      </span>
      <h1>Thêm nick đầu tiên để bắt đầu</h1>
      <p>Mỗi nick đăng nhập bằng một kết nối riêng. Tài khoản chỉ lưu trên máy này.</p>
      <Button kind="primary" icon="plus" onClick={onAdd}>
        Thêm nick
      </Button>
    </div>
  );
}
