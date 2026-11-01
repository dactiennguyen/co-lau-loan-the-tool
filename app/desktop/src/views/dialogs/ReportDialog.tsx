import { useId, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { DIALOG, Dialog } from "@/components/Dialog";
import { FIELD } from "@/components/TextField";
import { cn } from "@/utils/cn";
import { isConnected } from "@/utils/format";
import { useStore } from "@/store";
import type { Account } from "@/api/types";

interface Props {
  account: Account;
  onClose: () => void;
}

/**
 * Báo lỗi of the Nhật ký card: what the user did and saw, kept in Log lỗi with the account's last log lines and, while it
 * is in the game, the commands and packets just before (App::report). Xuất it from Cài đặt › Log lỗi.
 */
export function ReportDialog({ account, onClose }: Props) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const id = useId();
  const online = isConnected(account.status);
  return (
    <Dialog
      title="Báo lỗi"
      subtitle={account.label}
      className="w-[min(460px,92vw)]"
      onClose={onClose}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api.reportFault(account.id, note);
          useStore.getState().toast({ tone: "good", title: account.label, text: "Đã lưu báo lỗi. Xuất ở Cài đặt › Log lỗi để gửi đi." });
          onClose();
        } catch (err) {
          setError(String(err instanceof Error ? err.message : err));
          setSaving(false);
        }
      }}
    >
      <div className={FIELD.root}>
        <label htmlFor={id} className={FIELD.label}>
          Bạn vừa làm gì, và thấy lỗi gì?
        </label>
        <textarea
          id={id}
          autoFocus
          rows={4}
          maxLength={2000}
          spellCheck={false}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="vd. Dùng Trứng Gà: túi vẫn còn trứng, bấm lại thì báo Vật phẩm không đủ số lượng"
          className={cn(FIELD.input, "h-auto min-h-[92px] py-2 leading-[1.45] resize-y")}
        />
      </div>
      <p className={DIALOG.note}>
        Lưu kèm 60 dòng nhật ký gần nhất và thông tin nhân vật
        {online ? ", cùng các lệnh và gói tin gần nhất của nick" : " (nick chưa vào game nên không có gói tin)"}. Không lưu mật khẩu
        hay proxy. Xuất ở <b className="text-fg">Cài đặt › Log lỗi</b>.
      </p>
      {error && (
        <p className={DIALOG.error} role="alert">
          {error}
        </p>
      )}
      <footer className={DIALOG.footer}>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button kind="primary" type="submit" icon="bug" disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu báo lỗi"}
        </Button>
      </footer>
    </Dialog>
  );
}
