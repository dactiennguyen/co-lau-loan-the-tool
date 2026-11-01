import { api } from "@/api";
import { Button } from "@/components/Button";
import { DIALOG, Dialog } from "@/components/Dialog";
import { num } from "@/utils/format";
import type { Account } from "@/api/types";

interface Props {
  account: Account;
  onClose: () => void;
}

/**
 * "Dừng" while a battle is on: the job or quest run stops either way, and the battle is played out or left as the game's
 * Đầu hàng does (Bot::stop in cllt-core). Focus starts on Huỷ, so Enter alone closes it and no key alone costs EXP.
 */
export function StopDialog({ account, onClose }: Props) {
  const b = account.character?.battle;
  const ask = b?.leaving
    ? "Đang chờ server nhận đầu hàng (tối đa 8 s, không được thì đánh tiếp)."
    : "Việc của nick dừng ngay; còn trận này thì sao?";
  const stop = (surrender: boolean) => {
    api.stop(account.id, surrender);
    onClose();
  };
  return (
    <Dialog
      title="Dừng giữa trận"
      subtitle={account.label}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        stop(false);
      }}
    >
      <p className={DIALOG.text}>
        {b ? (
          <>
            Đang đánh <b>{b.mobName}</b>: HP mình {num(b.hp)}/{num(b.maxHp)}
            {b.mobHp != null && (
              <>
                , quái {num(b.mobHp)}/{num(b.mobMaxHp)}
              </>
            )}
            , {b.turns} lượt. {ask}
          </>
        ) : (
          <>Trận vừa xong. Việc của nick sẽ dừng.</>
        )}
      </p>
      <p className={DIALOG.note}>
        <b>Đợi xong trận</b>: bot đánh nốt, trận vẫn được tính. <b>Đầu hàng</b>: rời trận ngay như nút Đầu hàng trong game, mất
        một ít EXP (29 EXP ở lần đo B3) và trang bị mòn thêm; trận không được tính.
      </p>
      <footer className={DIALOG.footer}>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button kind="tonal" type="submit" icon="clock">
          Đợi xong trận
        </Button>
        <Button kind="danger" icon="flag" disabled={!b || b.leaving} onClick={() => stop(true)}>
          Đầu hàng
        </Button>
      </footer>
    </Dialog>
  );
}
