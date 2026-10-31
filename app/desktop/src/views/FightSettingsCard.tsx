import { useEffect, useId, useState, type ReactNode } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Hint } from "../components/Hint";
import { Icon, type IconName } from "../components/Icon";
import { num } from "../format";
import { useStore } from "../store";
import type { Account, FightSettings, Item } from "../types";
import "./FightSettingsCard.css";

/** Item id of the Búa Sửa Chữa. */
const HAMMER = 2;

interface SettingProps {
  id: string;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
  icon: IconName;
  title: string;
  /** What the setting does, behind its "?". */
  hint: string;
  /** What the bot sees for it, beside the name. */
  children?: ReactNode;
}

/** One setting on one dark row: the box, its name and the space up to Bật/Tắt toggle it; the "?" between them only
 * explains. */
function Setting({ id, on, disabled, onChange, icon, title, hint, children }: SettingProps) {
  return (
    <div className={`setting${on ? " setting--on" : ""}`}>
      <div className="setting__row">
        <input id={id} type="checkbox" checked={on} disabled={disabled} aria-describedby={`${id}-hint`} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id} className="setting__pick">
          <span className="setting__box" aria-hidden="true">
            <Icon name="check" size={12} />
          </span>
          <span className="setting__icon" aria-hidden="true">
            <Icon name={icon} size={14} />
          </span>
          <span className="setting__title">{title}</span>
        </label>
        <Hint label={`${title} là gì?`} id={`${id}-hint`}>
          {hint}
        </Hint>
        {children && <span className="setting__facts">{children}</span>}
        <label htmlFor={id} className="setting__state" aria-hidden="true">
          {on ? "Bật" : "Tắt"}
        </label>
      </div>
    </div>
  );
}

/**
 * Cài đặt tab: what the bot does on its own around the battles it plays (FightSettings of cllt-core), per account. A
 * change is saved to accounts.json and reaches a session at once; it shows as chosen while it saves. Beside Tự sửa đồ,
 * once in the game: the hammers of the bag and the worn items that are broken, with Mua búa when none is left (the bot
 * never buys one itself). Tự nhặt đồ is on unless turned off.
 */
export function FightSettingsCard({ account }: { account: Account }) {
  const c = account.character;
  const saved = account.fightSettings;
  const open = useStore((s) => s.open);
  const id = useId();
  const [saving, setSaving] = useState<FightSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept until the account comes back with it, so the box does not flick back between the answer and the update.
  useEffect(() => {
    if (saving && saving.repair === saved.repair && saving.pickup === saved.pickup) setSaving(null);
  }, [saving, saved]);
  const settings = saving ?? saved;
  const save = (next: FightSettings) => {
    setSaving(next);
    setError(null);
    api.setFight(account.id, next).catch((err) => {
      setSaving(null);
      setError(String(err?.message ?? err));
    });
  };
  const hammers = c?.bag?.items.filter((i) => i.id === HAMMER).reduce((n, i) => n + Math.max(1, i.quantity), 0) ?? 0;
  const broken = (c?.gear ?? []).filter((g): g is Item & { durability: [number, number] } => g?.durability?.[0] === 0);
  return (
    <Card title="Cài đặt đánh" icon="settings" tone="var(--primary)" subtitle="Bot làm theo khi tự đánh quái và tự làm nhiệm vụ" className="settings">
      <Setting
        id={`${id}repair`}
        on={settings.repair}
        disabled={!!saving}
        onChange={(repair) => save({ ...settings, repair })}
        icon="hammer"
        title="Tự sửa đồ"
        hint="Trước mỗi trận, món đang mặc bị hỏng (độ bền 0) được sửa bằng Búa Sửa Chữa trong túi, mỗi lần 1 búa. Hết búa thì vẫn đánh tiếp, bot không tự mua búa."
      >
        {c && (
          <>
            <span className="setting__fact">
              <Icon name="hammer" size={12} />
              Búa trong túi <b className="px">{num(hammers)}</b>
            </span>
            <span className={`setting__fact${broken.length ? " setting__fact--bad" : ""}`}>
              <Icon name={broken.length ? "close" : "check"} size={12} />
              {broken.length ? `Đang hỏng: ${broken.map((g) => `${g.name} 0/${g.durability[1]}`).join(", ")}` : "Không có món nào hỏng"}
            </span>
            {hammers === 0 && (
              <Button kind="outline" small icon="cart" onClick={() => open({ kind: "shop", id: account.id, item: HAMMER })}>
                Mua búa
              </Button>
            )}
          </>
        )}
      </Setting>
      <Setting
        id={`${id}pickup`}
        on={settings.pickup}
        disabled={!!saving}
        onChange={(pickup) => save({ ...settings, pickup })}
        icon="gem"
        title="Tự nhặt đồ"
        hint="Sau mỗi trận thắng, bot nhặt ngay đồ của mình vừa rơi (Xu khóa, đá, trang bị…) từ chỗ đang đứng, không cần đi tới hòm. Không nhặt đồ người khác làm rơi. Đồ nhặt được ghi ở Nhật ký, loại Vật phẩm."
      />
      {error && (
        <p className="settings__error selectable" role="alert">
          Chưa lưu được: {error}
        </p>
      )}
    </Card>
  );
}
